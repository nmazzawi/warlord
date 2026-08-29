// geo.ts — where a real place on Earth lands on the chart.
// The chart is a Mercator world (the projection every "that's Earth" map uses: coastlines keep their
// true shape, so the Italian boot looks like a boot). Everything on the chart — coastlines, empires,
// settlements, your own villages — is authored as real longitude/latitude and projected once by ll().
// The chart is deliberately much bigger in world units than the screen: you zoom from the whole globe
// down to the roads of one small borderland, and travel times are fixed in days, not measured in pixels.

export type Pt = [number, number];

/** Chart size in world units, and the resolution the decorative background is baked at. */
export const CHART = { w: 5400, h: 3240, texScale: 0.32 };

/** The window on Earth the chart shows, and the rectangle it is drawn into (a frame margin all round). */
export const PROJ = { lon0: -125, lon1: 145, lat0: 72, lat1: -49, x0: 70, x1: 5330, y0: 70, y1: 3170 };

const rad = Math.PI / 180;
/** Mercator's stretch: latitude spacing grows as you go north, which is what keeps shapes true. */
export function mercY(lat: number) {
  const clamped = Math.max(-84, Math.min(84, lat));
  return Math.log(Math.tan(Math.PI / 4 + (clamped * rad) / 2));
}
const MY0 = mercY(PROJ.lat0);
const KY = (PROJ.y1 - PROJ.y0) / (MY0 - mercY(PROJ.lat1));
const KX = (PROJ.x1 - PROJ.x0) / (PROJ.lon1 - PROJ.lon0);

/** Longitude/latitude -> chart coordinates. West and south are negative. */
export function ll(lon: number, lat: number): Pt {
  return [PROJ.x0 + (lon - PROJ.lon0) * KX, PROJ.y0 + (MY0 - mercY(lat)) * KY];
}
export function llx(lon: number) { return PROJ.x0 + (lon - PROJ.lon0) * KX; }
export function lly(lat: number) { return PROJ.y0 + (MY0 - mercY(lat)) * KY; }
