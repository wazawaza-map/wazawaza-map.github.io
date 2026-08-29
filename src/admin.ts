import "./admin.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leaflet-icons";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const SESSION_KEY = "wazadmin.session";

type AdminSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: {
    email?: string;
    app_metadata?: Record<string, unknown>;
  };
};

type AdminPlace = {
  id: number;
  legacy_id: string | null;
  slug: string | null;
  prefecture: string;
  municipality: string | null;
  latitude: number;
  longitude: number;
  status: string;
  updated_at?: string;
  google_maps_url: string | null;
  website_url: string | null;
  category: string | null;
  visited_at: string | null;
  place_translations: Array<{
    locale: string;
    name: string;
    area: string | null;
    summary: string | null;
    interest: string | null;
    nearest_station: string | null;
    access_note: string | null;
  }>;
};

const app = document.querySelector<HTMLDivElement>("#admin-app");
if (!app) throw new Error("#admin-app not found");

function requireConfig(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase is not configured in .env.");
  }
  return { url: SUPABASE_URL.replace(/\/$/, ""), key: SUPABASE_KEY };
}

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { url, key } = requireConfig();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { msg?: string; message?: string } | null;
    throw new Error(body?.msg ?? body?.message ?? `Auth error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function signIn(email: string, password: string): Promise<AdminSession> {
  return authRequest<AdminSession>("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

async function refreshSession(session: AdminSession): Promise<AdminSession> {
  return authRequest<AdminSession>("token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
}

function saveSession(session: AdminSession | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function readSession(): AdminSession | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) as AdminSession : null;
  } catch {
    saveSession(null);
    return null;
  }
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const encoded = token.split(".")[1];
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isAdmin(session: AdminSession): boolean {
  if (session.user.app_metadata?.role === "admin") return true;

  const payload = jwtPayload(session.access_token);
  const metadata = payload.app_metadata as Record<string, unknown> | undefined;
  return metadata?.role === "admin";
}

function isExpiring(session: AdminSession): boolean {
  const payload = jwtPayload(session.access_token);
  const expiresAt = typeof payload.exp === "number" ? payload.exp : session.expires_at;
  return !expiresAt || expiresAt < Date.now() / 1000 + 60;
}

async function getPlaces(session: AdminSession): Promise<AdminPlace[]> {
  const { url, key } = requireConfig();
  const select = [
    "id", "legacy_id", "slug", "prefecture", "municipality", "latitude",
    "longitude", "status", "updated_at", "google_maps_url",
    "website_url", "category", "visited_at",
    "place_translations(locale,name,area,summary,interest,nearest_station,access_note)",
  ].join(",");
  const params = new URLSearchParams({ select, order: "updated_at.desc,id.desc" });
  const response = await fetch(`${url}/rest/v1/places?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, Range: "0-4999" },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  return response.json() as Promise<AdminPlace[]>;
}

async function updateRows(
  session: AdminSession,
  path: string,
  values: Record<string, unknown>
): Promise<void> {
  const { url, key } = requireConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
}

async function upsertTranslation(
  session: AdminSession,
  values: Record<string, unknown>
): Promise<void> {
  const { url, key } = requireConfig();
  const response = await fetch(`${url}/rest/v1/place_translations?on_conflict=place_id,locale`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(values),
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
}

function renderLogin(message = ""): void {
  app!.innerHTML = `
    <main class="admin-login">
      <form id="login-form" class="admin-login__card">
        <p class="admin-kicker">WAZAWAZA</p>
        <h1>Вход в редактор</h1>
        <p>Доступ только для пользователей с ролью admin.</p>
        <label>Email<input name="email" type="email" autocomplete="username" required></label>
        <label>Пароль<input name="password" type="password" autocomplete="current-password" required></label>
        <p id="login-error" class="admin-error">${escapeHtml(message)}</p>
        <button type="submit">Войти</button>
        <a href="/">← Вернуться к карте</a>
      </form>
    </main>`;

  const form = document.querySelector<HTMLFormElement>("#login-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>("button");
    const error = form.querySelector<HTMLElement>("#login-error");
    const data = new FormData(form);
    if (button) button.disabled = true;
    if (error) error.textContent = "";
    try {
      const session = await signIn(String(data.get("email")), String(data.get("password")));
      if (!isAdmin(session)) {
        saveSession(null);
        throw new Error("У этой учётной записи нет роли admin.");
      }
      saveSession(session);
      await renderDashboard(session);
    } catch (loginError) {
      if (error) error.textContent = loginError instanceof Error ? loginError.message : String(loginError);
      if (button) button.disabled = false;
    }
  });
}

