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

## The World Chart
The map is one stylized, compressed Earth drawn as an aged parchment chart: real oceans and coastlines, hand-drawn look, compass rose, sea creatures in unexplored waters. The whole world is visible from day one, Plague-Inc-style — all 12 culture regions drawn, named, and tinted (Rome, Greece, Japan, China, Mongolia, Rus, Arabia, the Viking north, Persia, India, Egypt, and the Aztecs across the western ocean). The player's homeland is a small unnamed borderland kingdom between Rus and the steppe. Regions the player can't enter yet render fully but muted, with a one-line flavor note when tapped. Ocean routes are dashed and locked ("no ship will carry you — yet"). Zoom is continuous: far out, the world and its regions; zoomed in, the current territory's roads and settlements. One chart, not two screens.

## The Bow Pierces
Arrows continue through the first target at reduced damage (~60%). The bow's identity is the line-holder's weapon: troops form the wall, the player thins the crowd behind it.

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
5. **The bow's job.** Damage 9 → **12**, range 230 → **300**, 0.65 s between shots, arrows a little faster. Wall archers now fire only up to **250** px, so a bow at 250–300 shoots them without reply; the bow also aims over the wall but not through rocks or huts (rocks are cover for both sides). Its identity is the support/siege weapon: soften the approach while troops hold the line, pick archers off walls. Flagged below if it still feels like a strict downgrade.

## Milestone 4 — The World Chart and the Mongol Steppe (built 2026-08-28)

**Designer-specified:** the world chart (one stylized parchment Earth, all twelve regions visible from day one, muted where locked, dashed locked sea roads, continuous zoom from world to territory); the homeland as a small borderland region; the land border into Mongolia — rolling steppe with 2–3 roaming warband camps drifting between waypoints and one neutral trade camp; steppe battles on open ground with one or two rocky chokes; horse archers that fire at full gallop and kite; counterplay via choke terrain, hired Steppe Riders and the Composite Bow; a separate steppe infamy meter; roaming camps raidable but never occupied, and the other camps' riders hunting a raider.

**Working assumptions made by the build — overrule by feel:**
- **The chart** is 3000×1800 world units drawn once at half resolution; the old homeland map is scaled to 22% and placed inside the Borderland. Zoom runs from "the whole world fits" to 3.2×; the territory view opens at 2.2×. Far out only regions and their names show; roads, settlements and camps fade in past ~1× zoom. Drag to pan, pinch or wheel to zoom, or the +/− buttons (thumb reach). Tap a locked region for its note; tap Mongolia to march to the Border Stones.
- **Roads:** homeland roads cost as before (2–3 days); steppe stretches are horse country — 45 world px per day, about 2–3 days a hop. The border crossing Greywater → Border Stones is 4 days.
- **Camps** ride a fixed ring of six waypoints (Red Hill, the Salt Pan, Eagle Rocks, the Long Water, Bone Pass, the Grey Wells), one hop per day, always two waypoints apart, so where a camp stands is pure arithmetic on the day (a save can never disagree). A raided camp scatters for 10 days, then re-forms on the ring. Camp: 5 horse archers, 4 riders (mounted lancers who surround like militia), 1 noyan (a mounted captain, reach 60). Loot ~150 gold; steppe infamy +8; the other camps hunt you for 12 days at a 50% intercept per stretch (6 horse archers + 2 riders on open grass with two rocky chokes). Camps offer only "take the loot".
- **Horse archers:** 34 HP, speed 190 (you cannot catch one on foot; a courser can), 8 damage every 1.5 s from 190–280 px, a 0.15 s draw that never stops the horse; they circle at range, fall back when pressed, and only close on a target they cannot see. Arrows are stopped by rocks — the chokes.
- **Khoja's camp** (neutral, no markup, always open): Steppe Riders for hire (90 gold: mounted archer troops, 50 HP, 7 damage, keep ~150 px and shoot, range 220), the Composite Bow (220 gold: 13 damage, 300 range, 0.6 s — shoots while moving at up to 65% speed, on foot or mounted), leather, a courser, and an inn whose rumors include the gallop rule.
- **Steppe infamy** uses the same tiers (Nobody 0 / Bandit 15 / Raider 45); routing a rider patrol +2, plundering a camp +8. Homeland infamy and the bounty are untouched by anything done on the grass. The map bar shows whichever meter belongs to the ground you stand on.
- **Pierce:** the hero's and riders' arrows carry on through the first body at 60% damage (then 36%), up to three bodies; enemy arrows do not.
- Existing saves keep working (same v3 format; new fields default). Locked regions are flavour only until their milestones.

