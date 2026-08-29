# WARLORD — Design Document

Working title: **Warlord**. A browser-first 2D conquest action-RPG — a modern descendant of Feudalism 2. This file is the source of truth; when the designer states a new decision, add it here.

## Fantasy & Win Condition
Rise from lone bandit to world conqueror across ancient cultures. Win by uniting the globe, surviving the final grand-coalition war that triggers at ~75% unification.

## Core Loop
Raid villages → earn gold → upgrade weapons, recruit troops → conquer towns and cities → govern or burn → expand across territories → unite the globe.

## Combat Model
Top-down. The player steers the warlord — movement only (virtual joystick on touch, WASD on keyboard) — while attacks fire automatically at the nearest enemy in range. Skill lives in positioning, formations, and ability timing. Two big tappable abilities to start: WAR HORN (troops rally to the hero + brief speed boost) and CHARGE (short dash + knockback). Captain duels are a separate timing minigame (later milestone). Punchy feel is mandatory even with placeholder shapes: hit-pause, knockback, damage numbers, hit flash, small screen shake.

## The World Fights Back (Plague Inc model)
Two racing clocks: player unification % vs. coalition formation.
- Infamy ladder: Nobody → Bandit → Raider → Warlord → Conqueror → World Threat.
- Escalations by tier: road patrols → bounties and bounty hunters (mini-bosses) → villages fortify over time → defensive pacts and embargoes → assassins → the grand coalition war at ~75% unification.
- Reputation is per-territory: a villain in one land can be a hired hero in another.
- Counterplay: assassinate envoys before pacts are signed, bribe coalition members into neutrality, forge letters between rivals, release conquered land to shed heat.

## Economy & Upkeep
Troops cost daily wages and food. Unpaid → morale warning → desertion. Income: raid loot, tribute, quests, mercenary contracts. Raiding must feel necessary, not optional.

## Governance
After taking a settlement: SACK (large one-time gold, settlement ruined, infamy spike) or OCCUPY (tribute income, garrison troops pinned there). Occupied land is ruled by FEAR (fast, cheap, brittle) or PROSPERITY (slow, costly, loyal). VASSALS are the middle path — they count toward unification and cost nothing to run, but the coalition can flip disloyal ones. Overexpansion triggers rebellions.

## Troops
Every unit shares five stats — **Attack, Defense, Speed, Evasion** (agile units cause visible dodges/misses), **Range** — plus **one visible signature ability**. 3–4 units per culture, distinct in *behavior*, not just numbers. Example (Japan): Ashigaru — cheap spear line, holds ground; Samurai — elite, high Attack and Defense, can accept duels; Ninja — fast, high Evasion, backstab bonus, unlocks a night-raid pre-battle option.

Veterancy: surviving troops earn perks and names; troop death is permanent. Named veterans can be promoted to LIEUTENANTS who hold fronts or lead secondary forces without the player.

MIXED ARMIES: conquering or allying in a region unlocks recruiting its local troops. Late-game warbands are cross-cultural.

## Cultures (12)
Rome, Greece, Japan, China, Mongolia, Rus, Arabia, Vikings, Persia, India, Egypt, Aztecs.

Launch with 3 playable culture starts / territories (target trio: Rome, Japan, Mongolia — maximum contrast). The rest arrive as free post-launch updates.

Design rule: **each region is a puzzle the player's current army doesn't solve** — invading forces adaptation, local hiring, and terrain play.

