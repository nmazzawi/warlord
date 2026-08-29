// Rumors.ts — what the inn sells: one true thing about the world, drawn from the live game state.
import { INFAMY, SIEGE, STEPPE } from '../config/balance';
import { wanted } from './Hunters';
import { GameState } from '../state/GameState';
import { LAYOUTS } from './Layouts';
import { NODES } from './WorldMap';
import { visitOf } from './Realms';

export interface Rumor { id: string; text: string; }

/** Every rumor that is true right now. */
export function currentRumors(): Rumor[] {
  const out: Rumor[] = [];
  const tier = GameState.infamyTier;
  out.push({ id: 'patrols', text: tier > 0
    ? `There are ${wanted(tier, GameState.hunted)} part${wanted(tier, GameState.hunted) === 1 ? 'y' : 'ies'} out after you at your name's price. They set out a few days' ride away, move every day you do, and close once they have your scent — but they tire of it inside a fortnight. Ride hard, or ride around them.`
    : `Nobody is looking for you yet. At infamy ${INFAMY.tiers[1].min} the first party sets out, and after that you can watch them coming across the map.` });
  const steps = GameState.fortifySteps();
  out.push({ id: 'fortify', text: tier >= 1
    ? `Villages you have not touched are hiring: +${steps} militia so far, one more every ${INFAMY.fortifyDays[tier]} days, up to +${INFAMY.fortifyMax}. At +${INFAMY.palisadeAt} they raise a palisade; at +${INFAMY.archerAt} an archer joins.`
    : `Once folk fear you, untouched villages hire militia every few days and raise a palisade at +${INFAMY.palisadeAt}. Hit them before they wall up.` });
  out.push({ id: 'kingsport', text: `Kingsport keeps ${SIEGE.wallArchers} archers on the wall, ${SIEGE.guards} guards in the courtyard and the garrison captain in the keep. The gate is oak, ${SIEGE.gateHp} blows' worth — only arrows reach the wall tops. They won't take a nobody seriously before infamy ${INFAMY.tiers[SIEGE.unlockTier].min}.` });
  for (const n of NODES) {
    if (n.kind !== 'village' || !n.layout) continue;
    const l = LAYOUTS[n.layout];
    const gates = l.palisade?.gaps.length ?? 0;
    const st = GameState.settlement(n.id);
    if (st.sacked) continue;
    out.push({ id: `layout:${n.id}`, text: `${n.name}: ${l.hint.replace(/\n/g, ' ')}${gates ? ` If they wall it, expect ${gates} gate${gates === 1 ? '' : 's'}.` : ''}` });
  }
  out.push({ id: 'bow', text: 'A bow is only steady from planted feet — nobody shoots at a run. A horse will slow to a walk to let you loose.' });
  out.push({ id: 'gallop', text: 'Except the Mongols. Their horse archers loose at a full gallop — the only riders in the world who can — and they never stand to fight: they keep their distance, shoot, and fall back. Chase them on the grass and you chase the wind.' });
  out.push({ id: 'camps', text: `Past the Border Stones there are no villages, only camps that move: three warbands drift around the waypoints one hop a day. Raid one and it scatters for ${STEPPE.scatterDays} days — and the others ride to hunt you for ${STEPPE.huntDays}.` });
  out.push({ id: 'khoja', text: "Khoja's camp on the steppe trades with anyone. He hires out steppe riders — mounted archers, fast and dear — and sells the composite bow, which will shoot from a slow ride." });
  out.push({ id: 'chokes', text: 'The steppe has its rocks: a spur or two on every stretch. Between rocks a horse archer must come straight at you, and that is the only place a footman beats one.' });
  out.push({ id: 'wages', text: `Men march for ${2} gold a day each. Miss a day and they grumble; miss two and they walk. A garrison costs nothing to keep.` });
  return out;
}

/** The next rumor this settlement will sell (each place tells you something you haven't heard). */
/** What a foreign inn knows: its own realm, told to a stranger who paid for it. */
export function realmRumors(realm: string): Rumor[] {
  const v = visitOf(realm);
  return v ? v.inn.rumors.map((text, i) => ({ id: `realm:${realm}:${i}`, text })) : [];
}

export function nextRumor(settlementId: string): Rumor | null {
  const heard = new Set(GameState.rumorsHeard);
  // abroad, the innkeeper talks about where you ARE — that is what you walked all this way for
  const node = NODES.find(n => n.id === settlementId);
  if (node?.kind === 'foreign') {
    // a country only has one story to tell: hear it in Kiev and Novgorod will not sell it to you again
    const told = new Set(GameState.rumorsHeard.map(k => k.slice(k.indexOf(':') + 1)));
    const own = realmRumors(node.territory).filter(r => !told.has(r.id));
    return own.length ? own[0] : null;
  }
  const pool = currentRumors().filter(r => !heard.has(`${settlementId}:${r.id}`));
  if (!pool.length) return null;
  // spread them out: each settlement starts at a different point in the list
  const offset = NODES.findIndex(n => n.id === settlementId);
  return pool[(Math.max(0, offset) * 2) % pool.length];
}
