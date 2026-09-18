import { escapeHtml } from "./html";
import { BOOKING_KIND_LABELS, BOOKING_STATUS_LABELS, STATUS_LABELS, TRANSPORT_MODE_LABELS, placeName } from "./trip-format";
import type { BookingStatus, Trip, TripBooking, TripDay, TripDestination, TripPlannerOptions, TripPlannerPlace, TripRouteData, TripStop } from "./trip-types";
import { tripUiState } from "./trip-ui-state";

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

function bookingStatusOptions(selected: BookingStatus | null, emptyLabel: string): string {
  return `<option value=""${selected ? "" : " selected"}>${escapeHtml(emptyLabel)}</option>${Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) =>
    `<option value="${value}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`
  ).join("")}`;
}

function dayEditor(
  day: TripDay,
  days: TripDay[],
  places: Map<number, TripPlannerPlace>,
  supportsInlineBookings: boolean,
): string {
  return `<section class="admin-trip-day" data-day-id="${day.id}">
    <header class="admin-trip-day__header">
      <div><p class="admin-kicker">ДЕНЬ ${day.day_number}</p><h2>${escapeHtml(day.date || "Без даты")}</h2></div>
      <button class="danger" type="button" data-delete-day="${day.id}">Удалить день</button>
    </header>
    <div class="admin-form-grid">
      <label>Дата<input name="day_${day.id}_date" type="date" value="${escapeHtml(day.date || "")}"></label>
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
            <label>День<select data-transfer-stop="${stop.id}" data-current-day="${day.id}">
              ${days.map((candidate) => `<option value="${candidate.id}"${candidate.id === day.id ? " selected" : ""}>День ${candidate.day_number}${candidate.date ? ` · ${escapeHtml(candidate.date)}` : ""}</option>`).join("")}
            </select></label>
            <label>Входной билет<select name="stop_${stop.id}_admission_status"${supportsInlineBookings ? "" : " disabled"}>${bookingStatusOptions(stop.admission_status, "Не требуется")}</select></label>
            <label>Ссылка на билет<input name="stop_${stop.id}_admission_url" type="url" value="${escapeHtml(stop.admission_url || "")}"${supportsInlineBookings ? "" : " disabled"}></label>
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

function overnightEditor(day: TripDay, destinations: TripDestination[], supportsDayDestinations: boolean, supportsInlineBookings: boolean): string {
  return `<section class="admin-trip-overnight" aria-label="Ночёвка после дня ${day.day_number}">
    <div class="admin-trip-overnight__heading">
      <span class="admin-trip-overnight__icon" aria-hidden="true">☾</span>
      <div><p class="admin-kicker">ПОСЛЕ ДНЯ ${day.day_number}</p><h3>Ночёвка</h3></div>
    </div>
    <div class="admin-form-grid">
      <label>Город ночёвки / база<select name="day_${day.id}_destination_id" data-day-base="${day.id}"${supportsDayDestinations ? "" : " disabled"}>
        <option value="">Не выбран</option>
        ${destinations.map((destination, index) => `<option value="${destination.id}"${destination.id === day.destination_id ? " selected" : ""}>${index + 1}. ${escapeHtml(destination.name)}</option>`).join("")}
      </select></label>
      <label>Отель / жильё<input name="day_${day.id}_lodging_name" value="${escapeHtml(day.lodging_name || "")}"></label>
      <label>Ссылка на жильё<input name="day_${day.id}_lodging_url" type="url" value="${escapeHtml(day.lodging_url || "")}"></label>
      <label>Статус жилья<select name="day_${day.id}_lodging_status"${supportsInlineBookings ? "" : " disabled"}>${bookingStatusOptions(day.lodging_status, "Не требуется / без статуса")}</select></label>
    </div>
  </section>`;
}

