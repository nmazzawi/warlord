// Realms.ts — which of the world's realms a warband can reach ON FOOT, and what a foreigner finds
// when he gets there. The empires are still far too strong to fight, but a capital or a great city
// will take a stranger's coin: their forge and their stables sell what THEY make, at a price that
// says plainly what they think of you, and their inn sells what they know. Their barracks will not
// take you at any price, and neither will their war.
//
// Everything else — Japan, the Norse jarldoms, the Aztecs, the Inca — is across water, and there are
// no ships yet.
import type { ForgeItem } from './Stock';
import type { HorseKind } from '../state/GameState';

export interface RealmVisit {
  id: string;
  /** Shown the first time you set foot in the realm. */
  enter: string;
  /** Why you cannot make war here. */
  warLocked: string;
  /** Why nobody here will take your coin to fight. */
  barracksLocked: string;
  forge: { items: ForgeItem[]; swordMaxTier: number; note: string };
  stables: { horses: HorseKind[]; note: string };
  inn: { name: string; rumors: string[] };
  /** What a foreigner pays. 1.8 is a trading empire that likes coin; 2.6 is one that resents you. */
  markup: number;
}

/** The name the meter uses when you are standing in a realm. Short enough for a phone's status bar. */
export const REALM_SHORT: Record<string, string> = {
  rome: 'ROME', greece: 'GREECE', rus: 'RUS', arabia: 'THE CALIPHATE', persia: 'PERSIA',
  egypt: 'EGYPT', kush: 'KUSH', india: 'INDIA', china: 'CHINA',
  mongolia: 'STEPPE', homeland: '', steppe: 'STEPPE',
};

/** Filled below. A realm with an entry here can be walked to; everything else needs a ship. */
export const REALM_VISITS: Record<string, RealmVisit> = {};

/** The realms whose gates are open to a foreigner on foot. */
export function openRealms() { return Object.keys(REALM_VISITS); }
export function visitOf(realm: string): RealmVisit | null { return REALM_VISITS[realm] ?? null; }
export function reachOf(realm: string): 'land' | 'sea' { return REALM_VISITS[realm] ? 'land' : 'sea'; }