- **Rome** — Doctrine archetype: discipline, testudo vs. arrows, pilum volley, best siegecraft, roads speed travel in their lands.
- **Greece** — phalanx wall: nearly unbreakable frontally, weak to flanking; feuding city-states the player can hire on with against each other.
- **Japan** — Blade archetype: few but elite; duels (challenge a garrison commander to single combat for a bloodless takeover); night raids.
- **China** — mass and technology: repeating crossbows, halberd blocks, war-drum formation buffs, the biggest walled cities (endgame siege puzzle).
- **Mongolia** — Horde archetype: horse archers that kite, roaming camps instead of fixed cities, fastest overland travel; momentum rules (conquest recruits troops, idle armies desert), vassalize-only governing.
- **Rus** — attrition: winter punishes invaders, heavy axes and shield walls, wooden kremlins that can be set ablaze.
- **Arabia** — Coin archetype: richest trade cities, desert supply attrition, assassin guilds for hire, camel cavalry that panics horses.
- **Vikings** — coastal raiding: longships strike any coastline (the sea is a highway, not a wall); berserkers immune to morale. Headline of the first free update ("The Longship Update"), which introduces naval travel.
- **Persia** — Immortals: an elite corps that auto-replenishes its losses; satrapies embody the vassal system; the Royal Road speeds travel.
- **India** — war elephants: terrify and trample enemy lines, but if panicked they rampage into whichever side is nearby.
- **Egypt** — chariots dominate open ground; Nile logistics; the richest loot per settlement.
- **Aztecs** — across the sea, reachable only after naval travel exists: flower-war capture rules — defeat means captured for sacrifice, triggering an escape scenario instead of a death screen.

## Culture Choice at Run Start
The player picks a culture, which sets: the global rule-set archetype (Horde / Doctrine / Blade / Coin), the hero's starting kit, the home territory, and the starting troop roster.

## Run Structure
Run-based campaign (15–25 hours), replayable via culture starts. On death, the heir continues with partial inheritance; holdings may fracture during succession.

## Platform Plan
Phone-browser-first controls: one thumb plus a few buttons, resolution-independent UI, touch and keyboard both. Ship order: free web version (first territory, the discovery funnel) → paid Steam version ($15–20) via a thin desktop wrapper → mobile app (free download + single unlock purchase).

Placeholder shape art until the loop is fun.

## Settlements & Services
Settlements are physical places, not menus. The player's home base is a walkable **BANDIT CAMP** with functional buildings:
- **FORGE** — weapons, armor, shields, and bows. Armor and shields are new hero equipment slots adding **Defense**. A bow is an alternate weapon where the hero auto-fires at range for lighter damage.
- **BARRACKS** — recruit troops.
- **STABLES** — horses, e.g. a fast **Courser** vs. an armored **Destrier**; mounted = faster, bigger silhouette.

Services are **conquest-gated**: you can only shop and recruit in settlements you control. When occupation arrives (Milestone 3), **OCCUPIED** settlements unlock their own forge/barracks/stables with local gear and local troops (the start of mixed armies), while **SACKED** settlements burn those services permanently.

## Settlement Interaction
No walking around inside friendly settlements. A settlement (camp, village, town) is a **single illustrated screen** showing its buildings; you tap a building (Forge, Barracks, Stables, etc.) and its panel pops up. Big one-thumb tap targets. **Walking/steering exists only in combat** (raids, sieges, patrol fights). The Bandit Camp uses this model.

## Ranged Rule
Bows cannot fire at full speed. **Shooting requires being stopped or nearly stopped** (mirrors melee foot-planting); **mounted, the horse slows to a walk while firing.** This is the world's default rule — Mongol horse archers will later BREAK it as their cultural signature (full-gallop fire). This kills bow + Courser kiting as a degenerate strategy.

## Default Tuning Notes
- Raider patrol chance 45% → **30%**.
- Keep "Ruined · 8d" for now.

