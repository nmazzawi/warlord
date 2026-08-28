# Warlord

A browser-first 2D conquest action-RPG. Milestone 1 was the raid loop; Milestone 2 adds the world map (travel by road, days pass), four villages and a locked town, a walkable bandit camp with Forge / Barracks / Stables, infamy (patrols, fortifying villages, a bounty) and a single-slot save.

## Play it

- **Live:** https://nmazzawi.github.io/warlord/ (auto-deployed from `main` by GitHub Actions)
- **Locally:** `npm install` once, then `npm run dev` and open the printed URL (http://localhost:5173/). To play on your phone, connect it to the same Wi-Fi and open the **Network** URL that `npm run dev` prints.

## Controls

- **Move:** drag anywhere on screen (a joystick appears under your thumb) or WASD / arrow keys.
- **In a raid:** attacks are automatic. **Q / HORN** — War Horn: troops rally to you, short speed boost. **E / CHARGE** — a dash that knocks enemies back; you can't be hit during it.
- **In the camp:** walk up to a building's doorstep and press **E / ENTER button**. **M / MAP button** leaves for the map. **Esc** closes a shop.
- **On the map:** tap a place to travel there (drag to pan, mouse-wheel to zoom). Tap the place you're standing on to open its panel.

## Project layout

- `DESIGN.md` — the game vision and every design decision. Source of truth.
- `CLAUDE.md` — project conventions for Claude Code.
- `src/config/balance.ts` — every tunable number (damage, speeds, prices, raid scaling).
- `src/scenes/` — Boot, Title, Map + MapHud (overworld), Camp + Shop (the walkable base), Raid + Hud (battles), Result.
- `src/entities/` — Hero, Troop, Enemy (militia / archer / captain), Arrow, Coin.
- `src/systems/` — one file per system: input, joystick, juice (feel), combat, sound, surround AI, flow-field pathing, line of sight, formation, textures.
- `src/world/` — `WorldMap.ts` (places and roads), `Layouts.ts` (every battle map as data, palisades), `Battles.ts` (village / patrol setups).
- `src/state/GameState.ts` — the run: gold, day, infamy, gear, troops, villages; save/load.

## Checks

- `npm run build` — type-checks and builds to `dist/`.
- `npm run smoke` — plays through the game in a headless browser (desktop + emulated phone): new warband, camp walking and shops, map travel, a raid, save/reload, a forced road patrol, a palisaded village, buying gear and a horse, the bow, the locked town. Needs `npx playwright install chromium` once.
