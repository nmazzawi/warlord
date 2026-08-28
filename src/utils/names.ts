// names.ts — names for recruits so losing one stings a little.
const POOL = [
  'Bran', 'Odo', 'Wulf', 'Tam', 'Rurik', 'Gorm', 'Sten', 'Ivo', 'Kell', 'Ulf', 'Hakon', 'Bjorn',
  'Aldo', 'Cato', 'Dag', 'Eryk', 'Finn', 'Geir', 'Hrolf', 'Jarl', 'Knut', 'Leif', 'Magn', 'Njal',
  'Orm', 'Pell', 'Ragn', 'Sigurd', 'Toke', 'Vali', 'Yngve', 'Askel', 'Brynj', 'Dyre', 'Einar', 'Frode',
];
let cursor = 0;
export function nextName(): string {
  const n = POOL[cursor % POOL.length];
  cursor++;
  return n;
}