## Settlement Access
Unconquered settlements can be **VISITED** peacefully while they have no reason to fear you. Visiting opens the settlement screen as a customer: Forge and Stables at a ~50% markup with smaller stock; Barracks locked ("the locals won't fight for you"); an **INN** that sells one rumor (a real hint about the world: patrol routes, fortification, Kingsport's garrison). Gates close — VISIT replaced by a "they know your face" notice — for any settlement the player has personally raided (forever, unless later occupied), and for ALL unconquered settlements once infamy reaches Raider. Occupied settlements: full access, no markup, as now.

## Art Direction (identity pass, not the art pass)
Still 100% code-drawn, but it must look intentional. One cohesive palette: aged-parchment UI panels, dark iron surfaces, ember/gold accents, muted earth terrain; blood-red reserved for danger (raid buttons, infamy, telegraphs). Two self-hosted fonts: a strong display face for titles, a clean face for UI. Styled buttons/panels with consistent borders, spacing, and shadows. Units become composed-shape figures whose type reads at a glance: helmet shapes, shields, visible weapons (militia pitchfork, archer bow, captain plume, hero cloak). Settlement building cards become small vignettes: forge with glowing coals and smoke, barracks with a banner, stables with horse heads over doors. Map: unify colors, name plates on settlements, subtle road texture. Soft shadows under every entity in raids.

## Milestone 1 — The Raid Loop (built 2026-08-28)

**Designer-specified (from the M1 brief):** movement-only hero with auto-attack; War Horn (rally + speed boost) and Charge (dash + knockback) on Q/E and two big touch buttons; 3 starting troops in loose formation with permanent death; village of huts defended by ~8 militia, 2 kiting archers and 1 slow hard-hitting spearman captain; gold pickups; victory summary / defeat with retry; camp with 3 weapon tiers (bigger strike each tier) and recruiting up to 6 troops; Raid 2 is bigger and stronger; punchy feedback (hit-pause, knockback, damage numbers, hit flash, small shake); positioning must matter (real damage, surrounding, funnel between huts).

**Working assumptions made by the build — overrule any of these by feel:**
- **A lost raid rewinds.** Retry (or returning to camp after a defeat) restores gold and troops to how they were when the raid began. Losses only become permanent when you *win* the raid. This avoids a death spiral where one bad raid leaves you with no troops and no gold.
- **Start:** 0 gold, Rusty Sword, three named recruits. Hero and troops heal fully at camp.
- **Prices:** Iron Sword 80, Warlord Blade 200, recruit 35, max 6 troops. Raid 1 pays roughly 100 gold.
- **Hero recovery:** after 4 seconds without being hit, the hero slowly regains HP (4/s) — pulling back to breathe is a real tactic.
- **Swinging plants your feet** for a fraction of a second, and militia lunge after you mid-swing, so you cannot back-pedal forever while auto-attacking. The captain stays planted during his wind-up so you can step out of it.
- **Charge makes you untouchable for its 0.2 s** — it is also a dodge.
- **The War Horn is loud:** it wakes defenders within earshot.
- **Map:** you start in a dead-end street (huts on three sides) — defenders can only reach you two at a time. The plaza and the fields north-west of the street are open ground where they surround you. Defenders wake in waves as you approach (a woken defender alerts friends nearby, one hop).
- **Raid scaling:** each raid adds 2 militia, an archer every other raid, a captain every third; +25% HP, +10% damage, +15% gold per raid.
- **Sound:** generated blips only (no audio files).
- **Nothing is saved between page reloads yet** — save/load is Milestone 2.

## Milestone 2 — The Overworld, Infamy, and a Real Home (built 2026-08-28)

**Designer-specified (from the M2 brief):** a world map with the warband as a token moving along roads by tap, travel costing in-game days with the date shown; four villages and one locked town (approaching warns the garrison is far too strong); entering a village launches the raid with varied layouts and defender mixes; the camp menu replaced by a walkable Bandit Camp with Forge (3 sword tiers, basic armor, a shield, a hunting bow), Barracks (recruit, max 6) and Stables (a fast Courser and an armored Destrier); an infamy meter with tiers Nobody → Bandit → Raider that adds road patrols (interception → open-field battle), fortification of unraided villages (extra defenders, palisades) and a bounty shown on the map; single-slot save/load in browser storage.

**Working assumptions made by the build — overrule any of these by feel:**
- **Travel:** each road costs 2–3 days depending on its length (shown on the road). You pass through places on the way without stopping. A new warband starts inside the camp.
- **Villages:** Ashford (tier 1, ~11 defenders, the M1 map), Millbrook (tier 2, three lanes + longhouse), Thornhill (tier 3, a warren of one-wide alleys), Greywater (tier 4, a huge open plaza). After a raid a village is **ruined for 8 days** (nothing to take); then it rebuilds with +2 militia, +15% stats and +10% loot per previous raid.
- **Infamy:** +6 plus +2 per village tier for a raid; +2 for routing a patrol. Tiers at 0 / 10 / 30. **Patrols:** 25% per road at Bandit, 45% at Raider, never twice within 3 days; a Bandit-tier patrol is 5 militia + 1 archer, Raider-tier is 8 militia + 2 archers + a captain, fought on an open field with a few boulders. Losing to a patrol: fight again, or fall back to the place you came from.
- **Fortification:** from the day you become a Bandit, villages you have never raided hire +1 militia every 4 days (every 3 as a Raider), up to +6; at +2 they raise a **palisade** (walls with gates at the lane mouths), at +4 an extra archer arrives. The map shows "fortified +N" and a palisade ring.
- **Bounty** = 12 gold × infamy. Display only until bounty hunters arrive (M6).
- **Gear:** Leather Armor 60g (+2 defense), Round Shield 50g (+2), Hunting Bow 70g (9 damage, range 230, shoots every 0.7 s; buying it equips it — switch sword/bow at the forge). Defense takes that many points off every hit you take, never below 35% of the hit.
- **Horses:** Courser 120g (+45% speed), Destrier 180g (+20% speed, +3 defense, +30 HP). Mounted, the hero is drawn 1.25× / 1.4× bigger with a horse under him; choose what to ride at the stables.
- **Saving:** one slot, per browser/device, written at every safe point (arrival, purchase, battle result). The title screen offers Continue / New warband (which erases the save).
- **The town** (Kingsport) only warns you off until Milestone 3.
- Services are conquest-gated by design; for now only the camp has any.

## Milestone 3 — Armies Eat, and Kingsport Falls (built 2026-08-28)

**Designer-specified (from the M3 brief):** upkeep (daily wages while traveling, a ledger on the map bar, one day of morale warning then desertions one by one); the siege of Kingsport (a wall with a gate that has HP, archers on the wall tops, then two waves inside — town guards a tier above militia and a garrison captain mini-boss who drops a signature weapon); SACK or OCCUPY after any conquest (sack: big one-time gold, ruined, services burn, infamy spike; occupy: smaller loot, daily tribute, 2 troops pinned as garrison, its Forge/Barracks/Stables open with local stock — Kingsport's beats any village's); conquest-gated shopping; a balance pass so raid → travel → siege leaves you slightly ahead if you play well and broke if you idle.

**Working assumptions made by the build — overrule any of these by feel:**
- **Wages:** 2 gold per troop per day, paid whenever days pass (roads, or "Wait a day" at the camp). Tribute arrives first, then wages. If you can't pay: day 1 the men grumble (warning on the ledger and a toast on arrival), from day 2 one random troop deserts per unpaid day. Garrisons cost nothing.
- **Tribute:** villages 4 + tier gold/day (5–8); Kingsport 15/day.
- **After a village victory you get three choices**, not two: SACK (+50 +30×tier gold, burnt for good, infamy +10), OCCUPY (needs 2 troops; tribute; shops), or **LEAVE** — take the loot, the village lies ruined for 8 days and rebuilds tougher (the M2 loop). The loop of "raid to feed the army" needs LEAVE to exist. Kingsport offers only SACK (+350 gold, infamy +25) or OCCUPY.
- **Siege unlock:** Kingsport can be besieged once you are a **Bandit** (infamy 15). Before that, tapping it explains what it takes (no days wasted). The siege: a gate with 300 HP that swords, troops and arrows chip at; 4 archers on the battlements who can only be hit with the bow while the gate stands (they shoot over everything; use the rocks); when the gate falls they climb down and 8 town guards wake; when the courtyard is clear the garrison captain (320 HP, ring telegraph) comes out with 3 guards. He drops the **Kingsport Halberd** (tier-4 weapon, damage 34, reach 100, 200° arc), auto-equipped; switch at any forge.
- **Local stock:** camp — swords to tier 3, leather, round shield, bow, courser, destrier, raider recruits (55 HP / 8 dmg / 35g). Villages — swords to tier 2, leather, round shield, levies (45 / 7 / 25g), a courser at tier 2+. Kingsport — everything plus Steel Plate (+4 def, 150g), Kite Shield (+3, 120g), town guards (75 / 10 / 60g).
- **Defense** now shaves a share off each hit: def / (def + 12) — 4 ≈ 25%, 7 ≈ 37%, 11 ≈ 48% — so every point keeps mattering.
- **Ranged rule as built:** on foot the bow fires only when the joystick is below 35% (nearly stopped); mounted, the horse drops to 35% speed while there is a target in range and you fire at that walk.
- **Tuning from the M2 review:** infamy tiers now 0 / 15 / 45 (raids give 5 + 2×tier; sack spikes push you up fast); Raider patrols are 6 militia + 2 archers + captain at 30%; fortification maxes at +4 militia and no longer jumps when you change tier; courser speed +35%.
- Settlements are tap screens now (camp, occupied villages, Kingsport); "Wait a day" exists only at the camp. Save format changed (v3) — old saves are not loaded.

## Milestone 3.5 — Visits and the Identity Pass (built 2026-08-28)

**Designer-specified:** peaceful VISITS to unconquered settlements (Forge/Stables at ~50% markup with smaller stock, Barracks locked, an Inn selling one true rumor); gates shut for any settlement you personally raided (forever, unless occupied) and for every unconquered settlement once you are a Raider; the art-direction identity pass across every screen.

**Working assumptions made by the build:**
- **Visitor stock:** villages sell leather only and no swords (tier 3–4 villages also a courser); Kingsport sells swords to tier 2, leather, a round shield, a courser. Markup ×1.5, rounded up. A rumor costs 10 gold (no markup) and each inn sells you every rumor it knows, one per visit, never the same one twice. Rumors are generated from the live game (patrol odds, fortification progress, Kingsport's garrison and gate, each village's layout, the ranged rule, wages).
- **Access rule as built:** `visit` when never raided by you and infamy below Raider; `closed` ("they know your face") once you have raided it or once you are a Raider; occupied places are always yours. A failed siege does not count as a raid. On the map, open places read "open", shut ones "shut to you".
- **Palette:** parchment `#e7d8b4`, ink `#3a2a18`, iron `#2a2c32`, ember `#f2711c`, gold `#d9a441`, earth `#5b6b42`, danger `#a8231b`. Fonts: Cinzel (display) and Nunito Sans (UI), bundled with the game. Buttons come in five tones — danger (raid, siege, sack, fight), primary gold, ember "go" buttons, parchment neutral, iron ghost.
- **Fixes folded in from the M3 review:** a new warband starts with 40 gold and gets two days of grace, so nobody deserts on the first road; OCCUPY counts only survivors (one is enough to hold a place; up to two stay); Kingsport can also be LEFT (the garrison regroups) so a bloodied warband is never forced to burn it; sacking now spikes infamy on top of the raid's infamy; the mounted bow walks whenever a target is in range (not just on the shot); a bow-only hero shoots the gate; wall archers' arrows clear the wall but not rocks or huts; a battle won just before a reload comes back as the sack/occupy choice; owned armor and shields can be worn again at any forge.

## Balance Patch (designer, 2026-08-28)
1. **The gate is a phase, not a speed bump.** Gate HP 300 → **1000**: a fresh warband (~50 dps with three raiders) spends ~20–30 s on it under fire from the four wall archers. The decisions in that phase: bring a bow, use the rocks as cover, or eat the damage. If the wall archers still barely matter, the gate is too weak.
2. **Staggered waking.** When the gate falls, only the guards within 240 px of it come running; the deeper groups wake by proximity as you push in (town guards shout only to their own squad, ~100 px). The captain-and-escort finale stays as its own beat after the courtyard is clear.
3. **Spears out-reach swords.** Captain reach 38 → **92**, garrison captain 42 → **100**; swords reach 54 / 68 / 86, the halberd 100 (it can match). The red ring is a real dodge moment: step out or take the blow.
4. **Sack economy.** Sacking pays **2× the raid's own loot on top of it** (3× total; floors of 120 for a village, 500 for Kingsport) — a big NOW against tribute, shops and re-raids. Re-raiding pays less each time: a raid drops the village's **wealth by 70%** (floor 10%) and it recovers **+1/15 per day** (~15 days to full). Wealth multiplies the loot and shows on the map ("60% wealth").
5. **The bow's job.** Damage 9 → **12**, range 230 → **300** (wall archers fire at up to 280 — you out-reach them), 0.65 s between shots, arrows a little faster. Its identity is the support/siege weapon: soften the approach while troops hold the line, pick archers off walls. Flagged below if it still feels like a strict downgrade.
