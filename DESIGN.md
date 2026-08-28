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