async function renderDashboard(
  session: AdminSession,
  initialQuery = ""
): Promise<void> {
  app!.innerHTML = `<main class="admin-loading">Загружаю места…</main>`;
  try {
    const places = await getPlaces(session);
    const counts = places.reduce<Record<string, number>>((result, place) => {
      result[place.status] = (result[place.status] ?? 0) + 1;
      return result;
    }, {});
    app!.innerHTML = `
      <main class="admin-shell">
        <header class="admin-header">
          <div><p class="admin-kicker">WAZAWAZA</p><h1>Места</h1></div>
          <div class="admin-account"><span>${escapeHtml(session.user.email ?? "admin")}</span><button id="logout" type="button">Выйти</button></div>
        </header>
        <section class="admin-stats">
          <div><strong>${places.length}</strong><span>всего</span></div>
          <div><strong>${counts.published ?? 0}</strong><span>опубликовано</span></div>
          <div><strong>${counts.draft ?? 0}</strong><span>черновиков</span></div>
        </section>
        <section class="admin-toolbar">
          <label for="admin-search">Поиск</label>
          <input id="admin-search" type="search" placeholder="Название, ID, префектура или город">
          <span id="admin-result-count">${places.length} записей</span>
        </section>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Место</th><th>Расположение</th><th>Координаты</th><th>Статус</th><th></th></tr></thead>
            <tbody id="places-body"></tbody>
          </table>
        </div>
      </main>`;

    const body = document.querySelector<HTMLTableSectionElement>("#places-body");
    const search = document.querySelector<HTMLInputElement>("#admin-search");
    const resultCount = document.querySelector<HTMLElement>("#admin-result-count");

    function renderRows(query = ""): void {
      const normalized = query.normalize("NFKC").toLocaleLowerCase("ru").trim();
      const filtered = places.filter((place) => {
        const translation = place.place_translations.find((item) => item.locale === "ru") ?? place.place_translations[0];
        return !normalized || [place.id, place.legacy_id, translation?.name, translation?.area, place.prefecture, place.municipality, place.status]
          .filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ru").includes(normalized);
      });
      if (resultCount) resultCount.textContent = `${filtered.length} записей`;
      if (body) body.innerHTML = filtered.map(placeRow).join("");
    }

    if (search) search.value = initialQuery;
    renderRows(initialQuery);
    search?.addEventListener("input", () => renderRows(search.value));
    body?.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-edit-place]");
      if (!button) return;
      const place = places.find((item) => item.id === Number(button.dataset.editPlace));
      if (place) openPlaceEditor(session, place);
    });
    document.querySelector("#logout")?.addEventListener("click", async () => {
      saveSession(null);
      renderLogin();
    });
  } catch (error) {
    saveSession(null);
    renderLogin(error instanceof Error ? error.message : String(error));
  }
}

function placeRow(place: AdminPlace): string {
  const translation = place.place_translations.find((item) => item.locale === "ru") ?? place.place_translations[0];
  return `<tr>
    <td><strong>${escapeHtml(translation?.name ?? "Без названия")}</strong><small>#${place.id} · ${escapeHtml(place.legacy_id ?? "без legacy ID")}</small></td>
    <td>${escapeHtml([translation?.area, place.municipality, place.prefecture].filter(Boolean).join(" · "))}</td>
    <td><code>${place.latitude}, ${place.longitude}</code></td>
    <td><span class="admin-status admin-status--${escapeHtml(place.status)}">${escapeHtml(place.status)}</span></td>
    <td class="admin-table__actions">
      ${place.google_maps_url ? `<a href="${escapeHtml(place.google_maps_url)}" target="_blank" rel="noreferrer" aria-label="Открыть в Google Maps">↗</a>` : ""}
      <button type="button" data-edit-place="${place.id}">Изменить</button>
    </td>
  </tr>`;
}

