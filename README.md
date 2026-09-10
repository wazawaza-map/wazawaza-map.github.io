# WazaWaza

Japan off the obvious path.

## Local development

```bash
cp .env.example .env
```

Put the Supabase **publishable** key into `.env`:

```env
VITE_SUPABASE_URL=https://gsksocekmcvrhmehocty.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Then:

```bash
npm install
npm run dev
```

Never put a Supabase secret/service-role key in this frontend project.

## Admin

The admin interface is available at `/wazadmin/`.

To enable access:

1. Create the admin user in Supabase Authentication.
2. Open `scripts/wazadmin_setup.sql`, replace `YOUR_ADMIN_EMAIL` in the
   commented role-assignment statement, and run the statement plus the RLS
   policies in Supabase SQL Editor.
3. Sign in at `/wazadmin/` with that user's email and password.

The browser uses only the publishable key. Admin access requires the
`app_metadata.role = admin` JWT claim and matching RLS policies.

### Personal trip planner

Run `scripts/trip_planner_setup.sql` once in the Supabase SQL Editor to enable
the private `Поездки` section in `/wazadmin/`. Personal trips are owned by the
signed-in admin and are separate from imported route templates. A trip can be
split into dated days with ordered saved places or custom stops, overnight
cities, lodging links, times, and notes.

## Public read-only API

Each GitHub Pages deployment generates JSON snapshots containing published
places only:

- `/api/places.json` — all places with all available translations;
- `/api/{locale}/places.json` — localized places (`ru`, `ja`, or `en`);
- `/api/{locale}/prefectures/{slug}.json` — one prefecture;
- `/api/{locale}/prefectures/{slug}-adjacent.json` — one prefecture and its
  adjacent prefectures;
- `/api/index.json` — endpoint documentation and all prefecture slugs.

Generate the snapshots locally with configured public Supabase credentials:

```bash
npm run generate:api
```

The generated `public/api/` directory is intentionally git-ignored. GitHub
Actions regenerates it on pushes, manual runs, a daily fallback schedule, and
the `places_changed` repository dispatch event.

To request a deployment after an admin edit, deploy the
`request-api-rebuild` Supabase Edge Function and set its
`GITHUB_DISPATCH_TOKEN` secret. The token must be a fine-grained GitHub token
limited to this repository with `Contents: read and write`; never prefix it
with `VITE_` or expose it to the browser.

```bash
npx supabase login
npx supabase secrets set GITHUB_DISPATCH_TOKEN=... --project-ref gsksocekmcvrhmehocty
npx supabase functions deploy request-api-rebuild --project-ref gsksocekmcvrhmehocty
```

The function accepts authenticated admins only. If it is temporarily
unavailable, saving still succeeds and the daily workflow refreshes the API.

## Categories

Places use a controlled category list with Russian, Japanese and English
labels. Run `scripts/categories_setup.sql` once in the Supabase SQL Editor to
normalize legacy category values and add the database constraint. After that,
categories are edited from the select in `/wazadmin/`; no category translation
rows are required.

## Translation drafts

Generate a small review batch locally (no Supabase writes):

```bash
OPENAI_API_KEY=... python3 scripts/generate_translations.py --locale ja --limit 10
OPENAI_API_KEY=... python3 scripts/generate_translations.py --locale en --limit 10
```

Drafts are saved under the git-ignored `translation-drafts/` directory. After
review, validate and explicitly import a file:

```bash
python3 scripts/import_translation_drafts.py translation-drafts/places-ja.json
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  python3 scripts/import_translation_drafts.py translation-drafts/places-ja.json --apply
```

Existing translations are preserved unless `--overwrite` is supplied.

## Visited prefectures

The public `Places / Prefectures` switch opens an overview of all 47 prefectures.
The overview is also linkable with `?view=prefectures` (and `lang=ru|ja|en`).
A prefecture is highlighted when at least one publicly visible place in that
prefecture has `visited = true` or a nonempty `visited_at`. Undated visits count;
place filters do not affect the overview. No database migration is needed.
Selecting a prefecture opens the places view and resets the other filters.

Simplified boundaries are bundled in `public/prefectures.geojson`; their source
and license are in `public/prefectures-LICENSE.txt`. This overview data is not used
to assign precise coordinates or administrative boundaries to places.

The `I'm feeling lucky` button chooses a random place from the cards currently
visible on the map and opens its details. It respects active filters and avoids
immediately repeating the selected place when another candidate is available.
If filters match places outside the current viewport but none are visible, it
falls back to the full filtered result set.

Regression checks (Node.js 22.18+ for native TypeScript support):

```bash
node --test scripts/test-*.mjs
npm run build
```

## Data visibility

The frontend intentionally uses the public API under RLS.

After the legacy import all places/routes are `draft`, so the frontend will return zero records until selected rows are changed to `published`.
