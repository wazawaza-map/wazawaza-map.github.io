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

## Data visibility

The frontend intentionally uses the public API under RLS.

After the legacy import all places/routes are `draft`, so the frontend will return zero records until selected rows are changed to `published`.