## ATLAS OF EMPIRES (designer, 2026-08-29)

1. **EARTH, RECOGNIZABLE.** The chart is redrawn with genuinely recognizable Earth coastlines in the parchment style — the Mediterranean and the Italian boot, Scandinavia, the Arabian peninsula, India's triangle, the Japanese archipelago, the Americas across the western ocean. Proportions stay compressed so travel times hold, but anyone glancing at it should say "that's Earth."
2. **EMPIRES, NOT AREAS.** Every region is a named realm with a title and a tint: The Roman Empire, The Greek City-States, The Shogunate of Japan, The Middle Kingdom, The Mongol Khanates, The Principalities of Rus, The Caliphate, The Norse Jarldoms, The Persian Empire, The Kingdoms of India, The Kingdom of the Nile, The Aztec Empire. The player's homeland stays "The Borderland" — small and untitled among giants.
3. **EVERY EMPIRE HAS PLACES.** Each realm gets a plausible settlement layout now, visible even while locked: one capital (crown), 2–3 major cities, and a scatter of towns and villages with era-authentic names (Roma, Capua, Ravenna; Chang'an, Luoyang; Heian-kyo, Kamakura). Tapping a locked settlement gives a one-line flavour note; tapping a locked empire gives a small card — name, flavour, throne city. These markers are the content plan: when a region unlocks in a later milestone, they become its real settlements. Mongolia stays nomadic — waypoints and roaming camps, no fixed cities.
4. **ATLAS ZOOM (LOD).** Far out: coastlines and empire names only. Mid: capitals and major cities fade in. Close: towns, villages, roads, camps. Smooth fades, no popping; pan and zoom freely across the whole world.

## Milestone 4.5 — The Atlas of Empires (built 2026-08-29)

**Designer-specified:** recognizable Earth coastlines in the parchment style; every region a named realm with a title and tint; every empire given a plausible settlement layout now (capital, cities, towns, villages with era-authentic names), visible while locked, with flavour on tap; atlas level-of-detail from coastlines to roads; saves keep working; distinct icons per settlement rank; smooth panning on a phone.

**Working assumptions made by the build — overrule by feel:**
- **The chart is real geography.** Every coastline, border and city is authored as true longitude and latitude and projected once, on a Mercator (the projection that keeps shapes true, which is what makes a map read as Earth). The window is longitude −125°…145° and latitude 72°…−49°, drawn into 5400×3240 world units. Because it is a real projection, anything added later — a new empire, a river, a port — only needs its real coordinates.
- **Compression is done with days, not distance.** Every road now carries a hand-set cost in days, unchanged from Milestone 4, so redrawing the world (or moving a whole territory) can never change how long a march takes.
- **Where the Borderland sits.** Between Rus and the grass, on the Volga–Ural steppe edge (longitude 55–68). The old homeland map is squeezed into it: it is roughly the size of Portugal on a map of the world, which is the point.
- **Level of detail.** Zoomed out past 1.3 the world shows only coastlines and the twelve realm names. Capitals and great cities fade in from 0.55–0.85; towns, villages, roads, camps and name plates from 1.3–1.8. Zoom runs from "the whole Earth fits on the table" to 5×, and opening the map frames whichever territory you stand in.
- **Ranks.** Capital = a gold crown; city = three towers behind a wall; town = one roofed tower; village = two roofs. Locked ones are inked in sepia, and every marker is anchored at its own point with the name beneath it.
- **Realm names are placed by hand** (open ground, clear of neighbours) rather than at the centre of the realm, and wrapped narrow — the crowded Mediterranean is unreadable otherwise. Tapping the name opens the realm's card; tapping a settlement gives its one line.
- **Performance.** The whole chart — sea, hatching, land, every realm's tint clipped to its coast, the ink, the dashed sea roads, the monsters and the compass — is painted once into a single texture. Only the borders of the two realms you can walk into stay live vectors, so they are still razor sharp when you dive down to your own roads. (Live vector shapes are re-tessellated every frame; drawing the chart that way cost more than half the frame rate.)
- **Mongolia has no cities** — waypoints and camps that move, as before. The Aztec Empire sits across the western ocean, and every sea road to it is still dashed.
- Nothing about raiding, upkeep, infamy or the steppe changed. Existing saves load and keep every settlement's state; only where they are drawn moved.

## MAP DENSITY (designer, 2026-08-29)

The chart should stop feeling empty and start feeling like a fully OWNED world. No new gameplay.

1. **EMPIRES CLAIM THEIR HISTORICAL EXTENTS.** Realm tints grow from small patches to stylized-historical territories that follow geography. Rome wraps the Mediterranean rim; the Caliphate spans Arabia plus the North African coast until they meet; Persia fills its plateau; the Mongol Khanates sweep the whole steppe and **share a real border with The Borderland** (no gap — the fiction says we touch); Rus reaches the Urals; the Middle Kingdom fills its river plains; the Kingdoms of India take the subcontinent; Egypt and Kush divide the Nile; the Shogunate tints exactly the archipelago; the Aztecs Mesoamerica; the Inca the Andes spine. Most land the player looks at should belong to someone.
2. **GEOGRAPHY INK LAYER.** Hand-drawn rivers (Nile, Tigris–Euphrates, Volga, Danube, Ganges, Yangtze), mountain chains (Alps, Urals, Himalayas, Andes), desert stippling (Sahara, Gobi), forest scatter (northern Rus) — all faint ink beneath the realm tints. Oceans get subtle rhumb lines, a few more sea creatures, and dashed future trade lanes.
3. **TERRA INCOGNITA.** Unclaimed interiors get parchment fog and sparse "here be dragons" flourishes, clearly distinct from realm land.
4. **MISSING REALMS.** The Kingdom of Kush (capital Meroë, south of Egypt) and The Inca Empire (capital Cusco, the Andes) belong on the chart.
5. **ANCHORS AT EVERY ZOOM.** Capitals (crown markers) stay visible even fully zoomed out, so the world view has landmarks rather than floating names.
6. **POLISH.** Fix the Caliphate label's clipped render; borders trace coasts, rivers and ranges instead of blobby polygons; realm tint contrast up one step against unclaimed land; fix label collisions (Kingdom of the Nile).

## Milestone 4.6 — Map Density (built 2026-08-29)

**Designer-specified:** historical realm extents that follow geography, a geography ink layer, terra incognita, the Kingdom of Kush and the Inca Empire, capitals visible at every zoom, and a list of polish items.

**Working assumptions made by the build — overrule by feel:**
- **Borders are drawn generously and then clipped to the coast.** Every realm outline deliberately overshoots into the water, and the chart clips both the tint and the border ink to the land — so a border traces the real coastline exactly, and inland borders can be routed down a river or along a mountain crest without any coast-tracing by hand. That one trick is what turned blobby polygons into an atlas.
- **The Borderland and the Mongol Khanates share three exact vertices**, so the two realms touch with no gap — the fiction says you are neighbours, and now the chart says it too. A lint check enforces it.
- **Terra incognita** is painted by erasing every realm out of a fog laid over all the land, so it never mis-reads however the realms overlap. Unclaimed land is duller and stippled, with sparse dragons and one old warning where the fog is widest. About a quarter of the world's land is claimed once you count Siberia, the Americas, central Africa and Australia — the *inhabited* Old World the player looks at is nearly all owned.
- **The ink layer** is 35 rivers (drawn broad at the mouth and tapering to a hair at the source), 33 mountain crests (peak marks marching along the ridge), and 34 areas of ground cover (desert stipple, forest scatter, steppe ticks, marsh reeds), all under the tints. The sea gets portolan rhumb lines from five hubs, four more monsters and three dashed trade lanes.
- **Kush** holds the Nile above the first cataract at Aswan and shares that line with Egypt; **the Inca** take the Andes spine from Quito to central Chile. Both come with a capital, cities, towns and flavour, like every other realm.
- **Twelve landmasses were missing** and are now drawn — Australia, Greenland, New Guinea, Sumatra, Java, Borneo, Sulawesi, Luzon, Mindanao, Hainan, Tasmania, Kamchatka.
- **Capitals are always drawn**, at half strength when zoomed out and full strength once cities fade in, so the world view has landmarks. A marker's tap target is the size it is drawn, so a crown seen from orbit is not a giant hitbox.
- **Polish:** realm names now wrap at 14 characters (THE CALIPHATE was being split in two) and carry right-hand padding, because Phaser under-measures letter-spaced text and was shaving the last glyph. Realm tints went up a step against the fog. `node tools/check-chart.mjs` grew checks for realm overlap, the Mongol border, ink drawn in the sea, and how much of the world is claimed.

## RENDERING (designer, 2026-08-29)

The chart must be crisp at every zoom. Fix the architecture, not just the art.

1. **VECTOR REDRAW, NOT SCALED BITMAP.** Coastlines, realm tints, borders and geography ink are re-rendered at the current zoom so edges stay sharp at any magnification. A cached texture is fine for performance, but it must be regenerated per zoom band (throttled to zoom-end is fine; keep the phone smooth).
2. **SCREEN-SPACE LABELS AND ICONS.** Settlement icons and names render at constant screen size, anchored to their map point — icon exactly on the spot, label consistently offset — never scaled or blurred with the map. One icon per settlement. No orphan labels.
3. **LABEL LOD + COLLISION.** Type size follows settlement rank (capital > city > town > village). When labels would collide, the lower rank hides until you zoom closer. Nothing overlaps, at any zoom.
4. **WATER IS WATER.** The Red Sea — and any strait — draws as ocean: the same water colour and coastline treatment as the rest of the sea, not a hatched green band.
5. **CLOSE-ZOOM GEOGRAPHY.** Zooming into a realm reveals detail that rewards it: the Nile drawn as a real river through Egypt and Kush, crisp desert stippling, realm borders thinning and hugging terrain. Blurry background blotches are replaced by detail that re-renders cleanly.

## Milestone 4.7 — Rendering (built 2026-08-29)

**Designer-specified:** re-render the chart at the current zoom instead of magnifying a bitmap; screen-space labels and icons; label level-of-detail with collision; water that reads as water; close-zoom geography worth zooming into.

**Working assumptions made by the build — overrule by feel:**
- **The chart is drawn for a view, not for the world.** `ChartPainter` paints one rectangle of the world at a given number of pixels per world unit, and every width, spacing and stipple in it is written in SCREEN pixels and divided by that scale. So a coastline is the same weight of ink at the world view and among your own villages — it simply follows a finer line — and realm borders thin down onto the terrain as you come in.
- **Two layers.** A small picture of the whole world is always there (it costs little and is only glimpsed at the edge of a fast drag), and a detail sheet the size of your screen is repainted at the zoom you settled on, 130 ms after the view stops moving. Nothing repaints mid-pinch. The sheet is capped at 2.2 million pixels, so a phone paints at about four-fifths of device resolution and a desktop exactly at it.
- **Names and markers never scale with the map.** A marker is drawn from a texture four times larger than it is ever shown, so it is always scaled DOWN; a name is rendered once at 22 px with extra resolution and only ever scaled down too. The marker stands exactly on its point; the name sits a constant two pixels beneath it.
- **A settlement asks for its marker and its name together.** Working from capitals down, each one claims a box; where there is no room for both it keeps the marker and gives up the name, and it steps aside entirely only when even the marker will not fit. A realm's name outranks every settlement in it, and your own places outrank everybody. That is what stops Kerma and Pnubs — real neighbours three units apart — from ever printing on top of each other, and it is why no name is ever orphaned from its marker.
- **Water.** Two soft bands of darker water hug every coast, the sea carries hatching at a constant spacing, and inland seas get exactly the same treatment. The Red Sea was being fogged as land because the terra-incognita path counted a strait where two realms both overshoot the water; the fog is now clipped to the land first and the realms subtracted inside it.
- **Close in**, rivers are drawn through a curve fitted to their real towns (so the Nile meanders instead of zigzagging), ground cover thickens as you approach at an even density on screen, and the soft parchment blotches are gone — replaced by grain that is re-drawn at whatever scale you are looking from.

## MAP UX & FREE TRAVEL (designer, 2026-08-29)

**A. VIEWPORT & CONTROLS.** The canvas fills the browser window with the map centred — no dead letterbox strip on wide monitors. The top HUD must not cover the map: its height is reserved so the camera and tap targets live entirely below it. A LOCATE button (crosshair, near the zoom buttons) smoothly centres the camera on the warband; new game and load also open centred on you. Double-click or double-tap zooms in a step toward the pointer. On a trackpad, two-finger scroll pans and pinch zooms; mouse-wheel zoom stays. On desktop, holding the mouse near a screen edge pans the map.

**B. TRAVEL: FREE MOVEMENT.** Travel is point-to-point. Tap anywhere on land and the warband marches there along a sensible overland route — never crossing water, skirting mountains. Travel time is distance × terrain speed: plains fast, forest slower, mountains slowest, steppe fast when mounted. Roads remain as drawn features and grant a speed bonus when the route follows them (later: Roman roads and Persia's Royal Road as cultural perks). A route preview shows the day cost before you confirm. PATROLS become visible hunter parties on the map: at Bandit infamy and above they spawn near you, move each day, chase when close, and contact forces the fight. The road-leg travel UI is gone; settlement tap panels stay as they are.

**C. EARTH-LIKE ART.** Biome tinting under the parchment style — temperate green Europe, snowy taiga north, sand deserts (Sahara, Arabia, Gobi), jungle greens (India, Mesoamerica) — so the planet reads as Earth, not uniform tan. The ocean is slightly bluer, the seas are named in faint italic caps, and the rhumb lines and creatures stay. Realm tints become translucent washes over the biomes with clean borders.

**D. THE WILDS.** The lands beyond the fourteen realms — the North American interior, Australia, Siberia, the sub-Saharan interior — are THE WILDS: uncharted fogged parchment with wildlife sketches, terrain ink and HIC SVNT DRACONES lettering. They must read as wilderness, not as unfinished map, and they are reserved as expansion slots for post-launch culture waves. The chart also carries the furniture of an authored map: a decorative border frame, a title cartouche ("THE KNOWN WORLD") and a scale bar.

## Milestone 4.8 — Map UX, free travel, Earth-like art, the Wilds (built 2026-08-29)

**Working assumptions made by the build — overrule by feel:**
- **The sea runs past the frame.** The camera may look a little beyond the chart's border, and the painter fills whatever it sees with ocean, so a wide monitor never shows a dead strip. The camera's own viewport starts below the status bar, so the bar can no longer cover the map or swallow a tap.
- **Travel is a march across ground.** The world is divided into 18-unit cells that know whether they are land and what grows there; a route is A* across them, never crossing water and never cutting a corner over it. A day is 22 world units on plains, and the ground scales that: steppe 1.15 (1.35 mounted), desert 0.75, forest 0.7, marsh 0.55, jungle 0.5, mountains 0.42. A road is worth half again as much as the ground beside it, so the old roads still pay — they are just no longer the only way. Every tap previews the route and its cost in days before you commit; settlement panels are unchanged and their MARCH button is the confirm.
- **Hunters are people now, not dice.** At Bandit and above, parties set out from 150–330 units away, move each day, close on you when they are within about 500 units, and give up after a fortnight. Come within 26 units and the fight happens — reloading does not dodge it. Steppe riders move a quarter faster than homeland bounty men. You can watch them come, and you can try to outrun them.
- **Biomes** are painted as latitude bands washed across the land (ice, taiga, temperate, dry, tropical) with the deserts, forests, steppe and marshes laid over them as their real shapes — smooth at any zoom rather than a grid of squares. Realm tints are translucent washes on top, so the ground still shows through, with the border ink carrying the claim.
- **The seas are named** in faint italic caps that follow the water and drop out when they would be too small to read.
- **The Wilds** are the unclaimed land: fogged, stippled, and marked with the beast that belongs there — a bison in the far west, an elephant in the south, a kangaroo in the southern land, a bear in the northern forests — plus the old warning. The chart carries a title cartouche, a scale bar in days of marching, and a ticked border frame.
- Kept: pinch, wheel and +/− zoom; added double-tap zoom toward the pointer, two-finger trackpad panning, edge scrolling on desktop, and a ⌖ button that flies the camera back to your warband (which is also where the map opens).

## FOREIGN GATES OPEN (designer, 2026-08-29)

Land-reachable locked realms' capitals and major cities become VISITABLE through the existing visit system: a Forge and Stables carrying culture-flavoured stock at a steep foreigner markup, an INN that sells rumors about that realm, a Barracks that stays locked ("the locals won't fight for a foreigner"), and all war actions locked with honest in-fiction text (e.g. "Rome's legions are far beyond a Borderland warband — war in the west comes in a later age"). Towns and villages of locked realms stay flavour-tap only. Sea-locked realms (Japan, the Aztecs, the Inca, the Norse) keep "no ship will carry you — yet." Entering a new realm spawns its own infamy meter at Nobody — the steppe system, generalized. Travel times stay honest: Rome should be weeks from the Borderland.

Also fixed this pass: trackpad pinch must zoom both ways; a double-click zooms and never places a waypoint or starts a march; the LOCATE button must not freeze the app; edge-of-screen scrolling is removed entirely; and the last of the road-leg travel goes — no day labels on roads, no road-based messages. Roads remain only as drawn speed-bonus features.

## Milestone 4.9 — Foreign gates, and five fixes (built 2026-08-29)

**Working assumptions made by the build — overrule by feel:**
- **The LOCATE freeze was one wrong word.** The camera's pan looks its easing curve up in a table by exact name (a tween is forgiving about spelling; this is not), so `'Sine.InOut'` left it holding a piece of text where a function should be, and it threw an error on every single frame — which is what a frozen game looks like. It now passes the curve itself, so there is nothing left to mis-spell.
- **A trackpad pinch is not a gesture the page can see.** The browser reports it as a mouse wheel with the ctrl key held, and Phaser does not hand that raw event to the wheel callback — the fix reads it off the pointer. Pinch now zooms both ways.
- **A double click is a zoom and only a zoom.** It throws away any march being offered and swallows the tap that ends it, so zooming in can never set you walking by accident. Edge-of-screen scrolling is gone; the map moves only when you move it.
- **The roads are scenery and a shortcut, nothing else.** No day labels along them, no messages about them, and the old shortest-path search over the road graph is deleted. A march that follows a road is still half again as fast.
- **A gate opens where a warband can WALK.** Nine realms border the reachable world by land — Rus, Rome, Greece, the Caliphate, Persia, the Nile, Kush, India and the Middle Kingdom — and every capital and great city in them (36 places) is somewhere you can stand. Japan, the Norse, the Aztecs and the Inca are across water and say so. Towns and villages abroad stay flavour: "a place too small to open its gates to a stranger."
- **The walk is the price.** Marv is 12 days from the camp, Kiev 16, Baghdad 20, Athenai 27, Roma 36, Meroe 42 — no shortcuts, so a foreign forge is a journey you plan, not a shop you pop into.
- **What is for sale says who they are.** Damascus and India sell the best swords in the world; Persia and the Middle Kingdom sell the bow that shoots from the saddle; Rome sells segmented plate and the tall shield; Kush sells arrowheads and little else. Two realms sell no horses at all. A stranger pays between 80% and 160% over the local price, and the barracks is shut everywhere abroad — every realm in its own words.
- **Every realm keeps its own opinion of you.** Cross a border and that realm opens a meter at Nobody, and the status bar renames itself after the ground you stand on. Nothing you can do abroad yet raises it, so no foreign riders come looking — the hunters that follow you in are your own homeland's.