function emptyFinalOvernight(day: TripDay): string {
  // Keep its day/base association in the form without displaying an unnecessary
  // hotel after the final destination (usually home).
  return `<input type="hidden" name="day_${day.id}_destination_id" value="${day.destination_id ?? ""}">`;
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
      <label class="admin-booking__title">Что нужно сделать<input name="booking_${booking.id}_title" required value="${escapeHtml(booking.title)}"></label>
      <label>Статус<select name="booking_${booking.id}_status">${selectOptions(BOOKING_STATUS_LABELS, booking.status)}</select></label>
      <label>Дата (необязательно)<input name="booking_${booking.id}_date" type="date" value="${escapeHtml(booking.date || "")}"></label>
      <label>Ссылка<input name="booking_${booking.id}_url" type="url" value="${escapeHtml(booking.url || "")}"></label>
      <label class="admin-booking__note">Заметка / номер брони<input name="booking_${booking.id}_notes" value="${escapeHtml(booking.notes || "")}"></label>
    </div>
    <button class="danger" type="button" data-delete-booking="${booking.id}" aria-label="Удалить">×</button>
  </article>`;
}

function tripRouteEditor(tripId: number, route: TripRouteData | null, days: TripDay[], supportsDayDestinations: boolean, supportsInlineBookings: boolean): string {
  if (!route) {
    return `<details class="admin-trip-route-section" open>
      <summary><div><p class="admin-kicker">МАРШРУТ</p><h2>Города и транспорт</h2></div></summary>
      <div class="admin-trip-route-body"><p class="admin-trip-route-setup">Для городов и транспорта нужно повторно выполнить актуальный <code>scripts/trip_planner_setup.sql</code> в Supabase. Ночёвки по-прежнему можно редактировать.</p>
      ${days.map(day => overnightEditor(day, [], supportsDayDestinations, supportsInlineBookings)).join("")}</div>
    </details>`;
  }
  const { destinations, legs } = route;
  const destinationIds = new Set(destinations.map(destination => destination.id));
  const nightDestination = new Map(days.map(day => [
    day.id,
    day.destination_id != null && destinationIds.has(day.destination_id)
      ? day.destination_id
      : day.destination_id == null
        ? destinations.find(destination => destination.trip_day_id === day.id)?.id ?? null
        : null,
  ]));
  const nightsFor = (destination: TripDestination): TripDay[] => days.filter(day => nightDestination.get(day.id) === destination.id);
  const unassignedNights = days.filter(day => nightDestination.get(day.id) == null);
  const isOpen = tripUiState.savedTripRouteOpen?.tripId === tripId ? tripUiState.savedTripRouteOpen.open : destinations.length === 0;
  return `<details class="admin-trip-route-section" data-trip-route="${tripId}"${isOpen ? " open" : ""}>
    <summary>
      <div><p class="admin-kicker">МАРШРУТ</p><h2>Города и транспорт</h2></div>
      <span>${destinations.length} ${destinations.length === 1 ? "город" : "городов"}</span>
    </summary>
    <div class="admin-trip-route-body">
    <p class="admin-trip-route-hint">Добавьте города по порядку, включая город отправления в начале и возвращение домой в конце. Транспорт появится между ними; ночёвку можно привязать к любому городу.</p>
    ${route.supportsTimes ? "" : `<p class="admin-trip-route-setup">Повторно выполните актуальный SQL, чтобы включить время отправления и прибытия.</p>`}
    ${route.supportsLegDays ? "" : `<p class="admin-trip-route-setup">Повторно выполните актуальный SQL, чтобы назначать транспорт определённому дню.</p>`}
    ${route.supportsBookingUrl ? "" : `<p class="admin-trip-route-setup">Повторно выполните актуальный SQL, чтобы сохранять ссылки на билеты.</p>`}
    ${route.supportsDestinationDays ? "" : `<p class="admin-trip-route-setup">Повторно выполните актуальный SQL, чтобы назначать дни городам.</p>`}
    <div class="admin-trip-destinations">
      ${destinations.length ? destinations.map((destination, index) => {
        const next = destinations[index + 1];
        const leg = next ? legs.find((item) => item.from_destination_id === destination.id && item.to_destination_id === next.id) : undefined;
        return `<div class="admin-trip-route-piece">
          <article class="admin-trip-destination" data-destination-id="${destination.id}">
            <span class="admin-trip-destination__position">${index + 1}</span>
            <div class="admin-trip-destination__fields">
              <label>Город<input name="destination_${destination.id}_name" required value="${escapeHtml(destination.name)}"></label>
              <label>День посещения<select name="destination_${destination.id}_trip_day_id" data-destination-day="${destination.id}" data-current-day="${destination.trip_day_id ?? ""}"${route.supportsDestinationDays ? "" : " disabled"}>
                <option value="">Не назначен</option>
                ${days.map((day) => `<option value="${day.id}"${destination.trip_day_id === day.id ? " selected" : ""}>День ${day.day_number}${day.date ? ` · ${escapeHtml(day.date)}` : ""}</option>`).join("")}
              </select></label>
              <label>Комментарий<input name="destination_${destination.id}_notes" value="${escapeHtml(destination.notes || "")}" placeholder="Ночёвка, район, планы…"></label>
            </div>
            <div class="admin-trip-destination__actions">
              <button type="button" data-move-destination="up" data-destination-id="${destination.id}" aria-label="Переместить город выше"${index === 0 ? " disabled" : ""}>↑</button>
              <button type="button" data-move-destination="down" data-destination-id="${destination.id}" aria-label="Переместить город ниже"${index === destinations.length - 1 ? " disabled" : ""}>↓</button>
              <button type="button" class="secondary" data-place-destination="${destination.id}">${destination.latitude == null ? "Поставить на карте" : "Переставить"}</button>
              <button type="button" class="danger" data-delete-destination="${destination.id}">×</button>
            </div>
          </article>
          ${nightsFor(destination).map(day => !next && !day.overnight_city && !day.lodging_name && !day.lodging_url && !day.lodging_status
            ? emptyFinalOvernight(day)
            : overnightEditor(day, destinations, supportsDayDestinations, supportsInlineBookings)).join("")}
          ${leg ? `<article class="admin-trip-leg" data-leg-id="${leg.id}">
            <span class="admin-trip-leg__arrow">↓</span>
            <label>День переезда<select name="leg_${leg.id}_trip_day_id"${route.supportsLegDays ? "" : " disabled"}>
              <option value="">Не назначен</option>
              ${days.map((day) => `<option value="${day.id}"${leg.trip_day_id === day.id ? " selected" : ""}>День ${day.day_number}${day.date ? ` · ${escapeHtml(day.date)}` : ""}</option>`).join("")}
            </select></label>
            <label>Транспорт<select name="leg_${leg.id}_mode">${selectOptions(TRANSPORT_MODE_LABELS, leg.mode)}</select></label>
            <label>Детали<input name="leg_${leg.id}_details" value="${escapeHtml(leg.details || "")}" placeholder="Hayabusa 15, пересадка в…"></label>
            <label>Билет / бронь<input name="leg_${leg.id}_booking_url" type="url" value="${escapeHtml(leg.booking_url || "")}" placeholder="https://…"${route.supportsBookingUrl ? "" : " disabled"}></label>
            <label>Отправление<input name="leg_${leg.id}_departure_time" type="time" value="${escapeHtml((leg.departure_time || "").slice(0, 5))}"${route.supportsTimes ? "" : " disabled"}></label>
            <label>Прибытие<input name="leg_${leg.id}_arrival_time" type="time" value="${escapeHtml((leg.arrival_time || "").slice(0, 5))}"${route.supportsTimes ? "" : " disabled"}></label>
            <label class="admin-trip-check"><input name="leg_${leg.id}_booked" type="checkbox"${leg.booked ? " checked" : ""}> Забронировано</label>
            <label class="admin-trip-check"><input name="leg_${leg.id}_paid" type="checkbox"${leg.paid ? " checked" : ""}> Оплачено</label>
          </article>` : ""}
        </div>`;
      }).join("") : `<p class="admin-trip-day__empty">Добавьте первый город — для него не нужна запись в базе мест.</p>`}
    </div>
    ${unassignedNights.length ? `<div class="admin-trip-unassigned-nights"><p class="admin-trip-route-hint">Ночёвки без выбранного города</p>${unassignedNights.map(day => overnightEditor(day, destinations, supportsDayDestinations, supportsInlineBookings)).join("")}</div>` : ""}
    <div class="admin-add-destination">
      <label>Следующий город<input name="new_destination_name" placeholder="Например, 仙台 / Сендай"></label>
      <button type="button" data-add-destination>＋ Добавить город</button>
    </div>
    </div>
  </details>`;
}

export function tripEditorPage(options: TripPlannerOptions, trip: Trip, tripRoute: TripRouteData | null, places: Map<number, TripPlannerPlace>): string {
  const placeOptions = [...options.places]
    .sort((a, b) => placeName(a).localeCompare(placeName(b), "ru"))
    .map((place) => `<option value="#${place.id} · ${escapeHtml(placeName(place))} — ${escapeHtml(place.prefecture)}"></option>`)
    .join("");

  return `<main class="admin-shell admin-trip-editor-shell">
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
      ${tripRouteEditor(trip.id, tripRoute, trip.trip_days, trip.supports_day_destinations, trip.supports_inline_bookings)}
      <section class="admin-trip-map-section">
        <div class="admin-trip-map-controls">
          <p class="admin-kicker">МАРШРУТ НА КАРТЕ</p>
          <p>Точки соединены в порядке дней и остановок. Нажмите на любое место, чтобы добавить его в маршрут.</p>
          <label>Показывать
            <select id="trip-map-layer">
              <option value="overview"${tripUiState.savedTripMapLayer?.tripId === trip.id && tripUiState.savedTripMapLayer.mode === "overview" ? " selected" : ""}>Обзор городов</option>
              <option value="day"${tripUiState.savedTripMapLayer?.tripId === trip.id && tripUiState.savedTripMapLayer.mode === "day" ? " selected" : ""}>Выбранный день</option>
              <option value="all"${tripUiState.savedTripMapLayer?.tripId !== trip.id || tripUiState.savedTripMapLayer.mode === "all" ? " selected" : ""}>Вся поездка</option>
            </select>
          </label>
          <label>Добавлять в день
            <select id="trip-map-day">
              ${trip.trip_days.map((day) => `<option value="${day.id}"${tripUiState.savedTripMapDay?.tripId === trip.id && tripUiState.savedTripMapDay.dayId === day.id ? " selected" : ""}>День ${day.day_number}${day.date ? ` · ${escapeHtml(day.date)}` : " · без даты"}</option>`).join("")}
            </select>
          </label>
          <p id="trip-map-message" class="admin-trip-map-message" aria-live="polite"></p>
        </div>
        <div id="admin-trip-map" class="admin-trip-map"></div>
      </section>
      <datalist id="trip-place-options">${placeOptions}</datalist>
      ${trip.supports_day_destinations ? "" : `<p class="admin-trip-route-setup">Повторно выполните актуальный SQL, чтобы привязать дни к городам.</p>`}
      ${trip.supports_inline_bookings ? "" : `<p class="admin-trip-route-setup">Повторно выполните актуальный SQL, чтобы отмечать жильё и входные билеты прямо в днях.</p>`}
      <div class="admin-trip-days">${trip.trip_days.map(day => dayEditor(day, trip.trip_days, places, trip.supports_inline_bookings)).join("")}</div>
      <section class="admin-bookings-section">
        <header><div><p class="admin-kicker">ЧЕКЛИСТ</p><h2>Прочие дела</h2></div><span>${trip.trip_bookings.filter((item) => item.status !== "planned").length} из ${trip.trip_bookings.length}</span></header>
        ${trip.trip_bookings.some((item) => item.kind !== "other") ? `<p class="admin-trip-route-setup">Здесь сохранены старые непривязанные записи. Жильё, транспорт и входные билеты теперь удобнее отмечать прямо в соответствующем дне.</p>` : ""}
        <div class="admin-bookings-list">
          ${trip.trip_bookings.length ? trip.trip_bookings.map(bookingEditor).join("") : `<p class="admin-trip-day__empty">Например: аренда машины, страховка, багаж или другое общее дело.</p>`}
        </div>
        <div class="admin-add-booking">
          <label>Новое дело<input name="new_booking_title" placeholder="Например, оформить страховку"></label>
          <button type="button" data-add-booking>＋ Добавить</button>
        </div>
      </section>
      <div class="admin-trip-editor__footer">
        <button type="button" class="danger" data-delete-trip>Удалить поездку</button>
        <div><button type="button" class="secondary" data-add-day>＋ Добавить день</button><button type="submit">Сохранить всё</button></div>
      </div>
      <p class="admin-error" aria-live="polite"></p>
    </form>
  </main>`;

}
