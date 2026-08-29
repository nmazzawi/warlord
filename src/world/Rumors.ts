// Rumors.ts — what the inn sells: one true thing about the world, drawn from the live game state.
import { INFAMY, SIEGE } from '../config/balance';
import { GameState } from '../state/GameState';
import { LAYOUTS } from './Layouts';
import { NODES } from './WorldMap';

export interface Rumor { id: string; text: string; }

/** Every rumor that is true right now. */
export function currentRumors(): Rumor[] {
  const out: Rumor[] = [];
  const tier = GameState.infamyTier;
  const chance = Math.round(GameState.patrolChance * 100);
  out.push({ id: 'patrols', text: chance > 0
    ? `Riders are out on every road looking for someone with your name — about ${chance} in 100 stretches, never twice within ${INFAMY.patrolCooldownDays} days. Raider-tier patrols bring a captain.`
    : `The roads are quiet. Patrols only ride once a name is worth a bounty — at infamy ${INFAMY.tiers[1].min} they start looking (1 stretch in 4).` });
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
  out.push({ id: 'wages', text: `Men march for ${2} gold a day each. Miss a day and they grumble; miss two and they walk. A garrison costs nothing to keep.` });
  return out;
}

/** The next rumor this settlement will sell (each place tells you something you haven't heard). */
export function nextRumor(settlementId: string): Rumor | null {
  const heard = new Set(GameState.rumorsHeard);
  const pool = currentRumors().filter(r => !heard.has(`${settlementId}:${r.id}`));
  if (!pool.length) return null;
  // spread them out: each settlement starts at a different point in the list
  const offset = NODES.findIndex(n => n.id === settlementId);
  return pool[(Math.max(0, offset) * 2) % pool.length];
}
