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
  destination_id: number | null;
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

type TripDestination = {
  id: number;
  name: string;
  position: number;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
};

type TripLeg = {
  id: number;
  from_destination_id: number;
  to_destination_id: number;
  mode: "train" | "bus" | "car" | "flight" | "ferry" | "walk" | "other";
  details: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  booked: boolean;
  paid: boolean;
};

type TripRouteData = {
  destinations: TripDestination[];
  legs: TripLeg[];
  supportsTimes: boolean;
};

type CitySearchResult = {
  latitude: number;
  longitude: number;
  label: string;
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
  supports_day_destinations: boolean;
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
const TRANSPORT_MODE_LABELS: Record<TripLeg["mode"], string> = {
  train: "Поезд",
  bus: "Автобус",
  car: "Машина",
  flight: "Самолёт",
  ferry: "Паром",
  walk: "Пешком",
  other: "Другое",
};
let activeTripMap: L.Map | undefined;
let savedTripMapView: { tripId: number; center: L.LatLngTuple; zoom: number } | undefined;
let savedTripMapDay: { tripId: number; dayId: number } | undefined;
let savedTripMapLayer: { tripId: number; mode: "overview" | "day" | "all" } | undefined;

function destroyTripMap(): void {
  const map = activeTripMap;
  activeTripMap = undefined;
  if (!map) return;
  map.stop();
  map.off();
  map.remove();
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

async function searchJapaneseCity(query: string): Promise<CitySearchResult | null> {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ja");
  const cacheKey = `wazawaza-city-search:${normalized}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached) as CitySearchResult | null;

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "jp",
    limit: "5",
    addressdetails: "1",
    "accept-language": "ja,ru,en",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!response.ok) throw new Error(`Поиск города временно недоступен (${response.status}).`);
  const results = await response.json() as Array<{
    lat: string;
    lon: string;
    display_name: string;
    type?: string;
    addresstype?: string;
  }>;
  const cityTypes = new Set(["city", "town", "village", "municipality", "administrative"]);
  const match = results.find((result) => cityTypes.has(result.addresstype || result.type || "")) ?? results[0];
  const found = match ? {
    latitude: Number(match.lat),
    longitude: Number(match.lon),
    label: match.display_name,
  } : null;
  localStorage.setItem(cacheKey, JSON.stringify(found));
  return found;
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
  async function fetchTrips(includeBookings: boolean, includeDayDestinations: boolean): Promise<Trip[]> {
    const dayFields = [
      "id", "day_number", "date", ...(includeDayDestinations ? ["destination_id"] : []),
      "overnight_city", "lodging_name", "lodging_url", "notes",
      "trip_stops(id,place_id,position,custom_name,planned_time,notes)",
    ].join(",");
    const baseFields = ["id", "title", "start_date", "end_date", "status", "notes", "updated_at", `trip_days(${dayFields})`];
    const select = [...baseFields, ...(includeBookings
      ? ["trip_bookings(id,kind,title,status,date,url,notes,position)"]
      : [])].join(",");
    const params = new URLSearchParams({ select, order: "updated_at.desc,id.desc" });
    if (id) params.set("id", `eq.${id}`);
    return request<Trip[]>(options, `trips?${params}`);
  }

  let trips: Trip[] | undefined;
  let includeBookings = true;
  let includeDayDestinations = true;
  for (let attempt = 0; attempt < 3 && !trips; attempt += 1) {
    try {
      trips = await fetchTrips(includeBookings, includeDayDestinations);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (includeBookings && message.includes("trip_bookings")) {
        includeBookings = false;
      } else if (includeDayDestinations && message.includes("destination_id")) {
        includeDayDestinations = false;
      } else {
        throw error;
      }
    }
  }
  if (!trips) throw new Error("Не удалось загрузить поездки.");
  for (const trip of trips) {
    if (!includeBookings) trip.trip_bookings = [];
    trip.supports_day_destinations = includeDayDestinations;
    trip.trip_days.sort((a, b) => a.day_number - b.day_number);
    trip.trip_days.forEach((day) => {
      if (!includeDayDestinations) day.destination_id = null;
      day.trip_stops.sort((a, b) => a.position - b.position);
    });
    trip.trip_bookings.sort((a, b) => a.position - b.position);
  }
  return trips;
}

async function getTripRoute(options: TripPlannerOptions, tripId: number): Promise<TripRouteData | null> {
  try {
    const [destinations, legs] = await Promise.all([
      request<TripDestination[]>(options, `trip_destinations?trip_id=eq.${tripId}&select=id,name,position,latitude,longitude,notes&order=position.asc`),
      request<TripLeg[]>(options, `trip_legs?trip_id=eq.${tripId}&select=id,from_destination_id,to_destination_id,mode,details,departure_time,arrival_time,booked,paid`),
    ]);
    return { destinations, legs, supportsTimes: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("departure_time") || message.includes("arrival_time")) {
      const [destinations, legacyLegs] = await Promise.all([
        request<TripDestination[]>(options, `trip_destinations?trip_id=eq.${tripId}&select=id,name,position,latitude,longitude,notes&order=position.asc`),
        request<Omit<TripLeg, "departure_time" | "arrival_time">[]>(options, `trip_legs?trip_id=eq.${tripId}&select=id,from_destination_id,to_destination_id,mode,details,booked,paid`),
      ]);
      return {
        destinations,
        legs: legacyLegs.map((leg) => ({ ...leg, departure_time: null, arrival_time: null })),
        supportsTimes: false,
      };
    }
    if (message.includes("trip_destinations") || message.includes("trip_legs") || message.includes("PGRST205")) return null;
    throw error;
  }
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

function dayEditor(day: TripDay, places: Map<number, TripPlannerPlace>, destinations: TripDestination[], supportsDayDestinations: boolean): string {
  return `<section class="admin-trip-day" data-day-id="${day.id}">
    <header class="admin-trip-day__header">
      <div><p class="admin-kicker">ДЕНЬ ${day.day_number}</p><h2>${escapeHtml(day.date || "Без даты")}</h2></div>
      <button class="danger" type="button" data-delete-day="${day.id}">Удалить день</button>
    </header>
    <div class="admin-form-grid">
      <label>Дата<input name="day_${day.id}_date" type="date" value="${escapeHtml(day.date || "")}"></label>
      <label>Город маршрута<select name="day_${day.id}_destination_id"${supportsDayDestinations ? "" : " disabled"}>
        <option value="">Не выбран</option>
        ${destinations.map((destination) => `<option value="${destination.id}"${destination.id === day.destination_id ? " selected" : ""}>${escapeHtml(destination.name)}</option>`).join("")}
      </select></label>
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

function tripRouteEditor(tripId: number, route: TripRouteData | null): string {
  if (!route) {
    return `<section class="admin-trip-route-section">
      <header><div><p class="admin-kicker">ГОРОДА И ТРАНСПОРТ</p><h2>Каркас поездки</h2></div></header>
      <p class="admin-trip-route-setup">Для этого раздела нужно повторно выполнить актуальный <code>scripts/trip_planner_setup.sql</code> в Supabase.</p>
    </section>`;
  }
  const { destinations, legs } = route;
  return `<section class="admin-trip-route-section" data-trip-route="${tripId}">
    <header>
      <div><p class="admin-kicker">ГОРОДА И ТРАНСПОРТ</p><h2>Каркас поездки</h2></div>
      <span>${destinations.length} ${destinations.length === 1 ? "город" : "городов"}</span>
    </header>
    <p class="admin-trip-route-hint">Сначала добавьте города по порядку. Координаты можно поставить на общей карте ниже.</p>
    ${route.supportsTimes ? "" : `<p class="admin-trip-route-setup">Повторно выполните актуальный SQL, чтобы включить время отправления и прибытия.</p>`}
    <div class="admin-trip-destinations">
      ${destinations.length ? destinations.map((destination, index) => {
        const next = destinations[index + 1];
        const leg = next ? legs.find((item) => item.from_destination_id === destination.id && item.to_destination_id === next.id) : undefined;
        return `<div class="admin-trip-route-piece">
          <article class="admin-trip-destination" data-destination-id="${destination.id}">
            <span class="admin-trip-destination__position">${index + 1}</span>
            <div class="admin-trip-destination__fields">
              <label>Город<input name="destination_${destination.id}_name" required value="${escapeHtml(destination.name)}"></label>
              <label>Комментарий<input name="destination_${destination.id}_notes" value="${escapeHtml(destination.notes || "")}" placeholder="Ночёвка, район, планы…"></label>
            </div>
            <div class="admin-trip-destination__actions">
              <button type="button" class="secondary" data-place-destination="${destination.id}">${destination.latitude == null ? "Поставить на карте" : "Переставить"}</button>
              <button type="button" class="danger" data-delete-destination="${destination.id}">×</button>
            </div>
          </article>
          ${leg ? `<article class="admin-trip-leg" data-leg-id="${leg.id}">
            <span class="admin-trip-leg__arrow">↓</span>
            <label>Транспорт<select name="leg_${leg.id}_mode">${selectOptions(TRANSPORT_MODE_LABELS, leg.mode)}</select></label>
            <label>Детали<input name="leg_${leg.id}_details" value="${escapeHtml(leg.details || "")}" placeholder="Hayabusa 15, пересадка в…"></label>
            <label>Отправление<input name="leg_${leg.id}_departure_time" type="time" value="${escapeHtml((leg.departure_time || "").slice(0, 5))}"${route.supportsTimes ? "" : " disabled"}></label>
            <label>Прибытие<input name="leg_${leg.id}_arrival_time" type="time" value="${escapeHtml((leg.arrival_time || "").slice(0, 5))}"${route.supportsTimes ? "" : " disabled"}></label>
            <label class="admin-trip-check"><input name="leg_${leg.id}_booked" type="checkbox"${leg.booked ? " checked" : ""}> Забронировано</label>
            <label class="admin-trip-check"><input name="leg_${leg.id}_paid" type="checkbox"${leg.paid ? " checked" : ""}> Оплачено</label>
          </article>` : ""}
        </div>`;
      }).join("") : `<p class="admin-trip-day__empty">Добавьте первый город — для него не нужна запись в базе мест.</p>`}
    </div>
    <div class="admin-add-destination">
      <label>Следующий город<input name="new_destination_name" placeholder="Например, 仙台 / Сендай"></label>
      <button type="button" data-add-destination>＋ Добавить город</button>
    </div>
  </section>`;
}

async function renderTripEditor(options: TripPlannerOptions, tripId: number): Promise<void> {
  destroyTripMap();
  options.app.innerHTML = `<main class="admin-loading">Открываю поездку…</main>`;
  try {
    const trip = (await getTrips(options, tripId))[0];
    if (!trip) throw new Error("Поездка не найдена.");
    const tripRoute = await getTripRoute(options, trip.id);
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
        ${tripRouteEditor(trip.id, tripRoute)}
        <section class="admin-trip-map-section">
          <div class="admin-trip-map-controls">
            <p class="admin-kicker">МАРШРУТ НА КАРТЕ</p>
            <p>Точки соединены в порядке дней и остановок. Нажмите на любое место, чтобы добавить его в маршрут.</p>
            <label>Показывать
              <select id="trip-map-layer">
                <option value="overview"${savedTripMapLayer?.tripId === trip.id && savedTripMapLayer.mode === "overview" ? " selected" : ""}>Обзор городов</option>
                <option value="day"${savedTripMapLayer?.tripId === trip.id && savedTripMapLayer.mode === "day" ? " selected" : ""}>Выбранный день</option>
                <option value="all"${savedTripMapLayer?.tripId !== trip.id || savedTripMapLayer.mode === "all" ? " selected" : ""}>Вся поездка</option>
              </select>
            </label>
            <label>Добавлять в день
              <select id="trip-map-day">
                ${trip.trip_days.map((day) => `<option value="${day.id}"${savedTripMapDay?.tripId === trip.id && savedTripMapDay.dayId === day.id ? " selected" : ""}>День ${day.day_number}${day.date ? ` · ${escapeHtml(day.date)}` : " · без даты"}</option>`).join("")}
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
        ${trip.supports_day_destinations ? "" : `<p class="admin-trip-route-setup">Повторно выполните актуальный SQL, чтобы привязать дни к городам.</p>`}
        <div class="admin-trip-days">${trip.trip_days.map((day) => dayEditor(day, places, tripRoute?.destinations ?? [], trip.supports_day_destinations)).join("")}</div>
        <div class="admin-trip-editor__footer">
          <button type="button" class="danger" data-delete-trip>Удалить поездку</button>
          <div><button type="button" class="secondary" data-add-day>＋ Добавить день</button><button type="submit">Сохранить всё</button></div>
        </div>
        <p class="admin-error" aria-live="polite"></p>
      </form>
    </main>`;

    const form = document.querySelector<HTMLFormElement>("#trip-editor")!;
    const error = form.querySelector<HTMLElement>(".admin-error");
    const destinations = tripRoute?.destinations ?? [];
    const legs = tripRoute?.legs ?? [];
    let destinationPlacementId: number | null = null;
    let suggestedCityMarker: L.Marker | undefined;
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
    const mapLayerSelect = document.querySelector<HTMLSelectElement>("#trip-map-layer");
    const mapMessage = document.querySelector<HTMLElement>("#trip-map-message");
    let mapClickBusy = false;
    let updateMapLayers: ((fitBounds: boolean) => void) | undefined;
    mapDaySelect?.addEventListener("change", () => {
      savedTripMapDay = { tripId: trip.id, dayId: Number(mapDaySelect.value) };
      if (mapMessage) mapMessage.textContent = "";
      updateMapLayers?.(true);
    });
    mapLayerSelect?.addEventListener("change", () => {
      savedTripMapLayer = { tripId: trip.id, mode: mapLayerSelect.value as "overview" | "day" | "all" };
      updateMapLayers?.(true);
    });
    if (mapElement) {
      const map = L.map(mapElement, { minZoom: 4 });
      activeTripMap = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(activeTripMap);
      const cityLayer = L.layerGroup();
      const cityMarkers = new Map<number, L.Marker>();
      const dayLayers = new Map<number, L.LayerGroup>();
      const dayLatLngs = new Map<number, L.LatLngExpression[]>();

      const addPlaceFromMap = async (place: TripPlannerPlace): Promise<void> => {
        if (mapClickBusy) return;
        if (destinationPlacementId) {
          if (mapMessage) mapMessage.textContent = "Для города нажмите на свободное место карты, не на маркер достопримечательности.";
          return;
        }
        const dayId = Number(mapDaySelect?.value);
        const day = trip.trip_days.find((item) => item.id === dayId);
        if (!day) return;
        savedTripMapDay = { tripId: trip.id, dayId: day.id };
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

      const cityLatLngs: L.LatLngExpression[] = [];
      for (const [index, destination] of destinations.entries()) {
        if (destination.latitude == null || destination.longitude == null) continue;
        const point: L.LatLngExpression = [destination.latitude, destination.longitude];
        cityLatLngs.push(point);
        const marker = L.marker(point, {
          draggable: true,
          title: destination.name,
          icon: L.divIcon({
            className: "admin-trip-city-marker-wrap",
            html: `<span class="admin-trip-city-marker"><b>${index + 1}</b></span>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          }),
        }).bindTooltip(`<strong>${escapeHtml(destination.name)}</strong><br><small>Перетащите, чтобы уточнить точку</small>`).addTo(cityLayer);
        cityMarkers.set(destination.id, marker);
        marker.on("dragend", () => {
          const point = marker.getLatLng();
          void saveDestinationCoordinates(destination, point.lat, point.lng);
        });
      }
      if (cityLatLngs.length > 1) {
        L.polyline(cityLatLngs, { color: "#245e82", weight: 4, opacity: 0.76, dashArray: "8 7" }).addTo(cityLayer);
      }

      activeTripMap.on("click", (event) => {
        if (!destinationPlacementId || mapClickBusy) return;
        const destination = destinations.find((item) => item.id === destinationPlacementId);
        if (!destination) return;
        mapClickBusy = true;
        if (mapMessage) mapMessage.textContent = `Ставлю «${destination.name}» на карту…`;
        void saveDestinationCoordinates(destination, event.latlng.lat, event.latlng.lng).catch((mapError) => {
          mapClickBusy = false;
          const message = setupMessage(mapError);
          if (mapMessage) mapMessage.textContent = message;
          if (error) error.textContent = message;
        });
      });

      const latLngs: L.LatLngExpression[] = [];
      for (const { day, stop, place } of routePoints) {
        const point: L.LatLngExpression = [place.latitude, place.longitude];
        latLngs.push(point);
        const dayLayer = dayLayers.get(day.id) ?? L.layerGroup();
        const points = dayLatLngs.get(day.id) ?? [];
        points.push(point);
        dayLayers.set(day.id, dayLayer);
        dayLatLngs.set(day.id, points);
        const label = `${day.day_number}.${stop.position}`;
        const marker = L.marker(point, {
          title: placeName(place),
          icon: L.divIcon({
            className: "admin-trip-marker-wrap",
            html: `<span class="admin-trip-marker">${label}</span>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        }).bindTooltip(`<strong>${escapeHtml(label)} ${escapeHtml(placeName(place))}</strong><br>${escapeHtml(place.prefecture)}<br><small>Нажмите, чтобы добавить в выбранный день</small>`).addTo(dayLayer);
        marker.on("click", () => void addPlaceFromMap(place));
      }
      for (const [dayId, points] of dayLatLngs) {
        if (points.length > 1) L.polyline(points, { color: "#d14b36", weight: 3, opacity: 0.72 }).addTo(dayLayers.get(dayId)!);
      }

      const visiblePoints = (): L.LatLngExpression[] => {
        const mode = (mapLayerSelect?.value || "all") as "overview" | "day" | "all";
        if (mode === "overview") return cityLatLngs;
        if (mode === "day") {
          const dayId = Number(mapDaySelect?.value);
          const destinationId = trip.trip_days.find((day) => day.id === dayId)?.destination_id;
          const destination = destinations.find((item) => item.id === destinationId);
          const cityPoint: L.LatLngExpression[] = destination?.latitude != null && destination.longitude != null
            ? [[destination.latitude, destination.longitude]]
            : [];
          return [...cityPoint, ...(dayLatLngs.get(dayId) ?? [])];
        }
        return [...cityLatLngs, ...latLngs];
      };
      updateMapLayers = (fitBounds) => {
        cityLayer.remove();
        cityMarkers.forEach((marker) => marker.remove());
        dayLayers.forEach((layer) => layer.remove());
        const mode = (mapLayerSelect?.value || "all") as "overview" | "day" | "all";
        if (mode === "overview" || mode === "all") cityLayer.addTo(map);
        if (mode === "day") {
          const dayId = Number(mapDaySelect?.value);
          const destinationId = trip.trip_days.find((day) => day.id === dayId)?.destination_id;
          if (destinationId) cityMarkers.get(destinationId)?.addTo(map);
          dayLayers.get(dayId)?.addTo(map);
        }
        if (mode === "all") dayLayers.forEach((layer) => layer.addTo(map));
        if (fitBounds) {
          const points = visiblePoints();
          if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: mode === "overview" ? 10 : 13 });
        }
      };
      updateMapLayers(false);
      if (savedTripMapView?.tripId === trip.id) {
        activeTripMap.setView(savedTripMapView.center, savedTripMapView.zoom);
      } else if (visiblePoints().length) {
        activeTripMap.fitBounds(L.latLngBounds(visiblePoints()), { padding: [36, 36], maxZoom: mapLayerSelect?.value === "overview" ? 10 : 13 });
      } else {
        activeTripMap.setView([36.2, 138.2], 5);
      }
      activeTripMap.on("moveend", () => {
        if (!activeTripMap) return;
        const center = activeTripMap.getCenter();
        savedTripMapView = { tripId: trip.id, center: [center.lat, center.lng], zoom: activeTripMap.getZoom() };
      });
      requestAnimationFrame(() => {
        if (activeTripMap === map) map.invalidateSize();
      });
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
        const dayValues: Record<string, unknown> = {
          date: String(data.get(`day_${day.id}_date`) || "") || null,
          lodging_name: String(data.get(`day_${day.id}_lodging_name`) || "").trim() || null,
          lodging_url: String(data.get(`day_${day.id}_lodging_url`) || "").trim() || null,
          notes: String(data.get(`day_${day.id}_notes`) || "").trim() || null,
        };
        if (trip.supports_day_destinations) {
          const destinationId = Number(data.get(`day_${day.id}_destination_id`)) || null;
          dayValues.destination_id = destinationId;
          dayValues.overnight_city = destinations.find((destination) => destination.id === destinationId)?.name ?? null;
        }
        await updateRow(options, "trip_days", day.id, dayValues);
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
      for (const destination of destinations) {
        const name = String(data.get(`destination_${destination.id}_name`) || "").trim();
        if (!name) throw new Error("Укажите название города.");
        await updateRow(options, "trip_destinations", destination.id, {
          name,
          notes: String(data.get(`destination_${destination.id}_notes`) || "").trim() || null,
        });
      }
      for (const leg of legs) {
        const values: Record<string, unknown> = {
          mode: data.get(`leg_${leg.id}_mode`),
          details: String(data.get(`leg_${leg.id}_details`) || "").trim() || null,
          booked: data.get(`leg_${leg.id}_booked`) === "on",
          paid: data.get(`leg_${leg.id}_paid`) === "on",
        };
        if (tripRoute?.supportsTimes) {
          values.departure_time = String(data.get(`leg_${leg.id}_departure_time`) || "") || null;
          values.arrival_time = String(data.get(`leg_${leg.id}_arrival_time`) || "") || null;
        }
        await updateRow(options, "trip_legs", leg.id, values);
      }
    }

    async function saveDestinationCoordinates(destination: TripDestination, latitude: number, longitude: number): Promise<void> {
      await persistForm();
      if (activeTripMap) {
        const center = activeTripMap.getCenter();
        savedTripMapView = { tripId: trip.id, center: [center.lat, center.lng], zoom: activeTripMap.getZoom() };
      }
      await updateRow(options, "trip_destinations", destination.id, { latitude, longitude });
      await renderTripEditor(options, trip.id);
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
      const addDestination = target.closest<HTMLButtonElement>("[data-add-destination]");
      const placeDestination = target.closest<HTMLButtonElement>("[data-place-destination]");
      const deleteDestination = target.closest<HTMLButtonElement>("[data-delete-destination]");
      try {
        if (addDestination) {
          if (!tripRoute) throw new Error("Сначала выполните актуальный scripts/trip_planner_setup.sql в Supabase.");
          await persistForm();
          const data = new FormData(form);
          const name = String(data.get("new_destination_name") || "").trim();
          if (!name) throw new Error("Введите название города.");
          const previous = destinations.at(-1);
          const destination = await insertRow<TripDestination>(options, "trip_destinations", {
            trip_id: trip.id,
            name,
            position: destinations.length + 1,
          });
          if (previous) {
            await insertRow<TripLeg>(options, "trip_legs", {
              trip_id: trip.id,
              from_destination_id: previous.id,
              to_destination_id: destination.id,
              mode: "train",
            });
          }
          await renderTripEditor(options, trip.id);
        } else if (placeDestination) {
          destinationPlacementId = Number(placeDestination.dataset.placeDestination);
          const destination = destinations.find((item) => item.id === destinationPlacementId);
          mapElement?.classList.add("is-placing-city");
          mapElement?.scrollIntoView({ behavior: "smooth", block: "center" });
          if (!destination || !activeTripMap) return;
          const currentName = String(new FormData(form).get(`destination_${destination.id}_name`) || destination.name).trim();
          if (mapMessage) mapMessage.textContent = `Ищу «${currentName}» в Японии…`;
          suggestedCityMarker?.remove();
          const suggestion = await searchJapaneseCity(currentName);
          if (!suggestion) {
            if (mapMessage) mapMessage.textContent = `Не нашла «${currentName}». Нажмите на нужное место карты вручную.`;
            return;
          }
          activeTripMap.flyTo([suggestion.latitude, suggestion.longitude], 10);
          suggestedCityMarker = L.marker([suggestion.latitude, suggestion.longitude], {
            title: `Предложение: ${suggestion.label}`,
            icon: L.divIcon({
              className: "admin-trip-city-suggestion-wrap",
              html: `<span class="admin-trip-city-suggestion">?</span>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            }),
          }).bindTooltip(`<strong>${escapeHtml(suggestion.label)}</strong><br><small>Нажмите, чтобы подтвердить</small>`, { permanent: true, direction: "top" }).addTo(activeTripMap);
          suggestedCityMarker.on("click", () => {
            if (mapClickBusy) return;
            mapClickBusy = true;
            if (mapMessage) mapMessage.textContent = `Сохраняю «${currentName}»…`;
            void saveDestinationCoordinates(destination, suggestion.latitude, suggestion.longitude).catch((mapError) => {
              mapClickBusy = false;
              const message = setupMessage(mapError);
              if (mapMessage) mapMessage.textContent = message;
              if (error) error.textContent = message;
            });
          });
          if (mapMessage) mapMessage.textContent = "Нашла вариант. Нажмите на жёлтый маркер, чтобы подтвердить, или выберите другую точку вручную.";
        } else if (deleteDestination) {
          const destinationId = Number(deleteDestination.dataset.deleteDestination);
          const index = destinations.findIndex((item) => item.id === destinationId);
          const destination = destinations[index];
          if (!destination || !window.confirm(`Удалить город «${destination.name}» из маршрута?`)) return;
          await persistForm();
          const previous = destinations[index - 1];
          const next = destinations[index + 1];
          await deleteRow(options, "trip_destinations", destination.id);
          const remaining = destinations.filter((item) => item.id !== destination.id);
          for (const [position, item] of remaining.entries()) {
            if (item.position !== position + 1) await updateRow(options, "trip_destinations", item.id, { position: position + 1 });
          }
          if (previous && next) {
            await insertRow<TripLeg>(options, "trip_legs", {
              trip_id: trip.id,
              from_destination_id: previous.id,
              to_destination_id: next.id,
              mode: "train",
            });
          }
          await renderTripEditor(options, trip.id);
        } else if (addBooking) {
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