function openPlaceEditor(session: AdminSession, place: AdminPlace): void {
  const overlay = document.createElement("div");
  overlay.className = "admin-editor-overlay";
  overlay.innerHTML = `
    <aside class="admin-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <header class="admin-editor__header">
        <div><p class="admin-kicker">PLACE #${place.id}</p><h2 id="editor-title">Редактирование</h2></div>
        <button class="admin-editor__close" type="button" aria-label="Закрыть">×</button>
      </header>
      <form id="place-editor-form">
        <div class="admin-form-grid">
          ${field("Префектура", "prefecture", place.prefecture, true)}
          ${field("Муниципалитет", "municipality", place.municipality ?? "")}
          ${field("Категория", "category", place.category ?? "")}
        </div>
        <section class="admin-translations">
          <div class="admin-translation-tabs" role="tablist">
            ${(["ru", "ja", "en"] as const).map((locale, index) => `<button type="button" role="tab" data-translation-tab="${locale}" aria-selected="${index === 0}">${locale.toUpperCase()}${place.place_translations.some((item) => item.locale === locale) ? " ✓" : ""}</button>`).join("")}
          </div>
          ${(["ru", "ja", "en"] as const).map((locale, index) => translationPanel(place, locale, index > 0)).join("")}
        </section>
        <div class="admin-form-grid">
          ${field("Google Maps", "google_maps_url", place.google_maps_url ?? "", false, "url")}
          ${field("Официальный сайт", "website_url", place.website_url ?? "", false, "url")}
          ${field("Широта", "latitude", String(place.latitude), true, "number", "any")}
          ${field("Долгота", "longitude", String(place.longitude), true, "number", "any")}
        </div>
        <div class="admin-visited-control">
          <label><input name="visited" type="checkbox"${place.visited_at ? " checked" : ""}> Я была здесь</label>
          ${field("Дата посещения", "visited_at", place.visited_at ?? new Date().toISOString().slice(0, 10), false, "date")}
        </div>
        <div id="admin-editor-map" class="admin-editor-map"></div>
        <p class="admin-editor__hint">Перетащите маркер или введите координаты вручную. Статус: <strong>${escapeHtml(place.status)}</strong>.</p>
        <p id="editor-error" class="admin-error"></p>
        <div class="admin-editor__footer">
          <button class="secondary" type="button" data-editor-cancel>Отмена</button>
          <button type="submit">Сохранить</button>
        </div>
      </form>
    </aside>`;
  document.body.append(overlay);

  const form = overlay.querySelector<HTMLFormElement>("#place-editor-form");
  const closeButton = overlay.querySelector<HTMLButtonElement>(".admin-editor__close");
  const latitudeInput = form?.elements.namedItem("latitude") as HTMLInputElement | null;
  const longitudeInput = form?.elements.namedItem("longitude") as HTMLInputElement | null;
  const mapElement = overlay.querySelector<HTMLElement>("#admin-editor-map");
  let editorMap: L.Map | undefined;

  overlay.querySelector(".admin-translation-tabs")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-translation-tab]");
    if (!button) return;
    const locale = button.dataset.translationTab;
    overlay.querySelectorAll<HTMLButtonElement>("[data-translation-tab]").forEach((item) => item.setAttribute("aria-selected", String(item === button)));
    overlay.querySelectorAll<HTMLElement>("[data-translation-panel]").forEach((panel) => { panel.hidden = panel.dataset.translationPanel !== locale; });
  });

  if (mapElement) {
    editorMap = L.map(mapElement).setView([place.latitude, place.longitude], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(editorMap);
    const marker = L.marker([place.latitude, place.longitude], { draggable: true }).addTo(editorMap);
    marker.on("dragend", () => {
      const point = marker.getLatLng();
      if (latitudeInput) latitudeInput.value = point.lat.toFixed(7);
      if (longitudeInput) longitudeInput.value = point.lng.toFixed(7);
    });
    function syncMarker(): void {
      const latitude = Number(latitudeInput?.value);
      const longitude = Number(longitudeInput?.value);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      marker.setLatLng([latitude, longitude]);
      editorMap?.panTo([latitude, longitude]);
    }
    latitudeInput?.addEventListener("change", syncMarker);
    longitudeInput?.addEventListener("change", syncMarker);
    requestAnimationFrame(() => editorMap?.invalidateSize());
  }

  function close(): void {
    editorMap?.remove();
    overlay.remove();
    document.removeEventListener("keydown", onKeydown);
  }
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") close();
  }
  closeButton?.addEventListener("click", close);
  overlay.querySelector("[data-editor-cancel]")?.addEventListener("click", close);
  document.addEventListener("keydown", onKeydown);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const error = form.querySelector<HTMLElement>("#editor-error");
    if (submit) submit.disabled = true;
    if (error) error.textContent = "";
    try {
      const activeQuery = document.querySelector<HTMLInputElement>("#admin-search")?.value ?? "";
      const latitude = Number(data.get("latitude"));
      const longitude = Number(data.get("longitude"));
      const visited = data.get("visited") === "on";
      if (!Number.isFinite(latitude) || latitude < 20 || latitude > 50 || !Number.isFinite(longitude) || longitude < 120 || longitude > 155) {
        throw new Error("Координаты должны находиться в пределах Японии.");
      }
      await updateRows(session, `places?id=eq.${place.id}`, {
        prefecture: required(data, "prefecture"),
        municipality: optional(data, "municipality"),
        category: optional(data, "category"),
        google_maps_url: optionalUrl(data, "google_maps_url"),
        website_url: optionalUrl(data, "website_url"),
        latitude,
        longitude,
        visited_at: visited ? required(data, "visited_at") : null,
      });
      for (const locale of ["ru", "ja", "en"] as const) {
        const name = optional(data, `${locale}_name`);
        if (!name) continue;
        await upsertTranslation(session, {
          place_id: place.id,
          locale,
          name,
          area: optional(data, `${locale}_area`),
          summary: optional(data, `${locale}_summary`),
          interest: optional(data, `${locale}_interest`),
          nearest_station: optional(data, `${locale}_nearest_station`),
          access_note: optional(data, `${locale}_access_note`),
        });
      }
      close();
      await renderDashboard(session, activeQuery);
    } catch (saveError) {
      if (error) error.textContent = saveError instanceof Error ? saveError.message : String(saveError);
      if (submit) submit.disabled = false;
    }
  });
}

