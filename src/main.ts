import "./styles.css";
import { getPlaces, getRoutes } from "./supabase";
import type { Place } from "./types";
import { createPlacesMap } from "./map";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("#app not found");
}

function placeName(place: Place): string {
  return place.place_translations[0]?.name ?? "Без названия";
}

function placeSummary(place: Place): string {
  return place.place_translations[0]?.summary ?? "";
}

function renderLoading(): void {
  app!.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">わざわざ · WAZAWAZA</p>
          <h1>Места, ради которых<br>стоит свернуть с маршрута.</h1>
        </div>
        <p class="lede">Не “топ-10 Токио”, а странное, красивое, далёкое и очень конкретное.</p>
      </header>

      <section class="status-card">
        <span class="spinner" aria-hidden="true"></span>
        Загружаю опубликованные места…
      </section>
    </main>
  `;
}

function renderPlaces(places: Place[], routeCount: number): void {
  const prefectureCount = new Set(places.map((place) => place.prefecture)).size;

  const cards = places
    .map((place) => {
      const t = place.place_translations[0];
      const meta = [
        t?.area,
        place.prefecture,
        place.station_walk_min != null ? `${place.station_walk_min} мин от транспорта` : null,
      ].filter(Boolean);

      return `
          <article
            class="place-card"
            data-place-id="${place.id}"
            data-prefecture="${escapeHtml(place.prefecture)}"
          >
          <div class="place-card__meta">${escapeHtml(meta.join(" · "))}</div>
          <h2>${escapeHtml(placeName(place))}</h2>
          <p>${escapeHtml(placeSummary(place) || t?.interest || "Описание скоро появится.")}</p>
          <div class="chips">
            ${place.category ? `<span>${escapeHtml(place.category)}</span>` : ""}
            ${place.indoor_outdoor ? `<span>${escapeHtml(place.indoor_outdoor)}</span>` : ""}
            ${place.visit_minutes ? `<span>≈ ${place.visit_minutes} мин</span>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  const prefectures = Array.from(
    new Set(places.map((place) => place.prefecture))
  ).sort((a, b) => a.localeCompare(b, "ja"));

  app!.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">わざわざ · WAZAWAZA</p>
          <h1>Места, ради которых<br>стоит свернуть с маршрута.</h1>
        </div>
        <p class="lede">Не “топ-10 Токио”, а странное, красивое, далёкое и очень конкретное.</p>
      </header>

      <section class="stats" aria-label="Статистика">
        <div><strong>${places.length}</strong><span>мест опубликовано</span></div>
        <div><strong>${prefectureCount}</strong><span>префектур</span></div>
        <div><strong>${routeCount}</strong><span>маршрутов</span></div>
      </section>

      ${
        places.length === 0
          ? `
            <section class="empty">
              <p class="eyebrow">DATABASE CONNECTED</p>
              <h2>Связь есть. Публикаций пока нет.</h2>
              <p>Это ожидаемо: после миграции все 726 мест остались в статусе draft.</p>
            </section>
          `
          : `
            <section class="section-heading">
              <div>
                <p class="eyebrow">РАЗВЕДКА</p>
                <h2>Первые места</h2>
              </div>
              <p>Пока это проверка data layer. Карта, фильтры и полноценные карточки — следующий слой.</p>
            </section>
            <section class="filters">
              <label>
                <span>Префектура</span>
                <select id="prefecture-filter">
                  <option value="">Все</option>
                  ${prefectures
                    .map(
                      (prefecture) =>
                        `<option value="${escapeHtml(prefecture)}">${escapeHtml(prefecture)}</option>`
                    )
                    .join("")}
                </select>
              </label>
            </section>
            <section class="map-section">
              <div id="places-map" class="places-map"></div>
            </section>
            <section class="grid">${cards}</section>
          `
      }
    </main>
  `;

  const mapElement =
    document.querySelector<HTMLDivElement>("#places-map");

  const prefectureFilter =
  document.querySelector<HTMLSelectElement>("#prefecture-filter");

  let placesMap: ReturnType<typeof createPlacesMap> | undefined;
  let visiblePlaceIds = new Set(places.map((place) => place.id));

  function filterCards(): void {
    const selectedPrefecture = prefectureFilter?.value ?? "";

    document
      .querySelectorAll<HTMLElement>(".place-card")
      .forEach((card) => {
        const placeId = Number(card.dataset.placeId);
        const matchesPrefecture =
          !selectedPrefecture ||
          card.dataset.prefecture === selectedPrefecture;
        const isInViewport = visiblePlaceIds.has(placeId);

        card.hidden = !matchesPrefecture || !isInViewport;
      });
  }

  prefectureFilter?.addEventListener("change", () => {
    const selected = prefectureFilter.value;

    if (selected) {
      const prefecturePlaces = places.filter(
        (place) => place.prefecture === selected
      );

      visiblePlaceIds = new Set(prefecturePlaces.map((place) => place.id));
      filterCards();
      placesMap?.displayPlaces(prefecturePlaces);
      placesMap?.focusPlaces(prefecturePlaces);
    } else {
      placesMap?.displayPlaces(places);
    }
  });

  console.log("mapElement:", mapElement);
  console.log("places:", places.length);

  if (mapElement && places.length > 0) {
    requestAnimationFrame(() => {
      const initializedMap = createPlacesMap(
        mapElement,
        places,
        (place) => {
          const card = document.querySelector<HTMLElement>(
            `[data-place-id="${place.id}"]`
          );

          card?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });

          card?.classList.add("is-selected");

          window.setTimeout(() => {
            card?.classList.remove("is-selected");
          }, 1600);
        },
        (visiblePlaces) => {
          visiblePlaceIds = new Set(visiblePlaces.map((place) => place.id));
          filterCards();
        }
      );

      placesMap = initializedMap;

      initializedMap.map.invalidateSize();

      document
        .querySelectorAll<HTMLElement>("[data-place-id]")
        .forEach((card) => {
          card.addEventListener("click", () => {
            const placeId = Number(card.dataset.placeId);

            const place = places.find(
              (item) => item.id === placeId
            );

            if (place) {
              initializedMap.focusPlace(place);
            }
          });
        });
    });
  }
}

function renderError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  app!.innerHTML = `
    <main class="shell">
      <header class="hero compact">
        <div>
          <p class="eyebrow">わざわざ · WAZAWAZA</p>
          <h1>Не достучались до базы.</h1>
        </div>
      </header>

      <section class="error-card">
        <strong>Supabase error</strong>
        <pre>${escapeHtml(message)}</pre>
      </section>
    </main>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!
  );
}

async function start(): Promise<void> {
  renderLoading();

  try {
    const [places, routes] = await Promise.all([getPlaces("ru"), getRoutes("ru")]);
    renderPlaces(places, routes.length);
  } catch (error) {
    renderError(error);
  }
}

void start();
