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

The read-only admin interface is available at `/wazadmin/`.

To enable access:

1. Create the admin user in Supabase Authentication.
2. Open `scripts/wazadmin_setup.sql`, replace `YOUR_ADMIN_EMAIL` in the
   commented role-assignment statement, and run the statement plus the RLS
   policies in Supabase SQL Editor.
3. Sign in at `/wazadmin/` with that user's email and password.

The browser uses only the publishable key. Admin access requires the
`app_metadata.role = admin` JWT claim and matching RLS policies.

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

## Data visibility

The frontend intentionally uses the public API under RLS.

After the legacy import all places/routes are `draft`, so the frontend will return zero records until selected rows are changed to `published`.