function field(label: string, name: string, value: string, required = false, type = "text", step?: string): string {
  return `<label>${escapeHtml(label)}<input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"${required ? " required" : ""}${step ? ` step="${escapeHtml(step)}"` : ""}></label>`;
}

function textarea(label: string, name: string, value: string): string {
  return `<label class="admin-form-wide">${escapeHtml(label)}<textarea name="${escapeHtml(name)}" rows="3">${escapeHtml(value)}</textarea></label>`;
}

function translationPanel(place: AdminPlace, locale: "ru" | "ja" | "en", hidden: boolean): string {
  const translation = place.place_translations.find((item) => item.locale === locale);
  return `<div class="admin-translation-panel" data-translation-panel="${locale}"${hidden ? " hidden" : ""}>
    <div class="admin-form-grid">
      ${field("Название", `${locale}_name`, translation?.name ?? "")}
      ${field("Район", `${locale}_area`, translation?.area ?? "")}
      ${field("Ближайшая станция", `${locale}_nearest_station`, translation?.nearest_station ?? "")}
    </div>
    ${textarea("Краткое описание", `${locale}_summary`, translation?.summary ?? "")}
    ${textarea("Почему интересно", `${locale}_interest`, translation?.interest ?? "")}
    ${textarea("Как добраться", `${locale}_access_note`, translation?.access_note ?? "")}
  </div>`;
}

function required(data: FormData, name: string): string {
  const value = String(data.get(name) ?? "").trim();
  if (!value) throw new Error(`Заполните поле «${name}».`);
  return value;
}

function optional(data: FormData, name: string): string | null {
  return String(data.get(name) ?? "").trim() || null;
}

function optionalUrl(data: FormData, name: string): string | null {
  const value = optional(data, name);
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Ссылка должна начинаться с http:// или https://.");
  return url.href;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

async function start(): Promise<void> {
  let session = readSession();
  if (!session) return renderLogin();
  try {
    if (isExpiring(session)) {
      session = await refreshSession(session);
      saveSession(session);
    }
    if (!isAdmin(session)) throw new Error("У этой учётной записи нет роли admin.");
    await renderDashboard(session);
  } catch (error) {
    saveSession(null);
    renderLogin(error instanceof Error ? error.message : String(error));
  }
}

void start();
