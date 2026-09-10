import L from "leaflet";

export type TripPlannerSession = {
  access_token: string;
  user: { email?: string };
};

export type TripPlannerPlace = {
  id: number;
  prefecture: string;
  municipality: string | null;
  latitude: number;
  longitude: number;
  place_translations: Array<{ locale: string; name: string }>;
};

type TripStop = {
  id: number;
  place_id: number | null;
  position: number;
  custom_name: string | null;
  planned_time: string | null;
  notes: string | null;
};

type TripDay = {
  id: number;
  day_number: number;
  date: string | null;
  overnight_city: string | null;
  lodging_name: string | null;
  lodging_url: string | null;
  notes: string | null;
  trip_stops: TripStop[];
};

type TripBooking = {
  id: number;
  kind: "lodging" | "transport" | "admission" | "other";
  title: string;
  status: "planned" | "booked" | "paid";
  date: string | null;
  url: string | null;
  notes: string | null;
  position: number;
};

type Trip = {
  id: number;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: "idea" | "planning" | "booked" | "completed";
  notes: string | null;
  updated_at: string;
  trip_days: TripDay[];
  trip_bookings: TripBooking[];
};

type TripPlannerOptions = {
  app: HTMLDivElement;
  session: TripPlannerSession;
  supabaseUrl: string;
  supabaseKey: string;
  places: TripPlannerPlace[];
  onShowPlaces: () => void;
  onLogout: () => void;
};

const STATUS_LABELS: Record<Trip["status"], string> = {
  idea: "Идея",
  planning: "Планирую",
  booked: "Забронировано",
  completed: "Завершена",
};
const BOOKING_KIND_LABELS: Record<TripBooking["kind"], string> = {
  lodging: "Отель / жильё",
  transport: "Транспорт",
  admission: "Входной билет",
  other: "Другое",
};
const BOOKING_STATUS_LABELS: Record<TripBooking["status"], string> = {
  planned: "Нужно оформить",
  booked: "Забронировано",
  paid: "Куплено / оплачено",
};
let activeTripMap: L.Map | undefined;
let savedTripMapView: { tripId: number; center: L.LatLngTuple; zoom: number } | undefined;

