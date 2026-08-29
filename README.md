# Warlord

A browser-first 2D conquest action-RPG. Milestone 1 was the raid loop; Milestone 2 added the world map, four villages, a bandit camp with Forge / Barracks / Stables, infamy (patrols, fortifying villages, a bounty) and a single-slot save; Milestone 3 adds upkeep (wages, desertion), the siege of Kingsport (gate, wall archers, two waves, a mini-boss with a signature weapon), and SACK / OCCUPY after conquests with conquest-gated shops. Milestone 3.5 adds peaceful VISITS (markup shops, inn rumors, gates that shut once they know your face) and the art identity pass (parchment/iron/ember palette, two bundled fonts, figure units, vignette buildings). Before/after screenshots live in `docs/screens/`.

## Play it

- **Live:** https://nmazzawi.github.io/warlord/ (auto-deployed from `main` by GitHub Actions)
- **Locally:** `npm install` once, then `npm run dev` and open the printed URL (http://localhost:5173/). To play on your phone, connect it to the same Wi-Fi and open the **Network** URL that `npm run dev` prints.

## Controls

- **Move:** drag anywhere on screen (a joystick appears under your thumb) or WASD / arrow keys.
- **In a raid:** attacks are automatic. **Q / HORN** — War Horn: troops rally to you, short speed boost. **E / CHARGE** — a dash that knocks enemies back; you can't be hit during it.
- **In a settlement (camp, occupied village, Kingsport):** tap a building card to open its shop. **TO THE MAP** (or M / Esc) leaves; **WAIT A DAY** at the camp passes a day (wages!).
- **On the map:** tap a place to see it and travel there (drag to pan, mouse-wheel to zoom). While a place has no reason to fear you, VISIT lets you shop at a markup and buy a rumor at the inn.

## Project layout

- `DESIGN.md` — the game vision and every design decision. Source of truth.
- `CLAUDE.md` — project conventions for Claude Code.
- `src/config/balance.ts` — every tunable number (damage, speeds, prices, raid scaling).
- `src/scenes/` — Boot, Title, Map + MapHud (overworld, ledger, panels), Settlement + Shop (tap screens for places you control), Raid + Hud (battles, sieges), Result (conquest choice).
- `src/entities/` — Hero, Troop, Enemy (militia / archer / captain), Arrow, Coin.
- `src/systems/` — one file per system: input, joystick, juice (feel), combat, sound, surround AI, flow-field pathing, line of sight, formation, textures.
- `src/world/` — `WorldMap.ts` (places and roads), `Layouts.ts` (every battle map as data, palisades, the siege), `Battles.ts` (village / patrol / siege setups), `Stock.ts` (what each settlement sells).
- `src/state/GameState.ts` — the run: gold, day, infamy, gear, troops, villages; save/load.

## Checks

- `npm run build` — type-checks and builds to `dist/`.
- `npm run smoke` — plays through the game in a headless browser (desktop + emulated phone): camp shops, wages, map travel, raids with sack/occupy/leave, occupied-village shops, desertion, the siege of Kingsport (gate, waves, halberd), Kingsport's shops, palisade reachability for every village, the ranged rule, save/reload. Needs `npx playwright install chromium` once.
