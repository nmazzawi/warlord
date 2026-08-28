# From Zero to Warlord — The Build Playbook (Final)

The one document. Setup, then five copy-paste prompts, then the road beyond. Your project folder already exists (warlord-starter.zip from our chat) — it contains DESIGN.md (the full game vision), CLAUDE.md (project conventions), and a copy of this playbook.

**The game in one breath:** Rise from lone bandit to world conqueror across twelve ancient cultures. Raid villages, build a warband, take towns and cities, unite the globe — while the world fights back Plague-Inc-style with escalating patrols, bounty hunters, and a final grand coalition. Free web version → paid Steam version → mobile app. One-thumb controls from day one.

---

## Part 1 — One-Time Setup (~15 minutes)

**Step 1: Install Claude Code.**
You need a paid Claude plan (Pro, Max, Team, or Enterprise). On the Mac, open Terminal (Cmd+Space, type "Terminal"), run the one-line macOS install command from **code.claude.com/docs/en/quickstart**, then type `claude` — the first run opens your browser to sign in.

**Step 2: A free GitHub account.**
Create one at **github.com**. It's the game's permanent backup and powers the shareable web link.

**Step 3: Get the project folder onto the Mac.**
Open this chat on the Mac and download **warlord-starter.zip**. Double-click to unzip — that's your project folder. Move the `warlord` folder wherever you like (Desktop is fine).

**Step 4: Start.**
In Terminal, type `cd ` (with a space), drag the `warlord` folder into the Terminal window, press Enter. Then type `claude` and paste Prompt 1 below.

**Two things to know:**
- Claude Code asks permission before running commands, and will walk you through connecting GitHub when it's time to publish. Approving is normal — that's it working.
- If anything errors, paste the exact error text back to Claude Code. That's the entire debugging skill.

---

## Part 2 — Prompt 1: The Kickoff (Milestone 1 — The Raid Loop)

```
This folder already contains DESIGN.md (the full game vision) and CLAUDE.md
(project conventions). Read both carefully first — they govern everything.

Then scaffold the project (Phaser 3 + TypeScript + Vite), initialize git, and
build MILESTONE 1 — the raid loop, playable end to end:

- Top-down hero: movement only (virtual joystick on touch, WASD on keyboard).
  Auto-attacks the nearest enemy in range on a cooldown. HP bar.
- Two big tappable ability buttons (Q/E on keyboard), cooldowns shown:
  WAR HORN — my troops rally to me plus a brief speed boost. CHARGE — a short
  dash with knockback.
- 3 troops that follow me in loose formation and auto-attack nearby enemies.
  War Horn should visibly regroup them.
- Raid map: a small village (huts as obstacles) defended by ~8 militia plus 2
  archers who keep distance and shoot, plus 1 slower, harder-hitting spearman
  captain. Enemies drop gold pickups.
- Troop deaths are permanent: fallen troops don't return after the raid — I
  replace them at camp. Show a small HP bar on each troop.
- Placeholder sound: simple generated blips for hits, gold pickup, War Horn,
  and victory. Feel needs ears, even at rectangle stage.
- Clear all defenders → victory summary showing gold earned. Hero death →
  defeat screen with retry.
- Camp screen between raids: spend gold on weapon upgrades (3 tiers, more
  damage and a visibly bigger strike) and recruiting troops (max 6). Then
  Raid 2 loads the village with more and stronger defenders.
- Even with rectangles, combat must feel punchy: hit-pause, knockback, damage
  numbers, hit flash, a tiny screen shake on my hits.
- Positioning must matter: enemies deal real damage, militia try to surround
  me, and fighting in the open should feel worse than funneling them between
  huts.
- Set up the GitHub Pages auto-deploy described in CLAUDE.md; if this folder
  isn't connected to GitHub yet, walk me through connecting it.

Ask me clarifying questions first if anything is ambiguous. When it works,
tell me how to run it locally and send me the live link.
```

**Playtest on the Mac (instant) and your phone (live link), then answer these in your next message:**
- Do hits feel meaty or floaty?
- Does the joystick feel responsive, and are the ability buttons easy to hit mid-fight?
- Do my troops feel like a warband or like confused rectangles?
- Does positioning actually matter, or can I stand still and win?
- Is Raid 2 a satisfying "I'm stronger now" or just more of the same?

**Sharing starts today:** the link works for anyone, on anything. Send it to two friends after every milestone.

---

## Part 3 — Prompt 2: A Storefront Page (When Strangers Should Find It)

The Pages link is for friends. When a milestone feels good enough for strangers, put it on itch.io — the indie storefront where browser games get discovered:

```
The game is ready for a public storefront. Package the current web build as a
zip I can download, then give me exact step-by-step instructions to publish it
on itch.io for free — from creating an account through upload settings ("HTML"
project type, played in browser, mobile-friendly flags) — so it has a real page
people can find.
```

---

## Part 4 — Prompt 3: Milestone 2 (The Overworld + Infamy Begins)

