# The geography packs

Hand-authored source for the world chart: real coastlines and real empires, written as longitude and
latitude with every point named after the cape, port or city it actually is (that naming is what keeps
the outline recognizable). Nothing here is drawn in pixels — `tools/build-atlas.mjs` projects it into
`src/world/AtlasData.ts`, so the whole world can be re-projected or resized by changing `src/world/geo.ts`.

- `coast-*.json` — `{ segments: [{ id, closed, points: [{ lon, lat, at }] }] }`. The Old World is one
  ring assembled in order from `med_north` → `asia_south` → the map's east edge → `asia_arctic` →
  `europe_atlantic`; everything else is its own closed ring. `black_sea`, `caspian_sea`, `aral_sea` and
  `lake_baikal` are painted back over the land as water.
- `empire-*.json` — `{ empires: [{ id, name, note, throne, poly, places }] }`, two realms per file.
  `places` are the settlements shown on the chart: one `capital`, a few `city`, then `town`/`village`.

Rebuild after editing:

    node tools/build-atlas.mjs data/atlas
