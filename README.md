# Warlord

A browser-first 2D conquest action-RPG. Milestone 1 is the raid loop: hero + warband vs. a defended village, then a camp to spend the loot.

## Play it

- **Live:** https://nmazzawi.github.io/warlord/ (auto-deployed from `main` by GitHub Actions)
- **Locally:** `npm install` once, then `npm run dev` and open the printed URL (http://localhost:5173/). To play on your phone, connect it to the same Wi-Fi and open the **Network** URL that `npm run dev` prints.

## Controls

- **Move:** drag anywhere on screen (a joystick appears under your thumb) or WASD / arrow keys.
- **Attack:** automatic — you swing at the nearest enemy in reach.
- **Q / HORN button:** War Horn — troops rally to you, everyone gets a short speed boost.
- **E / CHARGE button:** Charge — a short dash that knocks enemies back. You can't be hit during it.

## Project layout

- `DESIGN.md` — the game vision and every design decision. Source of truth.
- `CLAUDE.md` — project conventions for Claude Code.
- `src/config/balance.ts` — every tunable number (damage, speeds, prices, raid scaling).
- `src/scenes/` — Boot, Camp, Raid, Hud (overlay), Result.
- `src/entities/` — Hero, Troop, Enemy (militia / archer / captain), Arrow, Coin.
- `src/systems/` — one file per system: input, juice (feel), combat, sound, surround AI, flow-field pathing, formation, textures.
- `src/world/Village.ts` — the map layout and spawn posts.

## Checks

- `npm run build` — type-checks and builds to `dist/`.
- `npm run smoke` — plays through the game in a headless browser (desktop + emulated phone): raid, abilities, victory, camp, defeat, retry, touch joystick, and a positioning experiment (street vs. open field). Needs `npx playwright install chromium` once.