```
Milestone 1 works. Build MILESTONE 2 — the overworld and the beginning of
infamy. Read DESIGN.md first.

- A top-down world map scene: my warband is a token I move along roads by
  tapping a destination. Travel consumes in-game days; show the date.
- Four villages and one town on the map. Entering a village launches the raid
  scene — give each village a different layout and defender mix, scaling up.
- The town is visible but locked: approaching it warns the garrison is far too
  strong for now.
- INFAMY: a visible meter with tiers (Nobody → Bandit → Raider). Every raid
  adds infamy. Higher tiers cause: (1) road patrols that can intercept my token
  and force an open-field battle, (2) villages I haven't raided yet gain extra
  defenders and palisade walls over time, (3) a bounty number on my head shown
  on the map.
- The camp screen is reachable from the map between travels.
- Save/load using browser storage, single slot is fine.
- Deploy, send the link, and tell me how to trigger each new system so I can
  test them all.
```

---

## Part 5 — Prompt 4: Milestone 3 (Armies Eat + The First Town Falls)

```
MILESTONE 3 — upkeep and the first siege. Read DESIGN.md first.

- UPKEEP: troops cost daily wages while traveling. Show a simple ledger (gold,
  daily costs, income). If I can't pay, show a morale warning for a day, then
  troops start deserting. Raiding should now feel necessary, not optional.
- Unlock THE TOWN as a bigger siege battle: walls with a gate that has HP — my
  warband batters it down while archers shoot from the walls — then two waves
  inside: town guards (a tier above militia) and a garrison captain mini-boss
  who drops a signature weapon I can equip at camp.
- After victory, a choice screen: SACK (large one-time gold, the town is ruined
  and produces nothing, big infamy spike) or OCCUPY (smaller immediate loot,
  but daily tribute income on the ledger — and 2 of my troops stay pinned there
  as a garrison).
- Balance pass: with upkeep on, a full loop of raid → travel → siege should
  leave me slightly ahead if I play well and broke if I idle.
- Deploy and send the link.
```

---

## Part 6 — Prompt 5: Milestone 4 (The Second Culture — Proof of the Puzzle)

```
MILESTONE 4 — the second culture. Read DESIGN.md first. The goal: prove that
each region is a puzzle my current army doesn't solve.

- Add a border crossing on the world map into MONGOL territory: open steppe
  battle maps with few obstacles, and instead of fixed villages, 2–3 roaming
  warband camps that move between map points day by day.
- New enemy: horse archers that kite — they keep distance, shoot, and retreat
  as I approach. Catching them in the open with my melee army should feel
  nearly hopeless.
- Counterplay: (1) terrain — steppe maps include a rocky choke point or two
  where kiting fails, (2) a neutral Mongol camp where I can pay to recruit
  local horse troops (fast, ranged, expensive) — my first mixed army, per
  DESIGN.md, (3) my hero can buy a horse: much faster movement, auto-attack
  becomes a ride-by strike.
- Reputation goes per-territory: raiding Mongol camps raises a separate Mongol
  infamy meter (refactor the infamy system to support multiple territories).
- Flag anything you suspect will feel bad, so I know what to watch for when I
  playtest. Deploy and send the link.
```

If crossing that border makes you rethink your army, re-gear, and hire locals — the game's big idea works, and everything after this is expansion.

---

## Part 7 — The Road Beyond (We Design These Together)

Milestones 5+ get written after the first four are playtested, shaped by what turned out to be fun. Bring playtest notes to the design chat. The sequence:

- **M5 — Governance:** the fear vs. prosperity dial, rebellions when you overextend, vassals as the middle path.
- **M6 — The world fights back:** upper infamy tiers, bounty hunters as mini-bosses, defensive pacts, the visible coalition meter, and counterplay (envoys, bribes, forged letters, releasing land).
- **M7 — Culture choice + troops in depth:** pick your culture at run start (rule-set, hero kit, home territory, starting roster), the five-stat troop framework with signature abilities, veterancy and named troops, captain duels.
- **M8 — Legacy and endgame:** lieutenants, the dynasty heir on death, the final coalition war at ~75% unification.
- **Then:** juice-and-art pass, itch page feeding a Steam page collecting wishlists, the Steam build as a thin desktop wrapper of this same code, the mobile app as a wrapped build (free + single unlock).
- **Post-launch:** the remaining nine cultures as free updates — headlined by **The Longship Update** (Vikings + naval travel), which later opens the sea route to the **Aztecs**. Every culture patch is a Steam visibility bump and a sales spike.

---

## Part 8 — How to Work (The Rhythm)

1. **One milestone per session.** Paste the prompt, let it build, play.
2. **Batch your feedback.** Send notes in lists, not one at a time: "1. hits feel floaty, 2. joystick drifts, 3. captain is boring…"
3. **Your feedback is feel, not tech.** Claude Code handles the how; you're the one who can tell whether rectangles fighting rectangles is fun.
4. **Errors are just messages.** Paste the exact error text into Claude Code and say what you were doing.
5. **Git is your time machine.** Every feature is committed; "roll back to before the last change" is always available. Experiments are free.
6. **DESIGN.md is the source of truth.** When we decide something in the design chat, tell Claude Code to add it.
7. **The link is universal.** Any borrowed computer tests keyboard controls through the same URL, nothing installed.
8. **No art until the rectangles are fun.** If the loop doesn't grip with colored shapes, art won't save it — and if it does, art will make it sing.
