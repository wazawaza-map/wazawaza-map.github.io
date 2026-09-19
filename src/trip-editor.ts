import { escapeHtml } from "./html";
import { compactStopPositions, deleteRow, getTripRoute, getTrips, insertRow, renumberRows, updateRow } from "./trip-api";
import { persistTripForm } from "./trip-form";
import { openTripExportPreview, writeTripExportPreview } from "./trip-export";
import { resolvePlaceId, setupMessage } from "./trip-format";
import { destroyTripMap, initializeTripMap } from "./trip-map";
import type { TripBooking, TripDay, TripDestination, TripLeg, TripPlannerOptions, TripStop } from "./trip-types";
import { tripUiState } from "./trip-ui-state";
import { tripEditorPage } from "./trip-view";

export async function renderTripEditor(options: TripPlannerOptions, tripId: number, onBack: () => Promise<void>): Promise<void> {
  destroyTripMap();
  options.app.innerHTML = `<main class="admin-loading">Открываю поездку…</main>`;
  try {
    const trip = (await getTrips(options, tripId))[0];
    if (!trip) throw new Error("Поездка не найдена.");
    const tripRoute = await getTripRoute(options, trip.id);
    const places = new Map(options.places.map((place) => [place.id, place]));
    options.app.innerHTML = tripEditorPage(options, trip, tripRoute, places);

    const form = document.querySelector<HTMLFormElement>("#trip-editor")!;
    const error = form.querySelector<HTMLElement>(".admin-error");
    const routeDetails = form.querySelector<HTMLDetailsElement>("[data-trip-route]");
    routeDetails?.addEventListener("toggle", () => {
      tripUiState.savedTripRouteOpen = { tripId: trip.id, open: routeDetails.open };
    });
    const destinations = tripRoute?.destinations ?? [];
    const legs = tripRoute?.legs ?? [];
    document.querySelector("[data-back-to-trips]")?.addEventListener("click", () => void onBack());
    document.querySelector("[data-export-trip]")?.addEventListener("click", () => void exportCurrentTrip());
    document.querySelector("#logout")?.addEventListener("click", () => {
      destroyTripMap();
      options.onLogout();
    });

    const tripMap = initializeTripMap(options, trip, tripRoute, places, form, persistChangedForm, () => renderTripEditor(options, trip.id, onBack));

    function persistChangedForm(): Promise<void> {
      return persistTripForm(options, trip, tripRoute, new FormData(form));
    }

    async function exportCurrentTrip(): Promise<void> {
      if (error) error.textContent = "";
      let preview: Window | undefined;
      try {
        preview = openTripExportPreview();
        await persistChangedForm();
        const savedTrip = (await getTrips(options, trip.id))[0];
        if (!savedTrip) throw new Error("Поездка не найдена после сохранения.");
        writeTripExportPreview(preview, savedTrip, await getTripRoute(options, trip.id), places);
      } catch (exportError) {
        preview?.close();
        if (error) {
          error.textContent = setupMessage(exportError);
          error.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }

    async function reconcileRouteLegs(orderedDestinations: TripDestination[]): Promise<void> {
      const desiredPairs = orderedDestinations.slice(0, -1).map((from, index) => ({
        from,
        to: orderedDestinations[index + 1],
      }));
      const desiredKeys = new Set(desiredPairs.map(({ from, to }) => `${from.id}:${to.id}`));
      const existingKeys = new Set(legs.map((leg) => `${leg.from_destination_id}:${leg.to_destination_id}`));
      for (const leg of legs) {
        if (!desiredKeys.has(`${leg.from_destination_id}:${leg.to_destination_id}`)) {
          await deleteRow(options, "trip_legs", leg.id);
        }
      }
      for (const { from, to } of desiredPairs) {
        if (!existingKeys.has(`${from.id}:${to.id}`)) {
          await insertRow<TripLeg>(options, "trip_legs", {
            trip_id: trip.id,
            ...(tripRoute?.supportsLegDays ? { trip_day_id: to.trip_day_id ?? from.trip_day_id ?? null } : {}),
            from_destination_id: from.id,
            to_destination_id: to.id,
            mode: "train",
          });
        }
      }
    }

    function routeChangeRemovesFilledLeg(orderedDestinations: TripDestination[]): boolean {
      const desiredKeys = new Set(orderedDestinations.slice(0, -1).map((from, index) => `${from.id}:${orderedDestinations[index + 1].id}`));
      const data = new FormData(form);
      return legs.some((leg) => !desiredKeys.has(`${leg.from_destination_id}:${leg.to_destination_id}`) && (
        String(data.get(`leg_${leg.id}_details`) || leg.details || "").trim()
        || String(data.get(`leg_${leg.id}_departure_time`) || leg.departure_time || "").trim()
        || String(data.get(`leg_${leg.id}_arrival_time`) || leg.arrival_time || "").trim()
        || String(data.get(`leg_${leg.id}_booking_url`) || leg.booking_url || "").trim()
        || data.get(`leg_${leg.id}_booked`) === "on"
        || data.get(`leg_${leg.id}_paid`) === "on"
      ));
    }

    async function saveDestinationOrder(orderedDestinations: TripDestination[]): Promise<void> {
      const changed = orderedDestinations.filter((destination, index) => destination.position !== index + 1);
      if (changed.length) {
        const temporaryStart = Math.max(0, ...destinations.map((item) => item.position)) + 1_000;
        for (const [index, destination] of changed.entries()) {
          await updateRow(options, "trip_destinations", destination.id, { position: temporaryStart + index });
        }
        for (const destination of changed) {
          await updateRow(options, "trip_destinations", destination.id, { position: orderedDestinations.indexOf(destination) + 1 });
        }
      }
      await reconcileRouteLegs(orderedDestinations);
      tripUiState.savedTripRouteOpen = { tripId: trip.id, open: true };
      await renderTripEditor(options, trip.id, onBack);
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
        await persistChangedForm();
        for (const day of trip.trip_days) await insertPendingStop(day);
        await renderTripEditor(options, trip.id, onBack);
      } catch (saveError) {
        if (error) error.textContent = setupMessage(saveError);
        if (submit) submit.disabled = false;
      }
    });

    form.querySelector("[data-add-day]")?.addEventListener("click", async () => {
      try {
        await persistChangedForm();
        const dayNumber = Math.max(0, ...trip.trip_days.map((day) => day.day_number)) + 1;
        let date: string | null = null;
        const currentStartDate = String(new FormData(form).get("start_date") || "") || null;
        if (currentStartDate) {
          const candidate = new Date(`${currentStartDate}T00:00:00Z`);
          candidate.setUTCDate(candidate.getUTCDate() + dayNumber - 1);
          date = candidate.toISOString().slice(0, 10);
        }
        await insertRow<TripDay>(options, "trip_days", { trip_id: trip.id, day_number: dayNumber, date });
        await renderTripEditor(options, trip.id, onBack);
      } catch (dayError) {
        if (error) error.textContent = setupMessage(dayError);
      }
    });

    form.querySelector("[data-delete-trip]")?.addEventListener("click", async () => {
      if (!window.confirm(`Удалить поездку «${trip.title}»?`)) return;
      try {
        await deleteRow(options, "trips", trip.id);
        await onBack();
      } catch (deleteError) {
        if (error) error.textContent = setupMessage(deleteError);
      }
    });

    form.addEventListener("change", async (event) => {
      const target = event.target as HTMLElement;
      const baseSelect = target.closest<HTMLSelectElement>("[data-day-base]");
      if (baseSelect && tripRoute?.supportsDestinationDays) {
        const destinationId = Number(baseSelect.value);
        const destinationDaySelect = destinationId
          ? form.querySelector<HTMLSelectElement>(`[data-destination-day="${destinationId}"]`)
          : null;
        if (destinationDaySelect && destinationDaySelect.value !== baseSelect.dataset.dayBase) {
          destinationDaySelect.value = baseSelect.dataset.dayBase ?? "";
          destinationDaySelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      const select = target.closest<HTMLSelectElement>("[data-destination-day]");
      if (!select || !tripRoute?.supportsDestinationDays) return;
      select.disabled = true;
      if (error) error.textContent = "";
      try {
        const data = new FormData(form);
        const dayOrder = new Map(trip.trip_days.map((day) => [day.id, day.day_number]));
        const baseDayByDestination = new Map(
          trip.trip_days.flatMap((day) => day.destination_id ? [[day.destination_id, day.id] as const] : []),
        );
        const incomingDayByDestination = new Map(legs.flatMap((leg) => leg.trip_day_id ? [[leg.to_destination_id, leg.trip_day_id] as const] : []));
        const outgoingDayByDestination = new Map(legs.flatMap((leg) => leg.trip_day_id ? [[leg.from_destination_id, leg.trip_day_id] as const] : []));
        const nextDestination = new Map(legs.map((leg) => [leg.from_destination_id, leg.to_destination_id]));
        const hasIncoming = new Set(legs.map((leg) => leg.to_destination_id));
        const routeSequence: number[] = [];
        const appendChain = (startId: number): void => {
          let currentId: number | undefined = startId;
          while (currentId && !routeSequence.includes(currentId)) {
            routeSequence.push(currentId);
            currentId = nextDestination.get(currentId);
          }
        };
        destinations.filter((destination) => !hasIncoming.has(destination.id)).forEach((destination) => appendChain(destination.id));
        destinations.forEach((destination) => appendChain(destination.id));
        const routeRank = new Map(routeSequence.map((destinationId, index) => [destinationId, index]));
        const reordered = destinations.map((destination) => ({
          ...destination,
          trip_day_id: Number(data.get(`destination_${destination.id}_trip_day_id`)) || null,
        })).sort((left, right) => {
          const leftDayId = left.trip_day_id ?? baseDayByDestination.get(left.id) ?? incomingDayByDestination.get(left.id) ?? outgoingDayByDestination.get(left.id);
          const rightDayId = right.trip_day_id ?? baseDayByDestination.get(right.id) ?? incomingDayByDestination.get(right.id) ?? outgoingDayByDestination.get(right.id);
          const leftDayRank = leftDayId ? dayOrder.get(leftDayId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
          const rightDayRank = rightDayId ? dayOrder.get(rightDayId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
          return leftDayRank - rightDayRank || (routeRank.get(left.id) ?? left.position) - (routeRank.get(right.id) ?? right.position);
        });
        if (routeChangeRemovesFilledLeg(reordered) && !window.confirm("Из-за нового порядка изменятся заполненные участки транспорта. Назначить день городу и пересоздать эти участки?")) {
          select.value = select.dataset.currentDay ?? "";
          select.disabled = false;
          return;
        }
        await persistChangedForm();
        await saveDestinationOrder(reordered);
      } catch (destinationDayError) {
        select.value = select.dataset.currentDay ?? "";
        select.disabled = false;
        if (error) {
          error.textContent = setupMessage(destinationDayError);
          error.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    });

    form.addEventListener("change", async (event) => {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>("[data-transfer-stop]");
      if (!select) return;
      const stopId = Number(select.dataset.transferStop);
      const sourceDayId = Number(select.dataset.currentDay);
      const targetDayId = Number(select.value);
      if (!stopId || !sourceDayId || !targetDayId || sourceDayId === targetDayId) return;
      select.disabled = true;
      if (error) error.textContent = "";
      try {
        await persistChangedForm();
        const sourceDay = trip.trip_days.find((day) => day.id === sourceDayId);
        const targetDay = trip.trip_days.find((day) => day.id === targetDayId);
        const stop = sourceDay?.trip_stops.find((item) => item.id === stopId);
        if (!sourceDay || !targetDay || !stop) throw new Error("Не удалось найти место для переноса.");
        const targetPosition = Math.max(0, ...targetDay.trip_stops.map((item) => item.position)) + 1;
        await updateRow(options, "trip_stops", stop.id, { trip_day_id: targetDay.id, position: targetPosition });
        await compactStopPositions(options, sourceDay.trip_stops.filter((item) => item.id !== stop.id));
        tripUiState.savedTripMapDay = { tripId: trip.id, dayId: targetDay.id };
        await renderTripEditor(options, trip.id, onBack);
      } catch (transferError) {
        select.value = String(sourceDayId);
        select.disabled = false;
        if (error) {
          error.textContent = setupMessage(transferError);
          error.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    });

    form.addEventListener("click", async (event) => {
      const target = event.target as HTMLElement;
      const planLink = target.closest<HTMLButtonElement>("[data-scroll-day]");
      if (planLink) {
        document.querySelector(`#trip-day-${Number(planLink.dataset.scrollDay)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const addStopTransport = target.closest<HTMLButtonElement>("[data-add-stop-transport]");
      const removeStopTransport = target.closest<HTMLButtonElement>("[data-remove-stop-transport]");
      if (addStopTransport || removeStopTransport) {
        const stopId = Number(addStopTransport?.dataset.addStopTransport || removeStopTransport?.dataset.removeStopTransport);
        const enabled = Boolean(addStopTransport);
        const flag = form.elements.namedItem(`stop_${stopId}_transport_enabled`) as HTMLInputElement | null;
        const panel = form.querySelector<HTMLElement>(`[data-stop-transport-panel="${stopId}"]`);
        const addButton = form.querySelector<HTMLButtonElement>(`[data-add-stop-transport="${stopId}"]`);
        if (flag) flag.value = enabled ? "1" : "0";
        if (panel) panel.hidden = !enabled;
        if (addButton) addButton.hidden = enabled;
        return;
      }
      const add = target.closest<HTMLButtonElement>("[data-add-stop]");
      const deleteStop = target.closest<HTMLButtonElement>("[data-delete-stop]");
      const deleteDay = target.closest<HTMLButtonElement>("[data-delete-day]");
      const move = target.closest<HTMLButtonElement>("[data-move-stop]");
      const addBooking = target.closest<HTMLButtonElement>("[data-add-booking]");
      const deleteBooking = target.closest<HTMLButtonElement>("[data-delete-booking]");
      const addDestination = target.closest<HTMLButtonElement>("[data-add-destination]");
      const moveDestination = target.closest<HTMLButtonElement>("[data-move-destination]");
      const placeDestination = target.closest<HTMLButtonElement>("[data-place-destination]");
      const deleteDestination = target.closest<HTMLButtonElement>("[data-delete-destination]");
      try {
        if (moveDestination) {
          if (!tripRoute) throw new Error("Сначала выполните актуальный scripts/trip_planner_setup.sql в Supabase.");
          const destinationId = Number(moveDestination.dataset.destinationId);
          const index = destinations.findIndex((item) => item.id === destinationId);
          const otherIndex = moveDestination.dataset.moveDestination === "up" ? index - 1 : index + 1;
          const current = destinations[index];
          const other = destinations[otherIndex];
          if (!current || !other) return;
          const reordered = [...destinations];
          [reordered[index], reordered[otherIndex]] = [reordered[otherIndex], reordered[index]];
          if (routeChangeRemovesFilledLeg(reordered) && !window.confirm("У изменившихся участков транспорта есть заполненные данные. Переставить город и пересоздать эти участки?")) return;
          await persistChangedForm();
          await saveDestinationOrder(reordered);
        } else if (addDestination) {
          if (!tripRoute) throw new Error("Сначала выполните актуальный scripts/trip_planner_setup.sql в Supabase.");
          await persistChangedForm();
          const data = new FormData(form);
          const name = String(data.get("new_destination_name") || "").trim();
          if (!name) throw new Error("Введите название города.");
          const previous = destinations.at(-1);
          const normalizedName = name.normalize("NFKC").toLocaleLowerCase("ja");
          const repeated = destinations.find((item) =>
            String(data.get(`destination_${item.id}_name`) || item.name).trim().normalize("NFKC").toLocaleLowerCase("ja") === normalizedName
          );
          const destination = await insertRow<TripDestination>(options, "trip_destinations", {
            trip_id: trip.id,
            name,
            position: destinations.length + 1,
            latitude: repeated?.latitude ?? null,
            longitude: repeated?.longitude ?? null,
          });
          if (previous) {
            await insertRow<TripLeg>(options, "trip_legs", {
              trip_id: trip.id,
              from_destination_id: previous.id,
              to_destination_id: destination.id,
              mode: "train",
            });
          }
          await renderTripEditor(options, trip.id, onBack);
        } else if (placeDestination) {
          await tripMap.placeDestination(Number(placeDestination.dataset.placeDestination));
        } else if (deleteDestination) {
          const destinationId = Number(deleteDestination.dataset.deleteDestination);
          const index = destinations.findIndex((item) => item.id === destinationId);
          const destination = destinations[index];
          if (!destination || !window.confirm(`Удалить город «${destination.name}» из маршрута?`)) return;
          await persistChangedForm();
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
          await renderTripEditor(options, trip.id, onBack);
        } else if (addBooking) {
          await persistChangedForm();
          const data = new FormData(form);
          const title = String(data.get("new_booking_title") || "").trim();
          if (!title) throw new Error("Введите, что нужно сделать.");
          await insertRow<TripBooking>(options, "trip_bookings", {
            trip_id: trip.id,
            kind: "other",
            title,
            status: "planned",
            position: Math.max(0, ...trip.trip_bookings.map((item) => item.position)) + 1,
          });
          await renderTripEditor(options, trip.id, onBack);
        } else if (deleteBooking) {
          await persistChangedForm();
          await deleteRow(options, "trip_bookings", Number(deleteBooking.dataset.deleteBooking));
          await renderTripEditor(options, trip.id, onBack);
        } else if (add) {
          await persistChangedForm();
          const dayId = Number(add.dataset.addStop);
          const day = trip.trip_days.find((item) => item.id === dayId)!;
          if (!await insertPendingStop(day)) throw new Error("Выберите место или введите свою остановку.");
          await renderTripEditor(options, trip.id, onBack);
        } else if (deleteStop) {
          await persistChangedForm();
          await deleteRow(options, "trip_stops", Number(deleteStop.dataset.deleteStop));
          await renderTripEditor(options, trip.id, onBack);
        } else if (deleteDay) {
          if (trip.trip_days.length === 1) throw new Error("В поездке должен остаться хотя бы один день.");
          if (!window.confirm("Удалить день вместе со всеми остановками?")) return;
          await persistChangedForm();
          await deleteRow(options, "trip_days", Number(deleteDay.dataset.deleteDay));
          const remaining = trip.trip_days.filter((day) => day.id !== Number(deleteDay.dataset.deleteDay));
          await renumberRows(options, "trip_days", remaining, "day_number");
          await renderTripEditor(options, trip.id, onBack);
        } else if (move) {
          await persistChangedForm();
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
          await renderTripEditor(options, trip.id, onBack);
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
    document.querySelector("[data-back-to-trips]")?.addEventListener("click", () => void onBack());
  }
}
