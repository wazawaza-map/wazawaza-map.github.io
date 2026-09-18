import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

// Execute the real entry point with controlled requests and rendering, so a
// pending route request can be tested without a browser or a live database.
const key = Symbol.for("wazawaza.startup-test");
const modules = {
  "./supabase": "export const getPlaces = (...args) => state.getPlaces(...args); export const getRoutes = (...args) => state.getRoutes(...args);",
  "./places-controller": "export const renderPlaces = (...args) => state.renderPlaces(...args);",
  "./places-view": "export const renderLoading = (...args) => state.renderLoading(...args); export const renderError = (...args) => state.renderError(...args);",
};
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  envDir: false,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: "custom",
  plugins: [{
    name: "startup-test-boundaries",
    enforce: "pre",
    resolveId(source, importer) {
      if (importer?.includes("/src/main.ts") && modules[source]) return `\0startup:${source}`;
    },
    load(id) {
      if (id.startsWith("\0startup:")) {
        return `const state = globalThis[Symbol.for("wazawaza.startup-test")]; ${modules[id.slice("\0startup:".length)]}`;
      }
    },
  }],
});
after(() => server.close());

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(setImmediate);
let scenario = 0;
async function start(t) {
  const places = deferred();
  const routes = deferred();
  const events = [];
  const count = { textContent: "—" };
  const app = { querySelector: selector => selector === "#route-count" ? count : null };
  const oldDocument = globalThis.document;
  const oldLocation = globalThis.location;
  globalThis.document = { querySelector: () => app, documentElement: {} };
  globalThis.location = { search: "?lang=ja" };
  globalThis[key] = {
    getPlaces(locale) { events.push(["places", locale]); return places.promise; },
    getRoutes(locale) { events.push(["routes", locale]); return routes.promise; },
    renderLoading() { events.push(["loading"]); },
    renderPlaces(...args) { events.push(["render", ...args]); },
    renderError(...args) { events.push(["error", ...args]); },
  };
  t.after(() => {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
    delete globalThis[key];
  });
  // Each scenario gets a fresh execution of the entry point and its mocks.
  server.moduleGraph.invalidateAll();
  await server.ssrLoadModule(`/src/main.ts?scenario=${++scenario}`);
  return { places, routes, events, count, app };
}

test("places render while routes are pending; success updates only the counter", async (t) => {
  const { places, routes, events, count, app } = await start(t);
  assert.deepEqual(events, [["loading"], ["places", "ja"]]);
  const records = [{ id: 1 }];
  places.resolve(records);
  await flush();
  assert.deepEqual(events.slice(2), [["render", app, records, null, "ja"], ["routes", "ru"]]);
  assert.equal(count.textContent, "—");
  routes.resolve([{ id: 10 }, { id: 11 }]);
  await flush();
  assert.equal(count.textContent, "2");
  assert.equal(events.filter(([kind]) => kind === "render").length, 1);
  assert.equal(events.filter(([kind]) => kind === "error").length, 0);
});

test("route failure keeps the rendered map and unknown-count placeholder", async (t) => {
  const { places, routes, events, count } = await start(t);
  places.resolve([{ id: 1 }]);
  await flush();
  routes.reject(new Error("Routes unavailable"));
  await flush();
  assert.equal(count.textContent, "—");
  assert.equal(events.filter(([kind]) => kind === "render").length, 1);
  assert.equal(events.filter(([kind]) => kind === "error").length, 0);
});

test("a successful empty route response displays zero", async (t) => {
  const { places, routes, count } = await start(t);
  places.resolve([]);
  await flush();
  routes.resolve([]);
  await flush();
  assert.equal(count.textContent, "0");
});

test("place loading failure still shows an error and does not request routes", async (t) => {
  const { places, events } = await start(t);
  const error = new Error("Places unavailable");
  places.reject(error);
  await flush();
  assert.equal(events.filter(([kind]) => kind === "render" || kind === "routes").length, 0);
  assert.equal(events.filter(([kind]) => kind === "error").length, 1);
  assert.equal(events.at(-1)[2], error);
});
