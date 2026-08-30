// Portraits.ts — a face for each of the fifteen starts, drawn in code like everything else. A bust,
// not a figure: shoulders, a head, and the one piece of headgear that says at a glance which country
// this person comes from. The silhouette does the work — a crest, a horned helm, a fur cap and a nemes
// are all readable at thumbnail size, which is how they are actually seen on the select screen.
import Phaser from 'phaser';

export type Headgear = 'crest' | 'kabuto' | 'fur' | 'turban' | 'nemes' | 'horned' | 'feather'
  | 'hoplite' | 'lamellar' | 'hood' | 'circlet';

export interface PortraitOpts {
  headgear: Headgear;
  /** The cloth of the country. */
  tint: number;
  /** Its metal or its trim — the second colour the eye picks up. */
  accent: number;
  /** What is slung behind the shoulder. */
  arm: 'sword' | 'bow' | 'spear' | 'axe' | 'club';
  beard?: boolean;
}

const SKIN = 0xdcae86;
const dark = (c: number, k = 0.5) => Phaser.Display.Color.ValueToColor(c).darken(Math.round(k * 45)).color;
const lite = (c: number, k = 0.5) => Phaser.Display.Color.ValueToColor(c).lighten(Math.round(k * 40)).color;

/** Draw one portrait into a texture. Size is the square side; everything is laid out from it. */
export function portrait(scene: Phaser.Scene, key: string, o: PortraitOpts, size = 220) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = size / 2;
  const R = size * 0.46;

  // the plate behind: a worn disc of the country's own colour
  g.fillStyle(dark(o.accent, 0.75), 1).fillCircle(c, c, R);
  g.fillStyle(o.accent, 0.55).fillCircle(c, c, R - size * 0.018);
  g.fillStyle(0x000000, 0.10).fillEllipse(c, c + R * 0.42, R * 1.7, R * 0.9);

  // what is slung behind the shoulder, before the body goes over it
  const ax = c + size * 0.20, ay = c - size * 0.04;
  g.lineStyle(size * 0.035, dark(0x6b5030, 0.6), 1);
  if (o.arm === 'bow') {
    g.beginPath();
    g.arc(ax + size * 0.02, ay + size * 0.10, size * 0.20, -Math.PI * 0.75, Math.PI * 0.15);
    g.strokePath();
  } else {
    g.lineBetween(ax - size * 0.10, ay + size * 0.30, ax + size * 0.10, ay - size * 0.22);
    g.fillStyle(o.arm === 'club' ? 0x3b3b46 : lite(0xb9c0cc, 0.3), 1);
    if (o.arm === 'axe') g.fillTriangle(ax + size * 0.10, ay - size * 0.22, ax + size * 0.02, ay - size * 0.06, ax + size * 0.19, ay - size * 0.07);
    else if (o.arm === 'spear') g.fillTriangle(ax + size * 0.10, ay - size * 0.28, ax + size * 0.055, ay - size * 0.16, ax + size * 0.145, ay - size * 0.16);
    else if (o.arm === 'club') g.fillRect(ax + size * 0.05, ay - size * 0.26, size * 0.10, size * 0.14);
    else g.fillRect(ax + size * 0.075, ay - size * 0.27, size * 0.05, size * 0.13);
  }

  // shoulders
  const sy = c + size * 0.20;
  g.fillStyle(dark(o.tint, 0.5), 1).fillEllipse(c, sy + size * 0.10, size * 0.62, size * 0.40);
  g.fillStyle(o.tint, 1).fillEllipse(c, sy + size * 0.12, size * 0.56, size * 0.36);
  g.fillStyle(lite(o.tint, 0.6), 0.28).fillEllipse(c - size * 0.12, sy + size * 0.06, size * 0.20, size * 0.12);
  // a clasp or a trim at the throat
  g.fillStyle(o.accent, 1).fillCircle(c, sy + size * 0.02, size * 0.035);

  // neck and head
  const hy = c - size * 0.06, hr = size * 0.145;
  g.fillStyle(dark(SKIN, 0.4), 1).fillRect(c - size * 0.05, hy, size * 0.10, size * 0.20);
  g.fillStyle(SKIN, 1).fillCircle(c, hy, hr);
  g.fillStyle(dark(SKIN, 0.35), 0.45).fillEllipse(c + hr * 0.45, hy + hr * 0.12, hr * 0.9, hr * 1.4);
  // eyes: two marks, all a face at this size needs
  g.fillStyle(0x2b2118, 1);
  g.fillRect(c - hr * 0.46, hy - hr * 0.06, hr * 0.22, hr * 0.16);
  g.fillRect(c + hr * 0.24, hy - hr * 0.06, hr * 0.22, hr * 0.16);
  if (o.beard) {
    g.fillStyle(dark(0x4a3a28, 0.3), 1);
    g.fillEllipse(c, hy + hr * 0.72, hr * 1.5, hr * 1.0);
    g.fillStyle(SKIN, 1).fillEllipse(c, hy + hr * 0.34, hr * 1.1, hr * 0.5);
  }

  head(g, o, c, hy, hr);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** The one piece that names the country. */
