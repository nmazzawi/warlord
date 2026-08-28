// names.ts — names for recruits so losing one stings a little.
const POOL = [
  'Bran', 'Odo', 'Wulf', 'Tam', 'Rurik', 'Gorm', 'Sten', 'Ivo', 'Kell', 'Ulf', 'Hakon', 'Bjorn',
  'Aldo', 'Cato', 'Dag', 'Eryk', 'Finn', 'Geir', 'Hrolf', 'Jarl', 'Knut', 'Leif', 'Magn', 'Njal',
  'Orm', 'Pell', 'Ragn', 'Sigurd', 'Toke', 'Vali', 'Yngve', 'Askel', 'Brynj', 'Dyre', 'Einar', 'Frode',
];
export function nameAt(i: number): string {
  const base = POOL[i % POOL.length];
  const round = Math.floor(i / POOL.length);
  return round === 0 ? base : `${base} ${'I'.repeat(Math.min(round + 1, 3))}`;
}