function destroyTripMap(): void {
  activeTripMap?.remove();
  activeTripMap = undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

function placeName(place: TripPlannerPlace): string {
  return place.place_translations.find((translation) => translation.locale === "ru")?.name
    ?? place.place_translations[0]?.name
    ?? `Место #${place.id}`;
}

function resolvePlaceId(value: string, places: Map<number, TripPlannerPlace>): number | null {
  const explicitId = Number(value.match(/^#(\d+)/)?.[1] || 0);
  if (explicitId && places.has(explicitId)) return explicitId;
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("ru");
  if (!normalized) return null;
  const matches = [...places.values()].filter((place) => {
    const name = placeName(place).normalize("NFKC").toLocaleLowerCase("ru");
    return name === normalized || name.includes(normalized);
  });
  return matches.length === 1 ? matches[0].id : null;
}

function tripDates(trip: Trip): string {
  if (!trip.start_date && !trip.end_date) return "Даты пока не указаны";
  if (!trip.end_date || trip.end_date === trip.start_date) return trip.start_date ?? trip.end_date!;
  return `${trip.start_date ?? "?"} — ${trip.end_date}`;
}

async function request<T>(
  options: TripPlannerOptions,
  path: string,
  method = "GET",
  body?: unknown,
  prefer?: string,
): Promise<T> {
  const response = await fetch(`${options.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: options.supabaseKey,
      Authorization: `Bearer ${options.session.access_token}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function getTrips(options: TripPlannerOptions, id?: number): Promise<Trip[]> {
  const baseFields = [
    "id", "title", "start_date", "end_date", "status", "notes", "updated_at",
    "trip_days(id,day_number,date,overnight_city,lodging_name,lodging_url,notes,trip_stops(id,place_id,position,custom_name,planned_time,notes))",
  ];
  async function fetchTrips(includeBookings: boolean): Promise<Trip[]> {
    const select = [...baseFields, ...(includeBookings
      ? ["trip_bookings(id,kind,title,status,date,url,notes,position)"]
      : [])].join(",");
    const params = new URLSearchParams({ select, order: "updated_at.desc,id.desc" });
    if (id) params.set("id", `eq.${id}`);
    return request<Trip[]>(options, `trips?${params}`);
  }

  let trips: Trip[];
  try {
    trips = await fetchTrips(true);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("trip_bookings")) throw error;
    trips = await fetchTrips(false);
    trips.forEach((trip) => { trip.trip_bookings = []; });
  }
  for (const trip of trips) {
    trip.trip_days.sort((a, b) => a.day_number - b.day_number);
    trip.trip_days.forEach((day) => day.trip_stops.sort((a, b) => a.position - b.position));
    trip.trip_bookings.sort((a, b) => a.position - b.position);
  }
  return trips;
}

async function insertRow<T>(options: TripPlannerOptions, table: string, values: unknown): Promise<T> {
  const rows = await request<T[]>(options, table, "POST", values, "return=representation");
  if (!rows[0]) throw new Error(`Supabase не вернул созданную запись из ${table}.`);
  return rows[0];
}

async function updateRow(options: TripPlannerOptions, table: string, id: number, values: unknown): Promise<void> {
  await request<void>(options, `${table}?id=eq.${id}`, "PATCH", values, "return=minimal");
}

async function deleteRow(options: TripPlannerOptions, table: string, id: number): Promise<void> {
  await request<void>(options, `${table}?id=eq.${id}`, "DELETE", undefined, "return=minimal");
}

function primaryNav(active: "places" | "trips"): string {
  return `<nav class="admin-primary-nav" aria-label="Разделы админки">
    <button type="button" data-admin-section="places" aria-pressed="${active === "places"}">Места</button>
    <button type="button" data-admin-section="trips" aria-pressed="${active === "trips"}">Поездки</button>
  </nav>`;
}

function bindCommonNavigation(options: TripPlannerOptions): void {
  document.querySelector('[data-admin-section="places"]')?.addEventListener("click", () => {
    destroyTripMap();
    options.onShowPlaces();
  });
  document.querySelector('[data-admin-section="trips"]')?.addEventListener("click", () => void renderTripsDashboard(options));
  document.querySelector("#logout")?.addEventListener("click", () => {
    destroyTripMap();
    options.onLogout();
  });
}

function setupMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("trips") && (text.includes("404") || text.includes("PGRST"))) {
    return "Таблицы поездок ещё не созданы. Выполните scripts/trip_planner_setup.sql в Supabase SQL Editor.";
  }
  return text;
}

export async function renderTripsDashboard(options: TripPlannerOptions): Promise<void> {
  destroyTripMap();
  options.app.innerHTML = `<main class="admin-loading">Загружаю поездки…</main>`;
  let trips: Trip[];
  try {
    trips = await getTrips(options);
  } catch (error) {
    options.app.innerHTML = `<main class="admin-shell">
      <header class="admin-header">
        <div><p class="admin-kicker">WAZAWAZA</p><h1>Поездки</h1></div>
        <div class="admin-account"><span>${escapeHtml(options.session.user.email ?? "admin")}</span><button id="logout" type="button">Выйти</button></div>
      </header>
      ${primaryNav("trips")}
      <section class="admin-empty"><h2>Нужно подготовить базу</h2><p>${escapeHtml(setupMessage(error))}</p></section>
    </main>`;
    bindCommonNavigation(options);
    return;
  }

  const totalDays = trips.reduce((sum, trip) => sum + trip.trip_days.length, 0);
  options.app.innerHTML = `<main class="admin-shell">
    <header class="admin-header">
      <div><p class="admin-kicker">WAZAWAZA</p><h1>Поездки</h1></div>
      <div class="admin-account"><span>${escapeHtml(options.session.user.email ?? "admin")}</span><button id="logout" type="button">Выйти</button></div>
    </header>
    ${primaryNav("trips")}
    <section class="admin-stats">
      <div><strong>${trips.length}</strong><span>поездок</span></div>
      <div><strong>${totalDays}</strong><span>дней</span></div>
      <div><strong>${trips.filter((trip) => trip.status === "planning" || trip.status === "booked").length}</strong><span>в планах</span></div>
    </section>
    <form id="create-trip" class="admin-create-trip">
      <label>Новая поездка<input name="title" required placeholder="Например, Сикоку осенью"></label>
      <label>Начало<input name="start_date" type="date"></label>
      <button type="submit">＋ Создать</button>
      <p class="admin-error" aria-live="polite"></p>
    </form>
    <section class="admin-trip-list">
      ${trips.length ? trips.map((trip) => `<article class="admin-trip-card">
        <div>
          <span class="admin-status admin-status--${trip.status}">${escapeHtml(STATUS_LABELS[trip.status])}</span>
          <h2>${escapeHtml(trip.title)}</h2>
          <p>${escapeHtml(tripDates(trip))} · ${trip.trip_days.length} дн. · ${trip.trip_bookings.filter((item) => item.status !== "planned").length}/${trip.trip_bookings.length} броней готово</p>
          ${trip.notes ? `<p class="admin-trip-card__note">${escapeHtml(trip.notes)}</p>` : ""}
        </div>
        <button type="button" data-edit-trip="${trip.id}">Открыть →</button>
      </article>`).join("") : `<div class="admin-empty"><h2>Пока нет поездок</h2><p>Создайте первую — день 1 добавится автоматически.</p></div>`}
    </section>
  </main>`;

  bindCommonNavigation(options);
  const createForm = document.querySelector<HTMLFormElement>("#create-trip");
  createForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(createForm);
    const title = String(data.get("title") ?? "").trim();
    const startDate = String(data.get("start_date") ?? "").trim() || null;
    const button = createForm.querySelector<HTMLButtonElement>("button");
    const error = createForm.querySelector<HTMLElement>(".admin-error");
    if (button) button.disabled = true;
    try {
      const trip = await insertRow<Trip>(options, "trips", { title, start_date: startDate, status: "idea" });
      await insertRow<TripDay>(options, "trip_days", { trip_id: trip.id, day_number: 1, date: startDate });
      await renderTripEditor(options, trip.id);
    } catch (createError) {
      if (error) error.textContent = setupMessage(createError);
      if (button) button.disabled = false;
    }
  });
  document.querySelector(".admin-trip-list")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-edit-trip]");
    if (button) void renderTripEditor(options, Number(button.dataset.editTrip));
  });
}