function head(g: Phaser.GameObjects.Graphics, o: PortraitOpts, c: number, hy: number, hr: number) {
  const steel = lite(0xa8b0bd, 0.2), steelDark = dark(0xa8b0bd, 0.5);
  switch (o.headgear) {
    case 'crest':                       // Rome: a transverse crest across a bowl helm
      g.fillStyle(steelDark, 1).fillCircle(c, hy - hr * 0.14, hr * 1.12);
      g.fillStyle(steel, 1).fillCircle(c, hy - hr * 0.18, hr * 1.05);
      g.fillStyle(SKIN, 1).fillEllipse(c, hy + hr * 0.28, hr * 1.3, hr * 1.0);
      g.fillStyle(o.accent, 1).fillEllipse(c, hy - hr * 1.35, hr * 1.9, hr * 0.42);
      g.fillStyle(dark(o.accent, 0.5), 1).fillEllipse(c, hy - hr * 1.2, hr * 1.9, hr * 0.2);
      break;
    case 'hoplite':                     // Greece: a Corinthian helm, the face inside the bronze
      g.fillStyle(dark(o.accent, 0.6), 1).fillCircle(c, hy - hr * 0.1, hr * 1.2);
      g.fillStyle(o.accent, 1).fillCircle(c, hy - hr * 0.14, hr * 1.12);
      g.fillStyle(0x2b2118, 1).fillRect(c - hr * 0.62, hy - hr * 0.16, hr * 0.34, hr * 0.34);
      g.fillStyle(0x2b2118, 1).fillRect(c + hr * 0.28, hy - hr * 0.16, hr * 0.34, hr * 0.34);
      g.fillStyle(0x2b2118, 1).fillRect(c - hr * 0.1, hy + hr * 0.1, hr * 0.2, hr * 1.0);
      g.fillStyle(dark(o.tint, 0.3), 1).fillEllipse(c, hy - hr * 1.5, hr * 0.5, hr * 0.9);
      break;
    case 'kabuto':                      // Japan: a wide neck-guard and a crescent at the brow
      g.fillStyle(steelDark, 1).fillEllipse(c, hy + hr * 0.1, hr * 2.5, hr * 1.5);
      g.fillStyle(dark(o.tint, 0.4), 1).fillCircle(c, hy - hr * 0.2, hr * 1.1);
      g.fillStyle(SKIN, 1).fillEllipse(c, hy + hr * 0.3, hr * 1.25, hr * 0.95);
      g.fillStyle(o.accent, 1);
      g.beginPath();
      g.arc(c, hy - hr * 0.55, hr * 1.15, Math.PI * 1.15, Math.PI * 1.85);
      g.lineTo(c, hy - hr * 0.9);
      g.fillPath();
      break;
    case 'fur':                         // the steppe and the north: a fur cap with earflaps
      g.fillStyle(dark(0x6b4a2b, 0.4), 1).fillEllipse(c - hr * 0.95, hy + hr * 0.3, hr * 0.55, hr * 1.0);
      g.fillStyle(dark(0x6b4a2b, 0.4), 1).fillEllipse(c + hr * 0.95, hy + hr * 0.3, hr * 0.55, hr * 1.0);
      g.fillStyle(0x7c5a35, 1).fillEllipse(c, hy - hr * 0.55, hr * 2.0, hr * 1.1);
      g.fillStyle(o.accent, 1).fillEllipse(c, hy - hr * 1.05, hr * 0.9, hr * 0.5);
      break;
    case 'turban':                      // the wound cloth of the south and the east
      g.fillStyle(dark(o.tint, 0.35), 1).fillEllipse(c, hy - hr * 0.62, hr * 2.1, hr * 1.25);
      g.fillStyle(lite(o.tint, 0.45), 1).fillEllipse(c, hy - hr * 0.78, hr * 1.85, hr * 0.85);
      g.fillStyle(dark(o.tint, 0.2), 1).fillEllipse(c, hy - hr * 0.4, hr * 2.0, hr * 0.45);
      g.fillStyle(o.accent, 1).fillCircle(c, hy - hr * 1.1, hr * 0.24);
      break;
    case 'nemes':                       // Egypt and Kush: the striped headcloth falling to the shoulder
      g.fillStyle(dark(o.accent, 0.5), 1).fillEllipse(c, hy + hr * 0.2, hr * 2.4, hr * 1.9);
      g.fillStyle(o.accent, 1).fillEllipse(c, hy - hr * 0.2, hr * 2.2, hr * 1.5);
      g.fillStyle(dark(o.tint, 0.1), 1);
      for (let i = -2; i <= 2; i++) g.fillRect(c + i * hr * 0.42 - hr * 0.08, hy - hr * 1.4, hr * 0.16, hr * 1.1);
      g.fillStyle(SKIN, 1).fillEllipse(c, hy + hr * 0.15, hr * 1.35, hr * 1.15);
      break;
    case 'horned':                      // the north: a nasal helm with two blunt horns
      g.fillStyle(steelDark, 1).fillCircle(c, hy - hr * 0.16, hr * 1.14);
      g.fillStyle(steel, 1).fillCircle(c, hy - hr * 0.2, hr * 1.06);
      g.fillStyle(SKIN, 1).fillEllipse(c, hy + hr * 0.3, hr * 1.3, hr * 0.95);
      g.fillStyle(steel, 1).fillRect(c - hr * 0.1, hy - hr * 0.5, hr * 0.2, hr * 0.95);
      g.fillStyle(0xe6dcc4, 1);
      g.fillTriangle(c - hr * 0.95, hy - hr * 0.75, c - hr * 1.75, hy - hr * 1.5, c - hr * 0.75, hy - hr * 1.15);
      g.fillTriangle(c + hr * 0.95, hy - hr * 0.75, c + hr * 1.75, hy - hr * 1.5, c + hr * 0.75, hy - hr * 1.15);
      break;
    case 'feather':                     // the far side of the ocean: a worked headdress
      g.fillStyle(dark(o.accent, 0.4), 1);
      for (let i = -3; i <= 3; i++) {
        g.fillTriangle(c + i * hr * 0.34, hy - hr * 0.9, c + i * hr * 0.5 - hr * 0.16, hy - hr * 2.3, c + i * hr * 0.5 + hr * 0.16, hy - hr * 2.3);
      }
      g.fillStyle(o.accent, 1);
      for (let i = -2; i <= 2; i++) {
        g.fillTriangle(c + i * hr * 0.36, hy - hr * 0.9, c + i * hr * 0.5 - hr * 0.13, hy - hr * 2.0, c + i * hr * 0.5 + hr * 0.13, hy - hr * 2.0);
      }
      g.fillStyle(dark(o.tint, 0.3), 1).fillEllipse(c, hy - hr * 0.75, hr * 2.0, hr * 0.55);
      break;
    case 'lamellar':                    // the Middle Kingdom: a laced helm with a spike
      g.fillStyle(steelDark, 1).fillCircle(c, hy - hr * 0.18, hr * 1.12);
      g.fillStyle(o.tint, 1).fillCircle(c, hy - hr * 0.22, hr * 1.04);
      g.fillStyle(dark(o.tint, 0.4), 1);
      for (let i = -2; i <= 2; i++) g.fillRect(c + i * hr * 0.4 - hr * 0.03, hy - hr * 1.2, hr * 0.06, hr * 0.9);
      g.fillStyle(SKIN, 1).fillEllipse(c, hy + hr * 0.3, hr * 1.3, hr * 0.95);
      g.fillStyle(o.accent, 1).fillTriangle(c - hr * 0.12, hy - hr * 1.2, c + hr * 0.12, hy - hr * 1.2, c, hy - hr * 1.95);
      break;
    case 'circlet':                     // the mountains: a plain band and a heavy braid
      g.fillStyle(dark(0x3a2a1c, 0.3), 1).fillEllipse(c, hy - hr * 0.5, hr * 2.0, hr * 1.2);
      g.fillStyle(dark(0x3a2a1c, 0.3), 1).fillEllipse(c - hr * 1.0, hy + hr * 0.5, hr * 0.45, hr * 1.1);
      g.fillStyle(SKIN, 1).fillEllipse(c, hy + hr * 0.05, hr * 1.4, hr * 1.2);
      g.fillStyle(o.accent, 1).fillRect(c - hr * 1.05, hy - hr * 0.5, hr * 2.1, hr * 0.3);
      break;
    default:                            // a hood, and nothing to declare
      g.fillStyle(dark(o.tint, 0.45), 1).fillEllipse(c, hy - hr * 0.25, hr * 2.1, hr * 1.7);
      g.fillStyle(o.tint, 1).fillEllipse(c, hy - hr * 0.35, hr * 1.9, hr * 1.45);
      g.fillStyle(SKIN, 1).fillEllipse(c, hy + hr * 0.2, hr * 1.25, hr * 1.1);
      break;
  }
}
