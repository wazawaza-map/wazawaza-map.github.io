import { escapeHtml } from "./html";
import { BOOKING_KIND_LABELS, BOOKING_STATUS_LABELS, STATUS_LABELS, TRANSPORT_MODE_LABELS, placeName } from "./trip-format";
import { hasLodging, lodgingNightCount, lodgingSourceDay } from "./trip-lodging";
import type { BookingStatus, Trip, TripBooking, TripDay, TripDayTransport, TripDestination, TripPlannerOptions, TripPlannerPlace, TripRouteData, TripStop } from "./trip-types";
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

function stopTransportEditor(stop: TripStop, supported: boolean): string {
  if (!supported) return "";
  const enabled = Boolean(stop.to_transport_mode || stop.back_transport_mode);
  return `<div class="admin-stop-transport-control">
    <input type="hidden" name="stop_${stop.id}_transport_enabled" value="${enabled ? "1" : "0"}">
    <button class="secondary admin-stop-transport-add" type="button" data-add-stop-transport="${stop.id}"${enabled ? " hidden" : ""}>＋ Транспорт туда и обратно</button>
    <section class="admin-stop-transport" data-stop-transport-panel="${stop.id}"${enabled ? "" : " hidden"}>
      <header><strong>Транспорт к месту и обратно</strong><button class="danger" type="button" data-remove-stop-transport="${stop.id}">Убрать транспорт</button></header>
      <div class="admin-stop-transport__direction">
        <h4>Туда</h4>
        <label>Тип<select name="stop_${stop.id}_to_transport_mode">${selectOptions(TRANSPORT_MODE_LABELS, stop.to_transport_mode || "train")}</select></label>
        <label>Детали<input name="stop_${stop.id}_to_transport_details" value="${escapeHtml(stop.to_transport_details || "")}" placeholder="Линия, станция, пересадка…"></label>
        <label>Отправление<input name="stop_${stop.id}_to_departure_time" type="time" value="${escapeHtml((stop.to_departure_time || "").slice(0, 5))}"></label>
        <label>Прибытие<input name="stop_${stop.id}_to_arrival_time" type="time" value="${escapeHtml((stop.to_arrival_time || "").slice(0, 5))}"></label>
      </div>
      <div class="admin-stop-transport__direction">
        <h4>Обратно / дальше</h4>
        <label>Тип<select name="stop_${stop.id}_back_transport_mode">${selectOptions(TRANSPORT_MODE_LABELS, stop.back_transport_mode || "train")}</select></label>
        <label>Детали<input name="stop_${stop.id}_back_transport_details" value="${escapeHtml(stop.back_transport_details || "")}" placeholder="До отеля или следующего места…"></label>
        <label>Отправление<input name="stop_${stop.id}_back_departure_time" type="time" value="${escapeHtml((stop.back_departure_time || "").slice(0, 5))}"></label>
        <label>Прибытие<input name="stop_${stop.id}_back_arrival_time" type="time" value="${escapeHtml((stop.back_arrival_time || "").slice(0, 5))}"></label>
      </div>
    </section>
  </div>`;
}