function statusOptions(selected: Trip["status"]): string {
  return Object.entries(STATUS_LABELS).map(([value, label]) =>
    `<option value="${value}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
}

function stopTitle(stop: TripStop, places: Map<number, TripPlannerPlace>): string {
  if (stop.place_id) {
    const place = places.get(stop.place_id);
    return place ? placeName(place) : `Удалённое место #${stop.place_id}`;
  }
  return stop.custom_name || "Остановка";
}

function dayEditor(day: TripDay, places: Map<number, TripPlannerPlace>): string {
  return `<section class="admin-trip-day" data-day-id="${day.id}">
    <header class="admin-trip-day__header">
      <div><p class="admin-kicker">ДЕНЬ ${day.day_number}</p><h2>${escapeHtml(day.date || "Без даты")}</h2></div>
      <button class="danger" type="button" data-delete-day="${day.id}">Удалить день</button>
    </header>
    <div class="admin-form-grid">
      <label>Дата<input name="day_${day.id}_date" type="date" value="${escapeHtml(day.date || "")}"></label>
      <label>Город ночёвки<input name="day_${day.id}_overnight_city" value="${escapeHtml(day.overnight_city || "")}" placeholder="Например, 松山市"></label>
      <label>Отель / жильё<input name="day_${day.id}_lodging_name" value="${escapeHtml(day.lodging_name || "")}"></label>
      <label>Ссылка на жильё<input name="day_${day.id}_lodging_url" type="url" value="${escapeHtml(day.lodging_url || "")}"></label>
    </div>
    <label>Комментарий к дню<textarea name="day_${day.id}_notes" rows="2">${escapeHtml(day.notes || "")}</textarea></label>
    <div class="admin-trip-stops">
      ${day.trip_stops.length ? day.trip_stops.map((stop, index) => `<article class="admin-trip-stop" data-stop-id="${stop.id}">
        <span class="admin-trip-stop__position">${index + 1}</span>
        <div class="admin-trip-stop__content">
          <strong>${escapeHtml(stopTitle(stop, places))}</strong>
          <div class="admin-trip-stop__fields">
            <label>Время<input name="stop_${stop.id}_planned_time" type="time" value="${escapeHtml((stop.planned_time || "").slice(0, 5))}"></label>
            <label>Заметка<input name="stop_${stop.id}_notes" value="${escapeHtml(stop.notes || "")}"></label>
          </div>
        </div>
        <div class="admin-trip-stop__actions">
          <button type="button" data-move-stop="up" data-stop-id="${stop.id}"${index === 0 ? " disabled" : ""}>↑</button>
          <button type="button" data-move-stop="down" data-stop-id="${stop.id}"${index === day.trip_stops.length - 1 ? " disabled" : ""}>↓</button>
          <button class="danger" type="button" data-delete-stop="${stop.id}">×</button>
        </div>
      </article>`).join("") : `<p class="admin-trip-day__empty">В этот день пока ничего не добавлено.</p>`}
    </div>
    <div class="admin-add-stop">
      <label>Место из базы<input name="place_lookup_${day.id}" list="trip-place-options" placeholder="Начните вводить название или #ID"></label>
      <span>или</span>
      <label>Своя остановка<input name="custom_stop_${day.id}" placeholder="Обед, вокзал, забрать машину…"></label>
      <button type="button" data-add-stop="${day.id}">＋ Добавить</button>
    </div>
  </section>`;
}

