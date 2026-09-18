# Place tags

The controlled catalog lives in `src/tags.ts`: each tag has an immutable ID and RU/JA/EN labels. Place records store IDs in the existing `places.tags` text array, so no database migration is required.

Initial catalog:

- `kaidan-meguri`: ritual dark passages (戒壇巡り)
- `anime`: a documented anime/manga connection, not just a similar atmosphere
- `work-golden-kamuy`: Golden Kamuy
- `work-haikyu`: Haikyu!!

Several tags can be assigned in the place editor. The public dropdown filters both map markers and cards through the existing matching-place pipeline; `?tag=work-haikyu` preserves the selection when switching languages. Reset clears it. Cards show controlled tags; the detail panel also retains uncatalogued legacy tags with their original labels. Saving in the admin preserves those legacy tags.

To extend the catalog, add a unique ID and all three labels in `src/tags.ts`. Do not rename an existing ID; change labels instead. Public JSON keeps `tags` as IDs and adds localized `tag_names`.

## Initial seed

Run a preview:

```sh
node --env-file=.env --experimental-strip-types scripts/seed-place-tags.mjs
```

Add `--apply` to write. Requires the server-only `SUPABASE_SECRET_KEY`, never a `VITE_` secret. The script only normalizes explicit legacy dark-passage tags and adds the two verified work connections. Other tags are retained. Writes are guarded against concurrent tag edits; rerunning is idempotent.

Sources:

- [Abashiri tourism: Golden Kamuy and the prison museum](https://visit-abashiri.jp/feature/event/87ad1e140096b3294aa4f5d6077f90fa8b1f9390.html)
- [Karumai town newsletter: local buildings and scenery as Haikyu!! models](https://www.town.karumai.iwate.jp/article/docs/kouhou/2016/kg-k%202811-0120.pdf)
