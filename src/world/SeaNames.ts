// SeaNames.ts — the waters, named the way a chart names them: faint italic caps, following the sea.
export interface SeaName { name: string; lon: number; lat: number; size?: number; tilt?: number; }

export const SEA_NAMES: SeaName[] = [
  { name: 'The Atlantic Ocean', lon: -40, lat: 32, size: 15, tilt: -12 },
  { name: 'The Great Western Sea', lon: -60, lat: -18, size: 14, tilt: 8 },
  { name: 'The Pacific', lon: -118, lat: 4, size: 14, tilt: -8 },
  { name: 'The Northern Ice', lon: 30, lat: 70, size: 12 },
  { name: 'The Middle Sea', lon: 17, lat: 35.4, size: 11, tilt: -3 },
  { name: 'The Black Sea', lon: 34.5, lat: 43.2, size: 8 },
  { name: 'The Caspian', lon: 51, lat: 41.5, size: 8, tilt: -70 },
  { name: 'The Baltic', lon: 19.5, lat: 57.5, size: 8, tilt: -55 },
  { name: 'The North Sea', lon: 3, lat: 56.5, size: 8 },
  { name: 'The Red Sea', lon: 37.5, lat: 21, size: 8, tilt: -52 },
  { name: 'The Persian Gulf', lon: 51.5, lat: 27, size: 7, tilt: -35 },
  { name: 'The Arabian Sea', lon: 63, lat: 14, size: 12 },
  { name: 'The Bay of Bengal', lon: 88, lat: 13, size: 11 },
  { name: 'The Eastern Ocean', lon: 138, lat: 22, size: 13, tilt: -10 },
  { name: 'The South Sea', lon: 113, lat: 12, size: 10 },
  { name: 'The Sea of Japan', lon: 134, lat: 40, size: 8, tilt: -40 },
  { name: 'The Great Southern Ocean', lon: 60, lat: -42, size: 14, tilt: 4 },
  { name: 'The Indian Ocean', lon: 76, lat: -20, size: 14, tilt: -6 },
  { name: 'The Coral Sea', lon: 143, lat: -18, size: 9 },
  { name: 'The Gulf of Mexico', lon: -90, lat: 24.5, size: 8 },
  { name: 'The Caribbean', lon: -74, lat: 14.5, size: 9 },
];