function selectOptions<T extends string>(labels: Record<T, string>, selected: T): string {
  return Object.entries(labels).map(([value, label]) =>
    `<option value="${value}"${value === selected ? " selected" : ""}>${escapeHtml(String(label))}</option>`
  ).join("");
}

function bookingEditor(booking: TripBooking): string {
  return `<article class="admin-booking" data-booking-id="${booking.id}">
    <div class="admin-booking__status admin-booking__status--${booking.status}" title="${escapeHtml(BOOKING_STATUS_LABELS[booking.status])}"></div>
    <div class="admin-booking__fields">
      <label>Тип<select name="booking_${booking.id}_kind">${selectOptions(BOOKING_KIND_LABELS, booking.kind)}</select></label>
      <label class="admin-booking__title">Что бронируем / покупаем<input name="booking_${booking.id}_title" required value="${escapeHtml(booking.title)}"></label>
      <label>Статус<select name="booking_${booking.id}_status">${selectOptions(BOOKING_STATUS_LABELS, booking.status)}</select></label>
      <label>Дата (необязательно)<input name="booking_${booking.id}_date" type="date" value="${escapeHtml(booking.date || "")}"></label>
      <label>Ссылка<input name="booking_${booking.id}_url" type="url" value="${escapeHtml(booking.url || "")}"></label>
      <label class="admin-booking__note">Заметка / номер брони<input name="booking_${booking.id}_notes" value="${escapeHtml(booking.notes || "")}"></label>
    </div>
    <button class="danger" type="button" data-delete-booking="${booking.id}" aria-label="Удалить">×</button>
  </article>`;
}