function dayEditor(
  day: TripDay,
  days: TripDay[],
  places: Map<number, TripPlannerPlace>,
  supportsInlineBookings: boolean,
  supportsStopTransport: boolean,
): string {
  return `<section class="admin-trip-day" id="trip-day-${day.id}" data-day-id="${day.id}">
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
          ${stopTransportEditor(stop, supportsStopTransport)}
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

function destinationName(id: number | null, destinations: TripDestination[], fallback = "Город не выбран"): string {
  return destinations.find(destination => destination.id === id)?.name ?? fallback;
}

function dayTransportEditor(transport: TripDayTransport, index: number, count: number): string {
  return `<section class="admin-day-transport" data-day-transport-id="${transport.id}">
    <header><div><p class="admin-kicker">ПЕРЕЕЗД ${index + 1}</p><h4>${escapeHtml(transport.from_name || "Откуда?")} → ${escapeHtml(transport.to_name || "Куда?")}</h4></div><div>
      <button type="button" data-move-day-transport="up" data-day-transport-id="${transport.id}"${index === 0 ? " disabled" : ""}>↑</button>
      <button type="button" data-move-day-transport="down" data-day-transport-id="${transport.id}"${index === count - 1 ? " disabled" : ""}>↓</button>
      <button class="danger" type="button" data-delete-day-transport="${transport.id}">Удалить</button>
    </div></header>
    <div class="admin-form-grid">
      <label>Откуда<input name="day_transport_${transport.id}_from_name" value="${escapeHtml(transport.from_name || "")}" placeholder="Карумаи"></label>
      <label>Куда<input name="day_transport_${transport.id}_to_name" value="${escapeHtml(transport.to_name || "")}" placeholder="Хатинохе"></label>
      <label>Транспорт<select name="day_transport_${transport.id}_mode">${selectOptions(TRANSPORT_MODE_LABELS, transport.mode || "train")}</select></label>
      <label>Детали<input name="day_transport_${transport.id}_details" value="${escapeHtml(transport.details || "")}" placeholder="Поезд, рейс, пересадка…"></label>
      <label>Отправление<input name="day_transport_${transport.id}_departure_time" type="time" value="${escapeHtml((transport.departure_time || "").slice(0, 5))}"></label>
      <label>Прибытие<input name="day_transport_${transport.id}_arrival_time" type="time" value="${escapeHtml((transport.arrival_time || "").slice(0, 5))}"></label>
      <label>Билет / бронь<input name="day_transport_${transport.id}_booking_url" type="url" value="${escapeHtml(transport.booking_url || "")}" placeholder="https://…"></label>
      <label class="admin-trip-check"><input name="day_transport_${transport.id}_booked" type="checkbox"${transport.booked ? " checked" : ""}> Забронировано</label>
      <label class="admin-trip-check"><input name="day_transport_${transport.id}_paid" type="checkbox"${transport.paid ? " checked" : ""}> Оплачено</label>
    </div>
  </section>`;
}

function dailyItineraryEditor(trip: Trip, route: TripRouteData | null): string {
  if (!trip.supports_daily_itinerary) {
    return `<section class="admin-trip-route-setup"><strong>Обзор по дням ещё не включён.</strong><br>Выполните актуальный <code>scripts/trip_planner_setup.sql</code> в Supabase SQL Editor.</section>`;
  }
  const destinations = route?.destinations ?? [];
  return `<details class="admin-trip-route-section" open>
    <summary><div><p class="admin-kicker">МАРШРУТ</p><h2>Дни, транспорт и ночёвки</h2></div><span>${trip.trip_days.length} дн.</span></summary>
    <div class="admin-trip-route-body">
      <label class="admin-trip-home">Дом / точка отправления и возвращения<input name="home_city" value="${escapeHtml(trip.home_city || "Токио")}" placeholder="Токио"></label>
      <div class="admin-trip-itinerary">
        ${trip.trip_days.map((day, index) => {
          const city = destinationName(day.city_destination_id, destinations);
          const overnight = destinationName(day.destination_id, destinations, day.overnight_city || "Не выбрана");
          const isFirst = index === 0;
          const isLast = index === trip.trip_days.length - 1;
          const transportFrom = isFirst ? trip.home_city || "Токио" : city;
          const transportTo = isFirst ? city : isLast ? trip.home_city || "Токио" : overnight;
          const lodgingSource = lodgingSourceDay(day, trip.trip_days);
          const previousLodging = index > 0 ? lodgingSourceDay(trip.trip_days[index - 1], trip.trip_days) : null;
          return `<article class="admin-trip-itinerary-day">
            <header><span>${day.day_number}</span><div><p class="admin-kicker">ДЕНЬ ${day.day_number}</p><h3>${escapeHtml(city)}</h3><time>${escapeHtml(day.date || "Без даты")}</time></div></header>
            <div class="admin-form-grid">
              <label>Город дня<select name="day_${day.id}_city_destination_id">
                <option value="">Не выбран</option>
                ${destinations.map(destination => `<option value="${destination.id}"${destination.id === day.city_destination_id ? " selected" : ""}>${escapeHtml(destination.name)}</option>`).join("")}
              </select></label>
            </div>
            <div class="admin-day-transports">
              ${trip.supports_multiple_transports
                ? day.trip_day_transports.map((transport, transportIndex) => dayTransportEditor(transport, transportIndex, day.trip_day_transports.length)).join("") || `<p class="admin-trip-day__empty">В этот день пока нет переездов.</p>`
                : `<section class="admin-day-transport"><p class="admin-trip-route-setup">Выполните актуальный SQL, чтобы добавить несколько переездов. Пока сохранён старый маршрут: ${escapeHtml(`${transportFrom} → ${transportTo}`)}.</p></section>`}
              ${trip.supports_multiple_transports ? `<button class="secondary admin-add-day-transport" type="button" data-add-day-transport="${day.id}">＋ Добавить транспорт</button>` : ""}
            </div>
            ${isLast
              ? emptyFinalOvernight(day)
              : day.lodging_source_day_id && trip.supports_lodging_spans
                ? linkedOvernight(day, lodgingSource, destinations)
                : overnightEditor(day, destinations, trip.supports_day_destinations, trip.supports_inline_bookings, trip.supports_lodging_spans, lodgingNightCount(day, trip.trip_days), Math.max(1, trip.trip_days.length - index - 1), previousLodging && hasLodging(previousLodging) ? previousLodging : null)
            }
            <button class="secondary admin-trip-plan-link" type="button" data-scroll-day="${day.id}">↓ Открыть план дня</button>
          </article>`;
        }).join("")}
      </div>
    </div>
  </details>`;
}

function overnightEditor(day: TripDay, destinations: TripDestination[], supportsDayDestinations: boolean, supportsInlineBookings: boolean, supportsLodgingSpans = false, nights = 1, maxNights = 1, previousLodging: TripDay | null = null): string {
  return `<section class="admin-trip-overnight" aria-label="Ночёвка после дня ${day.day_number}">
    <div class="admin-trip-overnight__heading">
      <span class="admin-trip-overnight__icon" aria-hidden="true">☾</span>
      <div><p class="admin-kicker">ПОСЛЕ ДНЯ ${day.day_number}</p><h3>Ночёвка</h3></div>
    </div>
    <div class="admin-form-grid">
      ${supportsLodgingSpans ? `<label>Количество ночей<select name="day_${day.id}_lodging_nights">${Array.from({ length: maxNights }, (_, index) => index + 1).map((count) => `<option value="${count}"${count === nights ? " selected" : ""}>${count}</option>`).join("")}</select></label>` : ""}
      <label>Город ночёвки / база<select name="day_${day.id}_destination_id" data-day-base="${day.id}"${supportsDayDestinations ? "" : " disabled"}>
        <option value="">Не выбран</option>
        ${destinations.map((destination, index) => `<option value="${destination.id}"${destination.id === day.destination_id ? " selected" : ""}>${index + 1}. ${escapeHtml(destination.name)}</option>`).join("")}
      </select></label>
      <label>Отель / жильё<input name="day_${day.id}_lodging_name" value="${escapeHtml(day.lodging_name || "")}"></label>
      <label>Ссылка на жильё<input name="day_${day.id}_lodging_url" type="url" value="${escapeHtml(day.lodging_url || "")}"></label>
      <label>Статус жилья<select name="day_${day.id}_lodging_status"${supportsInlineBookings ? "" : " disabled"}>${bookingStatusOptions(day.lodging_status, "Не требуется / без статуса")}</select></label>
    </div>
    ${supportsLodgingSpans && previousLodging ? `<button class="secondary admin-trip-overnight__same" type="button" data-use-previous-lodging="${day.id}" data-lodging-source-day="${previousLodging.id}">Использовать ту же ночёвку, что вчера</button>` : ""}
  </section>`;
}

function linkedOvernight(day: TripDay, source: TripDay, destinations: TripDestination[]): string {
  const city = destinationName(source.destination_id, destinations, source.overnight_city || "Город не выбран");
  const details = [source.lodging_name, source.lodging_status ? BOOKING_STATUS_LABELS[source.lodging_status] : null].filter(Boolean).join(" · ");
  return `<section class="admin-trip-overnight admin-trip-overnight--linked" aria-label="Ночёвка после дня ${day.day_number}">
    <input type="hidden" name="day_${day.id}_lodging_source_day_id" value="${source.id}">
    <div class="admin-trip-overnight__heading">
      <span class="admin-trip-overnight__icon" aria-hidden="true">☾</span>
      <div><p class="admin-kicker">ПОСЛЕ ДНЯ ${day.day_number}</p><h3>Та же ночёвка · ${escapeHtml(city)}</h3>${details ? `<p>${escapeHtml(details)}</p>` : ""}</div>
    </div>
    <button class="secondary" type="button" data-detach-lodging="${day.id}">Изменить только эту ночь</button>
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

export function tripEditorPage(options: TripPlannerOptions, trip: Trip, tripRoute: TripRouteData | null, places: Map<number, TripPlannerPlace>): string {
  const placeOptions = [...options.places]
    .sort((a, b) => placeName(a).localeCompare(placeName(b), "ru"))
    .map((place) => `<option value="#${place.id} · ${escapeHtml(placeName(place))} — ${escapeHtml(place.prefecture)}"></option>`)
    .join("");

  return `<main class="admin-shell admin-trip-editor-shell">
    <header class="admin-header">
      <div><p class="admin-kicker">WAZAWAZA · ПОЕЗДКА #${trip.id}</p><h1>${escapeHtml(trip.title)}</h1></div>
      <div class="admin-account"><button type="button" data-back-to-trips>← Все поездки</button><button type="button" data-export-trip>Экспорт / PDF</button><button type="button" data-export-telegram>Экспорт для Telegram</button><button id="logout" type="button">Выйти</button></div>
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
      ${dailyItineraryEditor(trip, tripRoute)}
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
      <div class="admin-trip-days">${trip.trip_days.map(day => dayEditor(day, trip.trip_days, places, trip.supports_inline_bookings, trip.supports_stop_transport)).join("")}</div>
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
