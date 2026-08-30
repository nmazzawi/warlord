// Coast.ts — which settlements stand on water. A harbour is flavour today and a fleet later, so the
// only question worth answering now is whether you can see the sea from here: a place is coastal if
// the terrain a short way off it is not land.
import { isLand } from './Terrain';
import { nodeById } from './WorldMap';

const cache = new Map<string, boolean>();

export function isCoastal(id: string) {
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  let coastal = false;
  try {
    const n = nodeById(id);
    // eight looks outward, a little further than a settlement's own ground
    for (let i = 0; i < 8 && !coastal; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (!isLand(n.x + Math.cos(a) * 46, n.y + Math.sin(a) * 46)) coastal = true;
    }
  } catch { coastal = false; }
  cache.set(id, coastal);
  return coastal;
}