async function renderTripEditor(options: TripPlannerOptions, tripId: number): Promise<void> {
  destroyTripMap();
  options.app.innerHTML = `<main class="admin-loading">Открываю поездку…</main>`;
  try {
    const trip = (await getTrips(options, tripId))[0];
    if (!trip) throw new Error("Поездка не найдена.");
    const places = new Map(options.places.map((place) => [place.id, place]));
    const placeOptions = [...options.places]
      .sort((a, b) => placeName(a).localeCompare(placeName(b), "ru"))
      .map((place) => `<option value="#${place.id} · ${escapeHtml(placeName(place))} — ${escapeHtml(place.prefecture)}"></option>`)
      .join("");

    options.app.innerHTML = `<main class="admin-shell admin-trip-editor-shell">
      <header class="admin-header">
        <div><p class="admin-kicker">WAZAWAZA · ПОЕЗДКА #${trip.id}</p><h1>${escapeHtml(trip.title)}</h1></div>
        <div class="admin-account"><button type="button" data-back-to-trips>← Все поездки</button><button id="logout" type="button">Выйти</button></div>
      </header>
      <form id="trip-editor" class="admin-trip-editor">
        <section class="admin-trip-basics">
          <div class="admin-form-grid">
            <label>Название<input name="title" required value="${escapeHtml(trip.title)}"></label>
            <label>Статус<select name="status">${statusOptions(trip.status)}</select></label>
            <label>Начало<input name="start_date" type="date" value="${escapeHtml(trip.start_date || "")}"></label>
            <label>Конец<input name="end_date" type="date" value="${escapeHtml(trip.end_date || "")}"></label>
          </div>
          <label>Общий комментарий<textarea name="notes" rows="3">${escapeHtml(trip.notes || "")}</textarea></label>
        </section>
        <section class="admin-trip-map-section">
          <div class="admin-trip-map-controls">
            <p class="admin-kicker">МАРШРУТ НА КАРТЕ</p>
            <p>Точки соединены в порядке дней и остановок. Нажмите на любое место, чтобы добавить его в маршрут.</p>
            <label>Добавлять в день
              <select id="trip-map-day">
                ${trip.trip_days.map((day) => `<option value="${day.id}">День ${day.day_number}${day.date ? ` · ${escapeHtml(day.date)}` : " · без даты"}</option>`).join("")}
              </select>
            </label>
            <p id="trip-map-message" class="admin-trip-map-message" aria-live="polite"></p>
          </div>
          <div id="admin-trip-map" class="admin-trip-map"></div>
        </section>
        <section class="admin-bookings-section">
          <header><div><p class="admin-kicker">БРОНИ И БИЛЕТЫ</p><h2>Что уже готово</h2></div><span>${trip.trip_bookings.filter((item) => item.status !== "planned").length} из ${trip.trip_bookings.length}</span></header>
          <div class="admin-bookings-list">
            ${trip.trip_bookings.length ? trip.trip_bookings.map(bookingEditor).join("") : `<p class="admin-trip-day__empty">Пока ничего нет — добавьте отель или билет ниже.</p>`}
          </div>
          <div class="admin-add-booking">
            <label>Тип<select name="new_booking_kind">${selectOptions(BOOKING_KIND_LABELS, "lodging")}</select></label>
            <label>Название<input name="new_booking_title" placeholder="Например, отель в Мацуяме"></label>
            <button type="button" data-add-booking>＋ Добавить</button>
          </div>
        </section>
        <datalist id="trip-place-options">${placeOptions}</datalist>
        <div class="admin-trip-days">${trip.trip_days.map((day) => dayEditor(day, places)).join("")}</div>
        <div class="admin-trip-editor__footer">
          <button type="button" class="danger" data-delete-trip>Удалить поездку</button>
          <div><button type="button" class="secondary" data-add-day>＋ Добавить день</button><button type="submit">Сохранить всё</button></div>
        </div>
        <p class="admin-error" aria-live="polite"></p>
      </form>
    </main>`;

    const form = document.querySelector<HTMLFormElement>("#trip-editor")!;
    const error = form.querySelector<HTMLElement>(".admin-error");
    document.querySelector("[data-back-to-trips]")?.addEventListener("click", () => void renderTripsDashboard(options));
    document.querySelector("#logout")?.addEventListener("click", () => {
      destroyTripMap();
      options.onLogout();
    });

    const routePoints = trip.trip_days.flatMap((day) => day.trip_stops.flatMap((stop) => {
      const place = stop.place_id ? places.get(stop.place_id) : undefined;
      return place ? [{ day, stop, place }] : [];
    }));
    const mapElement = document.querySelector<HTMLElement>("#admin-trip-map");
    const mapDaySelect = document.querySelector<HTMLSelectElement>("#trip-map-day");
    const mapMessage = document.querySelector<HTMLElement>("#trip-map-message");
    let mapClickBusy = false;
    if (mapElement) {
      activeTripMap = L.map(mapElement, { minZoom: 4 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(activeTripMap);

      const addPlaceFromMap = async (place: TripPlannerPlace): Promise<void> => {
        if (mapClickBusy) return;
        const dayId = Number(mapDaySelect?.value);
        const day = trip.trip_days.find((item) => item.id === dayId);
        if (!day) return;
        if (day.trip_stops.some((stop) => stop.place_id === place.id)) {
          if (mapMessage) mapMessage.textContent = `«${placeName(place)}» уже добавлено в день ${day.day_number}.`;
          return;
        }
        mapClickBusy = true;
        if (mapMessage) mapMessage.textContent = `Добавляю «${placeName(place)}»…`;
        try {
          await persistForm();
          await insertRow<TripStop>(options, "trip_stops", {
            trip_day_id: day.id,
            place_id: place.id,
            custom_name: null,
            position: Math.max(0, ...day.trip_stops.map((stop) => stop.position)) + 1,
          });
          await renderTripEditor(options, trip.id);
        } catch (mapError) {
          mapClickBusy = false;
          const message = setupMessage(mapError);
          if (mapMessage) mapMessage.textContent = message;
          if (error) error.textContent = message;
        }
      };

      for (const place of options.places) {
        const marker = L.circleMarker([place.latitude, place.longitude], {
          radius: 4,
          weight: 1,
          color: "#f4f1e9",
          fillColor: "#d14b36",
          fillOpacity: 0.76,
        }).bindTooltip(`<strong>${escapeHtml(placeName(place))}</strong><br>${escapeHtml(place.prefecture)}<br><small>Нажмите, чтобы добавить</small>`).addTo(activeTripMap);
        marker.on("click", () => void addPlaceFromMap(place));
      }

      const latLngs: L.LatLngExpression[] = [];
      for (const { day, stop, place } of routePoints) {
        const point: L.LatLngExpression = [place.latitude, place.longitude];
        latLngs.push(point);
        const label = `${day.day_number}.${stop.position}`;
        const marker = L.marker(point, {
          title: placeName(place),
          icon: L.divIcon({
            className: "admin-trip-marker-wrap",
            html: `<span class="admin-trip-marker">${label}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        }).bindTooltip(`<strong>${escapeHtml(label)} ${escapeHtml(placeName(place))}</strong><br>${escapeHtml(place.prefecture)}<br><small>Нажмите, чтобы добавить в выбранный день</small>`).addTo(activeTripMap);
        marker.on("click", () => void addPlaceFromMap(place));
      }
      if (latLngs.length > 1) L.polyline(latLngs, { color: "#d14b36", weight: 3, opacity: 0.72 }).addTo(activeTripMap);
      if (savedTripMapView?.tripId === trip.id) {
        activeTripMap.setView(savedTripMapView.center, savedTripMapView.zoom);
      } else if (latLngs.length) {
        activeTripMap.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 13 });
      } else {
        activeTripMap.setView([36.2, 138.2], 5);
      }
      activeTripMap.on("moveend", () => {
        if (!activeTripMap) return;
        const center = activeTripMap.getCenter();
        savedTripMapView = { tripId: trip.id, center: [center.lat, center.lng], zoom: activeTripMap.getZoom() };
      });
      requestAnimationFrame(() => activeTripMap?.invalidateSize());
    }

    async function persistForm(): Promise<void> {
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      if (!title) throw new Error("Введите название поездки.");
      await updateRow(options, "trips", trip.id, {
        title,
        status: data.get("status"),
        start_date: String(data.get("start_date") || "") || null,
        end_date: String(data.get("end_date") || "") || null,
        notes: String(data.get("notes") || "").trim() || null,
      });
      for (const day of trip.trip_days) {
        await updateRow(options, "trip_days", day.id, {
          date: String(data.get(`day_${day.id}_date`) || "") || null,
          overnight_city: String(data.get(`day_${day.id}_overnight_city`) || "").trim() || null,
          lodging_name: String(data.get(`day_${day.id}_lodging_name`) || "").trim() || null,
          lodging_url: String(data.get(`day_${day.id}_lodging_url`) || "").trim() || null,
          notes: String(data.get(`day_${day.id}_notes`) || "").trim() || null,
        });
        for (const stop of day.trip_stops) {
          await updateRow(options, "trip_stops", stop.id, {
            planned_time: String(data.get(`stop_${stop.id}_planned_time`) || "") || null,
            notes: String(data.get(`stop_${stop.id}_notes`) || "").trim() || null,
          });
        }
      }
      for (const booking of trip.trip_bookings) {
        const bookingTitle = String(data.get(`booking_${booking.id}_title`) || "").trim();
        if (!bookingTitle) throw new Error("Укажите название брони или билета.");
        await updateRow(options, "trip_bookings", booking.id, {
          kind: data.get(`booking_${booking.id}_kind`),
          title: bookingTitle,
          status: data.get(`booking_${booking.id}_status`),
          date: String(data.get(`booking_${booking.id}_date`) || "") || null,
          url: String(data.get(`booking_${booking.id}_url`) || "").trim() || null,
          notes: String(data.get(`booking_${booking.id}_notes`) || "").trim() || null,
        });
      }
    }

    async function insertPendingStop(day: TripDay): Promise<boolean> {
      const lookup = form.elements.namedItem(`place_lookup_${day.id}`) as HTMLInputElement;
      const custom = form.elements.namedItem(`custom_stop_${day.id}`) as HTMLInputElement;
      const lookupValue = lookup.value.trim();
      const customName = custom.value.trim() || null;
      if (!lookupValue && !customName) return false;

      const placeId = resolvePlaceId(lookupValue, places);
      if (!placeId && lookupValue) throw new Error("Не удалось однозначно найти место. Выберите вариант из подсказки.");
      await insertRow<TripStop>(options, "trip_stops", {
        trip_day_id: day.id,
        place_id: placeId,
        custom_name: placeId ? null : customName,
        position: Math.max(0, ...day.trip_stops.map((stop) => stop.position)) + 1,
      });
      return true;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submit) submit.disabled = true;
      if (error) error.textContent = "";
      try {
        await persistForm();
        for (const day of trip.trip_days) await insertPendingStop(day);
        await renderTripEditor(options, trip.id);
      } catch (saveError) {
        if (error) error.textContent = setupMessage(saveError);
        if (submit) submit.disabled = false;
      }
    });

    form.querySelector("[data-add-day]")?.addEventListener("click", async () => {
      try {
        await persistForm();
        const dayNumber = Math.max(0, ...trip.trip_days.map((day) => day.day_number)) + 1;
        let date: string | null = null;
        const currentStartDate = String(new FormData(form).get("start_date") || "") || null;
        if (currentStartDate) {
          const candidate = new Date(`${currentStartDate}T00:00:00Z`);
          candidate.setUTCDate(candidate.getUTCDate() + dayNumber - 1);
          date = candidate.toISOString().slice(0, 10);
        }
        await insertRow<TripDay>(options, "trip_days", { trip_id: trip.id, day_number: dayNumber, date });
        await renderTripEditor(options, trip.id);
      } catch (dayError) {
        if (error) error.textContent = setupMessage(dayError);
      }
    });

    form.querySelector("[data-delete-trip]")?.addEventListener("click", async () => {
      if (!window.confirm(`Удалить поездку «${trip.title}»?`)) return;
      try {
        await deleteRow(options, "trips", trip.id);
        await renderTripsDashboard(options);
      } catch (deleteError) {
        if (error) error.textContent = setupMessage(deleteError);
      }
    });

    form.addEventListener("click", async (event) => {
      const target = event.target as HTMLElement;
      const add = target.closest<HTMLButtonElement>("[data-add-stop]");
      const deleteStop = target.closest<HTMLButtonElement>("[data-delete-stop]");
      const deleteDay = target.closest<HTMLButtonElement>("[data-delete-day]");
      const move = target.closest<HTMLButtonElement>("[data-move-stop]");
      const addBooking = target.closest<HTMLButtonElement>("[data-add-booking]");
      const deleteBooking = target.closest<HTMLButtonElement>("[data-delete-booking]");
      try {
        if (addBooking) {
          await persistForm();
          const data = new FormData(form);
          const title = String(data.get("new_booking_title") || "").trim();
          if (!title) throw new Error("Введите, что нужно забронировать или купить.");
          await insertRow<TripBooking>(options, "trip_bookings", {
            trip_id: trip.id,
            kind: data.get("new_booking_kind"),
            title,
            status: "planned",
            position: Math.max(0, ...trip.trip_bookings.map((item) => item.position)) + 1,
          });
          await renderTripEditor(options, trip.id);
        } else if (deleteBooking) {
          await persistForm();
          await deleteRow(options, "trip_bookings", Number(deleteBooking.dataset.deleteBooking));
          await renderTripEditor(options, trip.id);
        } else if (add) {
          await persistForm();
          const dayId = Number(add.dataset.addStop);
          const day = trip.trip_days.find((item) => item.id === dayId)!;
          if (!await insertPendingStop(day)) throw new Error("Выберите место или введите свою остановку.");
          await renderTripEditor(options, trip.id);
        } else if (deleteStop) {
          await persistForm();
          await deleteRow(options, "trip_stops", Number(deleteStop.dataset.deleteStop));
          await renderTripEditor(options, trip.id);
        } else if (deleteDay) {
          if (trip.trip_days.length === 1) throw new Error("В поездке должен остаться хотя бы один день.");
          if (!window.confirm("Удалить день вместе со всеми остановками?")) return;
          await persistForm();
          await deleteRow(options, "trip_days", Number(deleteDay.dataset.deleteDay));
          const remaining = trip.trip_days.filter((day) => day.id !== Number(deleteDay.dataset.deleteDay));
          for (const [index, day] of remaining.entries()) await updateRow(options, "trip_days", day.id, { day_number: index + 1 });
          await renderTripEditor(options, trip.id);
        } else if (move) {
          await persistForm();
          const stopId = Number(move.dataset.stopId);
          const day = trip.trip_days.find((item) => item.trip_stops.some((stop) => stop.id === stopId))!;
          const index = day.trip_stops.findIndex((stop) => stop.id === stopId);
          const otherIndex = move.dataset.moveStop === "up" ? index - 1 : index + 1;
          const current = day.trip_stops[index];
          const other = day.trip_stops[otherIndex];
          if (!current || !other) return;
          const temporaryPosition = 1_000_000 + current.id;
          await updateRow(options, "trip_stops", current.id, { position: temporaryPosition });
          await updateRow(options, "trip_stops", other.id, { position: current.position });
          await updateRow(options, "trip_stops", current.id, { position: other.position });
          await renderTripEditor(options, trip.id);
        }
      } catch (actionError) {
        if (error) {
          error.textContent = setupMessage(actionError);
          error.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    });
  } catch (error) {
    options.app.innerHTML = `<main class="admin-shell"><section class="admin-empty"><h2>Не удалось открыть поездку</h2><p>${escapeHtml(setupMessage(error))}</p><button type="button" data-back-to-trips>← Назад</button></section></main>`;
    document.querySelector("[data-back-to-trips]")?.addEventListener("click", () => void renderTripsDashboard(options));
  }
}

export { primaryNav };
