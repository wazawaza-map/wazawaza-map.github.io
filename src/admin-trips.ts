import { escapeHtml } from "./html";
import { getTrips, insertRow } from "./trip-api";
import { renderTripEditor } from "./trip-editor";
import { STATUS_LABELS, setupMessage, tripDates } from "./trip-format";
import { destroyTripMap } from "./trip-map";
import type { Trip, TripDay, TripPlannerOptions } from "./trip-types";
export type { TripPlannerPlace,TripPlannerSession } from "./trip-types";

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
          <p>${escapeHtml(tripDates(trip))} · ${trip.trip_days.length} дн. · ${trip.trip_bookings.filter((item) => item.status !== "planned").length}/${trip.trip_bookings.length} прочих дел готово</p>
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
      await renderTripEditor(options, trip.id, () => renderTripsDashboard(options));
    } catch (createError) {
      if (error) error.textContent = setupMessage(createError);
      if (button) button.disabled = false;
    }
  });
  document.querySelector(".admin-trip-list")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-edit-trip]");
    if (button) void renderTripEditor(options, Number(button.dataset.editTrip), () => renderTripsDashboard(options));
  });
}

export { primaryNav };
