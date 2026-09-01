// Civs.ts — the fifteen ways to begin. A start is not a difficulty setting: it decides which country
// on the map is YOURS (its gates open to you, its prices normal, its barracks yours, and its opinion
// of you is the meter in your status bar), where your camp stands, what your warlord is holding, and
// which three of that culture's own men ride out with you on the first morning.
//
// The deep per-culture rulesets — Horde momentum, Doctrine, and the rest — are a later milestone. What
// separates a start today is its roster, its kit, its home ground, its hero's lean, and who they were.
import { ll, type Pt } from './geo';
import { FOREIGN, FRINGE, frontier } from './WorldMap';
import { isLand, nearestLand, route } from './Terrain';
import type { WeaponKind } from '../state/GameState';

export type UnitRole = 'line' | 'elite' | 'specialist';
/**
 * The one thing a unit visibly DOES. Every signature its author wrote maps onto one of these, so a
 * player learns nine behaviours across fifteen cultures rather than fifty-eight rules.
 *   javelin    throws once before it closes
 *   frenzy     hits harder the more it is bleeding, and never gives ground
 *   backstab   opens a man who is fighting somebody else
 *   inspire    everyone near it fights harder while it stands
 *   duel       goes for the strongest man on the field, not the nearest
 *   trample    the blow catches whoever is standing beside its target
 *   shieldwall turns most of a blow while its own is still coming
 *   volley     keeps its distance and shoots
 *   lance      rides, and rides fast
 */
export type UnitAbility = 'none' | 'javelin' | 'frenzy' | 'backstab' | 'inspire' | 'duel' | 'trample' | 'shieldwall' | 'volley' | 'lance';
export type StatLean = 'attack' | 'defense' | 'speed';

/** One recruitable kind of man, on the five-stat framework. */
export interface UnitDef {
  id: string;
  name: string;
  role: UnitRole;
  ability: UnitAbility;
  /** The five: what a player compares in the barracks. */
  attack: number; defense: number; speed: number; evasion: number; range: number;
  hp: number;
  cost: number;      // to recruit, once
  wage: number;      // and every day after
  /** The one visible thing it does that a cheap man does not. */
  signature: string;
  desc: string;
}

export interface CivDef {
  id: string;
  /** The realm this start owns, as a territory key ('homeland' for the Borderland outlaw). */
  home: string;
  name: string;          // the civilization, as the select screen names it
  heroName: string;
  heroTitle: string;
  backstory: string;
  playstyle: string;
  weapon: WeaponKind;
  /** A painter's note for the portrait, and the colours it is drawn in. */
  dress: string;
  tint: number;
  accent: number;
  lean: StatLean;
  /** Where the camp stands. Resolved on demand by campPoint(id) — never read this at import time. */
  camp?: Pt;
  campName: string;
  troops: UnitDef[];
}

/** A fallback, if a realm somehow has no settlements to stand near. */
export const CAMP_AT: Record<string, [number, number]> = {
  outlaw: [61.5, 51.8], rome: [12.9, 43.4], greece: [22.9, 38.6], japan: [136.2, 35.4],
  china: [110.8, 33.6], mongolia: [104.5, 47.2], rus: [32.4, 52.6], arabia: [42.6, 32.1],
  viking: [10.4, 59.6], persia: [53.8, 33.4], india: [78.4, 23.6], egypt: [31.4, 27.2],
  kush: [33.4, 16.8], aztecs: [-99.6, 18.6], inca: [-73.4, -14.2],
};

/** The chart position the Bandit Camp has always had. The Borderland start must be the game exactly as
 *  it was, down to how far Ashford is, so it keeps its own coordinates instead of a projected guess. */
const OUTLAW_CAMP: Pt = [3590, 1005];

/** Filled by tools/build-civs.mjs from data/civs/starts.json. */
export const CIVS: Record<string, CivDef> = {
  outlaw: {
    id: "outlaw", home: "homeland", name: "The Borderland",
    heroName: "Ilya Bezrodny", heroTitle: "Runaway levy with a price on his head",
    backstory: "He was born in a hamlet that Rus taxed and the steppe raided, and neither one ever came while it was burning. A prince's man walked him east to stand in a stockade nobody intended to hold, and when it went the prince's men took the horses and left the levy in the ditch. He came back nine days later to ash, and to a debt written in his own name for a horse he had never once sat on. He hanged the clerk who wrote it, in the clerk's own doorway, with the ledger open on the step. Everything he owns he took off a dead man, and every man in his camp belonged to somebody else first.",
    playstyle: "Nothing is given. Hit first, hit hard, and take the rest off the dead.",
    weapon: "sword", dress: "Bare head, hair hacked short, Rus mail over sheepskin with rust through one shoulder, grey wool, mud-brown leather, a taken red sash.",
    tint: 0x6b5030, accent: 0x9a7a44, lean: "attack",
    campName: "Bandit Camp",
    troops: [
      { id: "outlaw_brigand", name: "Brigand", role: "line", ability: "none",
        attack: 8, defense: 2, speed: 150, evasion: 2, range: 0,
        hp: 50, cost: 32, wage: 2,
        signature: "Piles onto whoever is already bleeding, three knives on the one man.",
        desc: "Runaways and boys off burned farms, a knife apiece and no oath to anyone. Cheap, and there are always more." },
      { id: "outlaw_poacher", name: "Poacher", role: "specialist", ability: "volley",
        attack: 9, defense: 2, speed: 195, evasion: 14, range: 210,
        hp: 56, cost: 88, wage: 6,
        signature: "Puts his first arrow into the horse, never into the man on it.",
        desc: "He shot deer in another man's wood until they took his brother for it, and he has not wasted an arrow since." },
      { id: "outlaw_horsethief", name: "Horse-thief", role: "specialist", ability: "lance",
        attack: 10, defense: 2, speed: 195, evasion: 14, range: 0,
        hp: 62, cost: 88, wage: 6,
        signature: "Pulls a rider down and comes back through the fight on that man's horse.",
        desc: "He has stolen horses off both sides of this border and rides better than the men he took them from." },
      { id: "outlaw_brokendruzhinnik", name: "Broken Druzhinnik", role: "elite", ability: "backstab",
        attack: 16, defense: 9, speed: 130, evasion: 14, range: 0,
        hp: 74, cost: 85, wage: 5,
        signature: "Takes the shield off the first man he kills and fights the rest behind it.",
        desc: "He wore a prince's mail on the Dnieper and still does. Nobody here asks how he came to keep it." },
    ],
  },
  rome: {
    id: "rome", home: "rome", name: "Rome",
    heroName: "Gaius Fulvius Rufus", heroTitle: "First spear of the Twelfth, cashiered",
    backstory: "He held the north gate of the marching camp above Aquincum one night, rank relieving rank on the horn, and the Twelfth lost its eagle in the dark anyway. Rome tried its centurions and left the legate his command. They broke Rufus's vine staff over his knee in front of the standards, and he walked out past men he had drilled for nineteen years, and none of them spoke. He still carries the century's burial money, copper paid in by men whose bones are in that ditch, owed to widows in three provinces. He drills the warband the way he drilled them: two lines, one horn, and the front rank steps back before it tires.",
    playstyle: "Advance in order, hold what you take, and let them break on the shields.",
    weapon: "sword", dress: "Iron helmet with cheek plates and a transverse crest, segmented plate over a red tunic, short red cloak, tall rectangular shield.",
    tint: 0xa8412f, accent: 0xd8b45a, lean: "defense",
    campName: "The Old Villa",
    troops: [
      { id: "rome_auxiliary", name: "Auxiliary", role: "line", ability: "none",
        attack: 8, defense: 2, speed: 150, evasion: 2, range: 0,
        hp: 50, cost: 32, wage: 2,
        signature: "The tired front rank steps back through the fresh one and comes on again.",
        desc: "Provincial spears out of the frontier forts, drilled to Roman time. Not citizens. They stand where they are put." },
      { id: "rome_legionary", name: "Legionary", role: "elite", ability: "shieldwall",
        attack: 12, defense: 9, speed: 130, evasion: 4, range: 210,
        hp: 74, cost: 85, wage: 5,
        signature: "Locks the tall shields overhead into a roof, and arrows rattle off it.",
        desc: "Twenty years in segmented plate. The shield takes the blow and the short sword goes in low, under the guard." },
      { id: "rome_velite", name: "Velite", role: "specialist", ability: "javelin",
        attack: 13, defense: 5, speed: 168, evasion: 24, range: 130,
        hp: 48, cost: 62, wage: 4,
        signature: "Throws a javelin that bends where it sticks, and the shield is thrown away.",
        desc: "Young, cheap, a wolfskin over the helmet. Out ahead, hands empty, and back behind the line before the charge lands." },
      { id: "rome_centurion", name: "Centurion", role: "specialist", ability: "inspire",
        attack: 10, defense: 4, speed: 168, evasion: 14, range: 0,
        hp: 54, cost: 82, wage: 5,
        signature: "The men either side of him close up and hit harder while he is standing.",
        desc: "Vine staff, crest worn across the helmet. He is paid to be the last man on his feet in his own line." },
    ],
  },
  greece: {
    id: "greece", home: "greece", name: "Greece",
    heroName: "Kleodemos of Acharnai", heroTitle: "Taxiarch of Acharnai, ostracised",
    backstory: "Kleodemos led the Acharnian file at Delion and brought two hundred of three hundred home, which the city judged too few. That winter the assembly held the vote with potsherds, and enough men scratched his name on them to send him out for ten years. His own brother-in-law wrote one. He sold the farm under Parnes to a neighbour who would not meet his eye, bought spears with the silver, and took the north road with nobody to see him off. He still puts his best men on the right and worries about the left, because he has watched a line come apart from the open end.",
    playstyle: "A hedge of points at the front. Guard the open side and nothing gets through.",
    weapon: "sword", dress: "Bronze helmet, horsehair crest pushed back off the face, bronze breastplate over a red tunic, greaves, round shield, no cloak.",
    tint: 0x3f6f9a, accent: 0xc9a049, lean: "defense",
    campName: "The Ruined Sanctuary",
    troops: [
      { id: "greece_hoplite", name: "Hoplite", role: "line", ability: "shieldwall",
        attack: 8, defense: 5, speed: 140, evasion: 2, range: 0,
        hp: 50, cost: 32, wage: 2,
        signature: "His shield covers the man on his left; take that man and he folds.",
        desc: "A farmer with his own shield and his father's spear. There are always more of them in the next village." },
      { id: "greece_epilektos", name: "Epilektos", role: "elite", ability: "shieldwall",
        attack: 13, defense: 9, speed: 130, evasion: 4, range: 0,
        hp: 80, cost: 85, wage: 5,
        signature: "Spear held overarm, striking down past the shield rim at throat and thigh.",
        desc: "Picked men kept under arms all year at the city's cost, and priced accordingly. They stand in the first rank." },
      { id: "greece_sphendonetes", name: "Sphendonetes", role: "specialist", ability: "javelin",
        attack: 10, defense: 5, speed: 168, evasion: 14, range: 130,
        hp: 54, cost: 62, wage: 4,
        signature: "Lead shot puts a man on his back with his shield still up in front of him.",
        desc: "Rhodian boys who have thrown at goats since they could stand. The shot is moulded with a curse cut into it." },
    ],
  },
  japan: {
    id: "japan", home: "japan", name: "Japan",
    heroName: "Miura Sadatsune", heroTitle: "Masterless man of Sagami",
    backstory: "He was second sword to the lord of Sagami and held the west end of the bridge at Uji while the planks came up behind him. His lord crossed. The arrow that killed the lord came an hour later out of the dark, from a man nobody saw climb the bank. Sadatsune carried the head home, buried it, and was told by the heir that one house does not keep two lords' worth of men. He has one trade left that pays inside a season: a few men trained from childhood, a name shouted at whoever holds the gate, and a wall gone over at night.",
    playstyle: "Few men, chosen ground. Take the man who commands and the rest gives way.",
    weapon: "sword", dress: "Black lacquered plates laced with red cord, iron-horned helmet, white silk sleeves, indigo leggings, no cloak, one long sword at the hip.",
    tint: 0x2f3a4a, accent: 0xc4443a, lean: "attack",
    campName: "The Mountain Hall",
    troops: [
      { id: "japan_ashigaru", name: "Ashigaru", role: "line", ability: "none",
        attack: 8, defense: 2, speed: 150, evasion: 2, range: 0,
        hp: 50, cost: 32, wage: 2,
        signature: "The whole rank beats its spears down on one shout, and guards drop under it.",
        desc: "Farmers off the rice fields, handed a spear longer than three men and a month to learn one motion with it." },
      { id: "japan_samurai", name: "Samurai", role: "elite", ability: "duel",
        attack: 13, defense: 6, speed: 140, evasion: 4, range: 0,
        hp: 80, cost: 85, wage: 5,
        signature: "Singles out whoever leads the enemy and fights him alone until one falls.",
        desc: "Trained from childhood, and dear for that reason. One of them is worth the four men you did not hire." },
      { id: "japan_ninja", name: "Ninja", role: "specialist", ability: "backstab",
        attack: 13, defense: 5, speed: 158, evasion: 24, range: 0,
        hp: 48, cost: 62, wage: 4,
        signature: "Is behind a man before he turns, and the blow from behind is the one that kills.",
        desc: "No house owns him and he takes silver, not rice. Over the wall and behind the line before the shout goes up." },
      { id: "japan_sohei", name: "Sohei", role: "specialist", ability: "none",
        attack: 10, defense: 2, speed: 168, evasion: 14, range: 0,
        hp: 54, cost: 62, wage: 4,
        signature: "One sweep of the naginata takes the man beside the one it was aimed at.",
        desc: "Temple men out of Nara who answer to no lord. They came down the mountain armed and never went back up." },
    ],
  },
  china: {
    id: "china", home: "china", name: "China",
    heroName: "Pei Zhao", heroTitle: "Crossbow captain off the register",
    backstory: "Pei Zhao held the north road above Taiyuan for two years with three hundred crossbows and one drum, and never gave up a mile of it. Then the arsenal counted his bolts and found the tally nine hundred short, which is a hanging matter for a clerk and a ruin for a captain. He carried his rolls to the prefecture in a box and was heard for as long as it takes to drink tea. A brush went through his name, and the three hundred were written over to another man before he was out of the courtyard. Forty came off the register with him and walk behind him still, rank behind rank, stepping when he beats.",
    playstyle: "Everything moves on the drum, and nothing closes while the bolts are still coming.",
    weapon: "composite", dress: "Dark iron lamellar coat, crimson sash, black lacquered helmet with a low crest, no cloak, a saddle bow across his back.",
    tint: 0x8a2f3a, accent: 0xd6b45c, lean: "defense",
    campName: "The Abandoned Ward",
    troops: [
      { id: "china_fubing", name: "Fubing", role: "line", ability: "inspire",
        attack: 8, defense: 7, speed: 140, evasion: 2, range: 0,
        hp: 50, cost: 52, wage: 3,
        signature: "Steps and halts on the drum, and holds the mark it halted him on.",
        desc: "Called up off the household register and drilled between harvests. Cheap, plentiful, and they know the drum before they know you." },
      { id: "china_nushou", name: "Nushou", role: "specialist", ability: "shieldwall",
        attack: 9, defense: 5, speed: 158, evasion: 14, range: 210,
        hp: 48, cost: 62, wage: 4,
        signature: "Shoots by turns, rank after rank, so the bolts never stop while they span.",
        desc: "State bows, counted out and counted back. Spanned with the foot, loosed on the count, through shield and mail together." },
      { id: "china_gushou", name: "Gushou", role: "specialist", ability: "inspire",
        attack: 10, defense: 4, speed: 168, evasion: 14, range: 0,
        hp: 54, cost: 82, wage: 5,
        signature: "Beats until your scattered men walk back into rank and step as one.",
        desc: "A drum on his back and a magistrate's warrant in his sleeve. Men who will not hear you will hear him." },
      { id: "china_horsecutter", name: "Horse-Cutter", role: "elite", ability: "lance",
        attack: 13, defense: 6, speed: 195, evasion: 4, range: 0,
        hp: 88, cost: 111, wage: 7,
        signature: "Takes the horse first, so a charge that reaches you arrives on foot.",
        desc: "A blade as long as a man, held in both hands. Slow to swing, and nothing it lands on gets up again." },
    ],
  },
  mongolia: {
    id: "mongolia", home: "steppe", name: "Mongolia",
    heroName: "Nergui", heroTitle: "Day-guard rider of the Kherlen",
    backstory: "Nergui rode in the Khan's day-guard from the year she could first string a bow off the saddle, and her ten held the left at the Kherlen while the wings swung wide. When the Khan died in his tent the guard was divided among his sons the way a herd is divided, and she was counted into the share of a man whose brother she had watched leave a field. She would not go to him. She rode out on a night with no moon and nine of her ten came after her without being asked. Karakorum set her price at a hundred horses, and she has not once looked back at the road behind her.",
    playstyle: "Ride, shoot, ride away. Come back when they are strung out and finish them.",
    weapon: "composite", dress: "Fur-brimmed iron helm with a horsehair tassel, brown quilted deel over lamellar, sky-blue sash, no cloak, bowcase and quiver on one belt.",
    tint: 0x7a5a2f, accent: 0xbfa05a, lean: "speed",
    campName: "Your Camp",
    troops: [
      { id: "mongolia_stepperider", name: "Steppe Rider", role: "line", ability: "volley",
        attack: 7, defense: 2, speed: 195, evasion: 2, range: 210,
        hp: 52, cost: 58, wage: 4,
        signature: "Looses at a full gallop and never once slows to do it.",
        desc: "Boys off the grass who shot marmots before they shot men. Buy them by the dozen and never let them stand still." },
      { id: "mongolia_lancer", name: "Lancer", role: "specialist", ability: "backstab",
        attack: 12, defense: 5, speed: 185, evasion: 24, range: 210,
        hp: 50, cost: 88, wage: 6,
        signature: "Hooks a man out of the line with the lance and leaves the hole behind him.",
        desc: "Rides in once the arrows have loosened a line, and takes the shield-bearers out of it one at a time." },
      { id: "mongolia_kharuul", name: "Kharuul", role: "specialist", ability: "volley",
        attack: 9, defense: 2, speed: 195, evasion: 14, range: 210,
        hp: 56, cost: 88, wage: 6,
        signature: "Breaks and runs on purpose, then wheels and shoots whoever came after.",
        desc: "Outriders. They will look beaten while the enemy is still deciding whether to chase them." },
      { id: "mongolia_khansguard", name: "Khan's Guard", role: "elite", ability: "backstab",
        attack: 16, defense: 6, speed: 195, evasion: 14, range: 0,
        hp: 82, cost: 111, wage: 7,
        signature: "Puts himself between your warlord and whatever is coming at him.",
        desc: "The Khan's own, day-guard and night-guard, in lacquered lamellar. Dear as a horse herd and worth it." },
    ],
  },
  rus: {
    id: "rus", home: "rus", name: "Rus",
    heroName: "Ratibor Gorislavich", heroTitle: "Landless druzhinnik of Chernigov",
    backstory: "Ratibor swore to Prince Rostislav at Chernigov the year he could first hold a shield, and rode behind that banner for eleven more. At the Stugna the ford was in flood with the steppe on the far bank, and he went into the water in mail and came out of it carrying the prince's helmet and not the prince. Kiev gave the seat to a brother who had been three days' ride away, and gave Ratibor's village to a man who had stayed dry. Nobody ever accused him of anything. He hires now to whoever keeps a fire lit, and he still gets down off his horse to fight.",
    playstyle: "Let the road and the winter thin them, then take the rest with two hands on an axe.",
    weapon: "sword", dress: "Conical nasal helm with mail aventail, riveted mail shirt, red cloak at one shoulder, green and white kite shield, wolf fur at the collar.",
    tint: 0x3f6b4a, accent: 0xc0c8d8, lean: "defense",
    campName: "The River Fort",
    troops: [
      { id: "rus_voi", name: "Voi", role: "line", ability: "shieldwall",
        attack: 8, defense: 5, speed: 140, evasion: 2, range: 0,
        hp: 50, cost: 32, wage: 2,
        signature: "When the spear goes, he takes the axe off his belt and keeps coming.",
        desc: "The town levy, called out by the church bell. Spear, round shield, and an axe every one of them owns already." },
      { id: "rus_luchniki", name: "Luchniki", role: "specialist", ability: "volley",
        attack: 9, defense: 2, speed: 168, evasion: 14, range: 210,
        hp: 48, cost: 62, wage: 4,
        signature: "Shoots over its own front rank, so the men in front never open a gap.",
        desc: "Bowmen off the river forts. They shoot past the backs of their own all day and never ask the line to open." },
      { id: "rus_druzhinnik", name: "Druzhinnik", role: "elite", ability: "lance",
        attack: 13, defense: 6, speed: 195, evasion: 4, range: 0,
        hp: 88, cost: 111, wage: 7,
        signature: "Two hands on a long axe, and the blow comes down through helm and shoulder.",
        desc: "The prince's own, in mail to the knee. They get off their horses to fight and they are paid like it." },
    ],
  },
  arabia: {
    id: "arabia", home: "arabia", name: "The Caliphate",
    heroName: "Bakjur ibn Abdallah", heroTitle: "Ghulam of the Samarra guard",
    backstory: "Bought at eight from a Khazar slaver and raised in the Samarra barracks, he was given a bow before a sword and a dead man's name to answer to. Twenty years he stood in the guard's front rank, shooting over the locked shields, and never owned the horse he rode there. When the pay-chest came eleven months short the guard went into the palace, and he held the door for the man who had bought him; they hanged his brother off the Dijla bridge inside the week. He left Samarra with those eleven months still owed him and no way to collect. He hires to whoever has silver, having been weighed against it all his life.",
    playstyle: "Pay for better men than theirs, and put them straight through the middle.",
    weapon: "composite", dress: "Conical helm wound with black turban cloth, mail to the shoulders, sand-coloured coat, saffron sash, cased bow at the hip, no cloak.",
    tint: 0x2f6b6b, accent: 0xe0c46a, lean: "attack",
    campName: "The Dry Well",
    troops: [
      { id: "arabia_jundi", name: "Jundi", role: "line", ability: "shieldwall",
        attack: 8, defense: 5, speed: 140, evasion: 2, range: 0,
        hp: 50, cost: 32, wage: 2,
        signature: "Still fresh at the end of a long day, when the men opposite are blown.",
        desc: "Provincial levy off the district roll, spear and round shield, paid in silver every month whether he fights or not." },
      { id: "arabia_ghulam", name: "Ghulam", role: "elite", ability: "shieldwall",
        attack: 12, defense: 9, speed: 130, evasion: 4, range: 210,
        hp: 74, cost: 85, wage: 5,
        signature: "Shoots over the locked shields, then drops the bow and comes on sword first.",
        desc: "Bought as a boy and drilled since, sworn to whoever holds the pay-chest. The costliest man on any roll." },
      { id: "arabia_hajjana", name: "Hajjana", role: "specialist", ability: "lance",
        attack: 10, defense: 2, speed: 195, evasion: 14, range: 0,
        hp: 62, cost: 88, wage: 6,
        signature: "Horses smell them, shy off the line, and carry their own riders out of it.",
        desc: "Camel riders out of the deep desert. Put them in front of horse and the horse decides the matter for you." },
      { id: "arabia_saqqa", name: "Saqqa", role: "specialist", ability: "backstab",
        attack: 13, defense: 5, speed: 158, evasion: 24, range: 0,
        hp: 48, cost: 62, wage: 4,
        signature: "Goes down the line with the water skin, and men who were down get up.",
        desc: "Carries a whole well on his back and a knife for everything else. Keep him behind the shields." },
    ],
  },
  viking: {
    id: "viking", home: "viking", name: "The Norse",
    heroName: "Sigvard Hrafnsson", heroTitle: "Steersman of the lost Sea-Adder",
    backstory: "Sigvard steered the Sea-Adder nine summers and lost her on the Seine at night, on a chain the Franks had strung under the town where no one could see it. Forty men went into the water and twelve came out. The hull was not his. The man at Kaupang who owned her has three sons, a long memory, and a price in silver that Sigvard has never held in his hands at one time. He went to the nine days at Uppsala and found no jarl there wanting a steersman with no ship, so the twelve came away with him instead, and every one of them has stood in a wall on a strange beach before.",
    playstyle: "Come off the water and break them before they are formed. A beach at a time.",
    weapon: "sword", dress: "Iron helm with a nose bar, riveted mail over grey wool, madder-red sleeves, blue and white shield boards, no cloak, salt-stiff beard.",
    tint: 0x4a5a6b, accent: 0xb9c2cc, lean: "attack",
    campName: "The Boat Shed",
    troops: [
      { id: "viking_raider", name: "Raider", role: "line", ability: "none",
        attack: 8, defense: 2, speed: 150, evasion: 2, range: 0,
        hp: 50, cost: 32, wage: 2,
        signature: "Never stays with the man he has dropped; the axe is on the next one at once.",
        desc: "Second sons off the farms who go out every summer for silver. Cheap to take on, and never fewer than a crowd." },
      { id: "viking_huscarl", name: "Huscarl", role: "elite", ability: "shieldwall",
        attack: 13, defense: 9, speed: 130, evasion: 4, range: 0,
        hp: 80, cost: 85, wage: 5,
        signature: "Catches the blade in his shield board, twists it down, and kills the man.",
        desc: "A jarl's sworn hand, fed at his table all winter and armoured out of his hall. He costs what that is worth." },
      { id: "viking_berserker", name: "Berserker", role: "specialist", ability: "frenzy",
        attack: 14, defense: 6, speed: 158, evasion: 14, range: 0,
        hp: 64, cost: 82, wage: 5,
        signature: "Never routs, and swings harder the more of his own blood is on him.",
        desc: "He goes in without a shield. Put him where the line is about to give, and do not look for him after." },
      { id: "viking_skjaldmaer", name: "Skjaldmaer", role: "specialist", ability: "none",
        attack: 10, defense: 2, speed: 168, evasion: 14, range: 0,
        hp: 54, cost: 62, wage: 4,
        signature: "Steps inside the spear points, where long weapons swing past and the seax works.",
        desc: "Raised in the crush of a boat's deck. She wants a knife's length of room and nothing more." },
    ],
  },
  persia: {
    id: "persia", home: "persia", name: "Persia",
    heroName: "Vidarna", heroTitle: "Dead man of the ten thousand",
    backstory: "Vidarna stood in the front rank at the Choaspes with his wicker planted and the bows working over his shoulder, and a Saka axe took him under the helmet before the sun was high. The ranks closed over him, as they must, and the file behind stepped into his place before he had finished bleeding. He woke in a cart a week up the Royal Road. At the next muster a boy out of Gabae was answering to his name, because the roll holds ten thousand and never one more, and no clerk in the empire is paid to unwrite a man. He kept the bow, since the spear belonged to the King, and rides now with men nobody has counted.",
    playstyle: "Spears in front, bows behind them, and the line fills faster than they can empty it.",
    weapon: "composite", dress: "Soft felt tiara wound across the mouth, saffron sleeves over scale, violet cloak, gilded quiver at the hip.",
    tint: 0x6b3f7a, accent: 0xd8b45a, lean: "defense",
    campName: "The Way Station",
    troops: [
      { id: "persia_sparabara", name: "Sparabara", role: "line", ability: "backstab",
        attack: 10, defense: 5, speed: 140, evasion: 12, range: 210,
        hp: 38, cost: 32, wage: 2,
        signature: "Plants the wicker and stops there. Arrows stick in it and go no further.",
        desc: "The wall the rest of the line is built behind. Cheap, patient, and he has no interest at all in moving." },
      { id: "persia_immortal", name: "Immortal", role: "elite", ability: "none",
        attack: 13, defense: 6, speed: 140, evasion: 4, range: 0,
        hp: 80, cost: 85, wage: 5,
        signature: "Kill one and another has his place and his name before the body is clear.",
        desc: "The King's own, scale under the robe. Costly, and the line they make never shows you a gap." },
      { id: "persia_medianhorse", name: "Median Horse", role: "specialist", ability: "lance",
        attack: 10, defense: 2, speed: 195, evasion: 14, range: 0,
        hp: 62, cost: 88, wage: 6,
        signature: "Comes on at a walk and does not change its pace for anything in the way.",
        desc: "Horse and rider both in armour, off the Median grass. Expensive to feed, and nothing turns it aside." },
      { id: "persia_scythedchariot", name: "Scythed Chariot", role: "specialist", ability: "backstab",
        attack: 19, defense: 2, speed: 162, evasion: 24, range: 0,
        hp: 88, cost: 102, wage: 7,
        signature: "One run, straight through the front rank, and the rank is open behind it.",
        desc: "Blades on the axles and one crew. They make the hole and your spears go in after it." },
    ],
  },
  india: {
    id: "india", home: "india", name: "India",
    heroName: "Nandaka of Kaushambi", heroTitle: "Elephant-guard captain of Kaushambi",
    backstory: "Nandaka was drilled from sixteen to fight at knee height under the belly of the raja's best elephant, and he was good enough at it to be given the left of the line below Kaushambi. Somebody across the water knew what fire does to a beast that size. The elephant turned inside its own lines and came back through his men, and he walked out of the mud with forty of two hundred behind him. The raja took the animal's price out of his house, and the fields at Kaushambi answer to a cousin now. He hires his spears where the work is, and every road he takes bends back toward Pataliputra.",
    playstyle: "Pin them on the spears, then walk in with the best steel in the world.",
    weapon: "sword", dress: "Turban wound over a steel cap, bare arms, saffron and indigo cotton, a gold armring, a curved southern blade watered grey, no cloak.",
    tint: 0xb5602a, accent: 0xe8c060, lean: "attack",
    campName: "The Grove Camp",
    troops: [
      { id: "india_bhata", name: "Bhata", role: "line", ability: "none",
        attack: 8, defense: 2, speed: 150, evasion: 2, range: 0,
        hp: 50, cost: 32, wage: 2,
        signature: "The back rank's spears come past the front, so two men strike from one pace.",
        desc: "Village spearmen the raja drills when the fields are dry. Cheap, patient, and there are always more." },
      { id: "india_padaraksha", name: "Padaraksha", role: "elite", ability: "trample",
        attack: 19, defense: 6, speed: 134, evasion: 4, range: 0,
        hp: 120, cost: 125, wage: 8,
        signature: "Works at knee height and cuts the legs out of whatever is standing over him.",
        desc: "Long spears held low, drilled to guard an elephant's legs. A lifetime down there, and nothing big frightens them." },
      { id: "india_dhanurdhara", name: "Dhanurdhara", role: "specialist", ability: "shieldwall",
        attack: 9, defense: 5, speed: 158, evasion: 14, range: 210,
        hp: 48, cost: 62, wage: 4,
        signature: "The shaft pins a man's shield to his arm and he fights on with neither.",
        desc: "Bamboo bows as tall as the man, drawn against the foot. Slow to loose, and nothing on the arm stops it." },
      { id: "india_ulmuka", name: "Ulmuka", role: "specialist", ability: "trample",
        attack: 16, defense: 2, speed: 162, evasion: 14, range: 0,
        hp: 94, cost: 102, wage: 7,
        signature: "Turns an elephant with fire, and it goes back through the men who brought it.",
        desc: "Pot-carriers who walk ahead of the spears with oil and flame. Few things alive will stand in front of them." },
    ],
  },
  egypt: {
    id: "egypt", home: "egypt", name: "Egypt",
    heroName: "Nebamun", heroTitle: "Chariot captain without a team",
    backstory: "Nebamun shot from the car of a Waset team for nine seasons, and his name stood on the temple roll one line under his father's. At Abu his captain took the chariots off the black fields onto scree, because the Kushites would not come down to level ground. The wheels went to pieces, the bowmen on the cliffs shot the horses and then the crews, and Nebamun walked home down the river. The priests sold what was left of his team against the dead ones and gave his place to a boy with an uncle in the granary. He hires off the quays now, where nobody is written down, and he will not fight on ground he has not walked first.",
    playstyle: "Take the level ground, run them down on it, and never fight where wheels break.",
    weapon: "bow", dress: "Blue-green faience war-cap, white linen kilt, bronze scale over the chest, red sash, hide-and-wood shield slung at his back, no cloak.",
    tint: 0x2f7a6b, accent: 0xe0c060, lean: "speed",
    campName: "The Old Quarry",
    troops: [
      { id: "egypt_menfyt", name: "Menfyt", role: "line", ability: "lance",
        attack: 8, defense: 2, speed: 195, evasion: 2, range: 0,
        hp: 58, cost: 58, wage: 4,
        signature: "Grounds the spear butt when horses come, and the charge breaks on the point.",
        desc: "Temple levy, called up by season and written on the roll under his father's name. There is always another name." },
      { id: "egypt_strongarm", name: "Strong-Arm", role: "elite", ability: "shieldwall",
        attack: 13, defense: 9, speed: 130, evasion: 4, range: 0,
        hp: 80, cost: 85, wage: 5,
        signature: "The curved blade hooks your shield aside and the next cut lands on the arm.",
        desc: "Hide and wood locked into one face, bronze on the chest. The line holds where he is standing." },
      { id: "egypt_seneny", name: "Seneny", role: "specialist", ability: "backstab",
        attack: 12, defense: 2, speed: 195, evasion: 24, range: 210,
        hp: 50, cost: 88, wage: 6,
        signature: "Runs a man down on the flat. It is the ground that stops it, never the men.",
        desc: "A pair of light horses, a driver, and the best bow in the kingdom behind him. Wheels do not like rock." },
      { id: "egypt_medjay", name: "Medjay", role: "specialist", ability: "none",
        attack: 10, defense: 2, speed: 168, evasion: 14, range: 0,
        hp: 54, cost: 62, wage: 4,
        signature: "Runs down whoever breaks and kills him before he reaches his own line.",
        desc: "Desert men in Egyptian pay, raised on the wadi roads. Nobody who turns his back on them gets far." },
    ],
  },
  kush: {
    id: "kush", home: "kush", name: "Kush",
    heroName: "Abratoye", heroTitle: "Bow-captain of the Buhen wall",
    backstory: "Abratoye held the wall at Buhen, where the river turns to rock and the shooting starts long before a face can be seen. The column came up the desert road behind him instead, and by the second night his men had four hundred iron shafts and nobody left to loose them. He opened the river gate and let the town out past him, which was not what Meroe had told him to do with it. The Kandake's scribes wrote the iron and the gate against his name in the same line, and the sentence was the road north. He looses first now, at whatever the road brings him, and he has stopped waiting to be told.",
    playstyle: "Kill them a long way off, and meet what is left behind a wall of hide.",
    weapon: "bow", dress: "No helmet: shaved head, gold ram-head earring, leopard hide across one shoulder, ochre linen, indigo sash, stone ring on the thumb.",
    tint: 0x8a4a2f, accent: 0xd8a860, lean: "attack",
    campName: "The Furnace Camp",
    troops: [
      { id: "kush_tasetibowman", name: "Ta-Seti Bowman", role: "line", ability: "volley",
        attack: 7, defense: 2, speed: 150, evasion: 2, range: 210,
        hp: 44, cost: 32, wage: 2,
        signature: "Starts killing at a range nothing you have can answer, and does not stop.",
        desc: "Picked for the eye and handed an acacia bow taller than he is. There are more of them than of anything else." },
      { id: "kush_kandakesshieldman", name: "Kandake's Shieldman", role: "elite", ability: "shieldwall",
        attack: 12, defense: 9, speed: 130, evasion: 4, range: 210,
        hp: 74, cost: 85, wage: 5,
        signature: "Walks a hide shield taller than a man onto you, and it does not stop coming.",
        desc: "The Kandake's own, priced like it. Your arrows are still standing in that hide when he reaches you." },
      { id: "kush_musawwaratelephant", name: "Musawwarat Elephant", role: "specialist", ability: "javelin",
        attack: 19, defense: 2, speed: 172, evasion: 24, range: 130,
        hp: 88, cost: 102, wage: 7,
        signature: "Takes a man up in the trunk and throws him into the rank behind him.",
        desc: "Broken to war on the ramps at Musawwarat and walked north for you. Keep it fed and keep it calm." },
      { id: "kush_butanahunter", name: "Butana Hunter", role: "specialist", ability: "volley",
        attack: 9, defense: 2, speed: 168, evasion: 14, range: 210,
        hp: 48, cost: 62, wage: 4,
        signature: "Looses from the grass, shifts, and looses again before you find the first place.",
        desc: "Out of the grass country past Naqa, where men hunt with war bows and go home hungry if they miss." },
    ],
  },
  aztecs: {
    id: "aztecs", home: "aztecs", name: "The Aztecs",
    heroName: "Tlacahuepan", heroTitle: "Stripped jaguar of Tenochtitlan",
    backstory: "Tlacahuepan took four men alive at Atlixco in one morning and had the jaguar pelt before the year turned. The next season he took a fifth, a captain out of Tlaxcallan, and cut his cords on the road home because the man's son was walking behind them and had seen it all. Tlaxcallan still tells that story in its market. Tenochtitlan took the pelt back, and his brother, who had stood surety for him, went up the temple steps in his place at the next feast. He keeps a warband now and goes where the fighting is, and every man carried off a field alive counts against a debt of exactly one.",
    playstyle: "Break them, then take them alive. Every man carried off is one who never comes back.",
    weapon: "sword", dress: "Jaguar pelt hood with his face in the open jaws, quilted cotton war-shirt, turquoise ear-plug, ochre red, black glass, green feathers.",
    tint: 0x2f6b4a, accent: 0xd85a3a, lean: "speed",
    campName: "The Lake Village",
    troops: [
      { id: "aztecs_yaoquizqui", name: "Yaoquizqui", role: "line", ability: "shieldwall",
        attack: 8, defense: 5, speed: 140, evasion: 2, range: 0,
        hp: 50, cost: 32, wage: 2,
        signature: "The black glass snaps off in the cut and the wound goes on opening after.",
        desc: "Farmers and canal men called up by their ward. Reed shield, a club toothed with obsidian, and more of them than you brought." },
      { id: "aztecs_ocelotl", name: "Ocelotl", role: "elite", ability: "none",
        attack: 13, defense: 6, speed: 140, evasion: 4, range: 0,
        hp: 80, cost: 85, wage: 5,
        signature: "Puts a man down and drags him off the field alive, and he does not come back.",
        desc: "Jaguar pelt over the head, his face in the open jaws. He counts his standing in men taken, not men killed." },
      { id: "aztecs_cuauhtli", name: "Cuauhtli", role: "specialist", ability: "volley",
        attack: 9, defense: 2, speed: 168, evasion: 14, range: 210,
        hp: 48, cost: 62, wage: 4,
        signature: "First across the open ground, and in among their bowmen before the lines meet.",
        desc: "Feathered head, a beak over the brow. Chosen for how fast he crosses what stops everyone else." },
      { id: "aztecs_cuachic", name: "Cuachic", role: "specialist", ability: "none",
        attack: 10, defense: 2, speed: 168, evasion: 14, range: 0,
        hp: 54, cost: 62, wage: 4,
        signature: "Fights bare to the waist at the worst of it, and the men in front give ground.",
        desc: "One lock left on a shaved skull. He swore in front of his ward to take four men alive or be carried home." },
    ],
  },
  inca: {
    id: "inca", home: "inca", name: "The Inca",
    heroName: "Chuqui Waman", heroTitle: "Bridge-keeper on the Apurimac",
    backstory: "His family had kept the rope bridge over the Apurimac for four generations, braiding new cable every dry season and letting the old one fall. When Waskar and Atawallpa turned their armies on one another he was ordered to cut it, and he cut it with the northern column halfway across. The villages on both banks walk two days round now, and the men who came every summer to help him braid stay home. No lord in Cusco has taken the weight of it off him, and he has stopped asking one to. He walks the high roads with men who owe him nothing, and he still takes the ridge above a town long before he looks at its gate.",
    playstyle: "Take the high ground first. They are already broken when you come down the road.",
    weapon: "sword", dress: "Quilted tunic in black-and-white checks with a red yoke, wooden helm wound in cord, gold discs in the ears, sling coiled at the wrist.",
    tint: 0x9a4a3a, accent: 0xd8c060, lean: "speed",
    campName: "The High Terrace",
    troops: [
      { id: "inca_mitayuq", name: "Mit'ayuq", role: "line", ability: "javelin",
        attack: 7, defense: 2, speed: 150, evasion: 2, range: 210,
        hp: 44, cost: 32, wage: 2,
        signature: "Quilted cotton to the knee: clubs and stones come off it, only an edge tells.",
        desc: "Men serving their turn of labour for the Inca, with a wooden club and a sling tucked in the belt." },
      { id: "inca_awqakamayuq", name: "Awqa Kamayuq", role: "elite", ability: "none",
        attack: 13, defense: 6, speed: 140, evasion: 4, range: 0,
        hp: 80, cost: 85, wage: 5,
        signature: "A bronze star-mace in both hands: the man stands a moment, then goes down.",
        desc: "A war-officer out of the Cusco houses, gold discs in his ears and a plumed cane helm. He has put down two revolts." },
      { id: "inca_waraka", name: "Waraka", role: "specialist", ability: "javelin",
        attack: 12, defense: 2, speed: 168, evasion: 24, range: 210,
        hp: 42, cost: 62, wage: 4,
        signature: "Puts the stone up in a high arc and drops it on the rank behind the fighting.",
        desc: "Herdsmen off the high grass who have killed with a stone since they could walk. Braided sling, river shot." },
      { id: "inca_ayllu", name: "Ayllu", role: "specialist", ability: "javelin",
        attack: 10, defense: 2, speed: 195, evasion: 14, range: 130,
        hp: 62, cost: 88, wage: 6,
        signature: "Cords wrap a man's legs in mid-stride and he goes down where he was running.",
        desc: "Three stones on braided cords, whirled overhead and thrown low. What drops a guanaco drops a man." },
    ],
  },
};
export function civOf(id: string): CivDef { return CIVS[id] ?? CIVS.outlaw; }
export function civList(): CivDef[] {
  // the outlaw stands first: it is the game as it was, and the hard way to play it
  const rest = Object.values(CIVS).filter(c => c.id !== 'outlaw').sort((a, b) => a.name.localeCompare(b.name));
  return CIVS.outlaw ? [CIVS.outlaw, ...rest] : rest;
}
/**
 * The starts no road leaves. These are whole campaigns — a country to take from end to end — and the
 * water is both the reason nothing can reach you and the reason you cannot reach anything. Each says
 * that in its own voice, because it is a promise about the run and not a warning label.
 */
export const CONFINED: Record<string, string> = {
  japan: 'The sea is your wall until you can pay a man to cross it. Take these islands first; every harbour on them sells passage to the rest of the world.',
  aztecs: 'The water rings this valley and the ocean rings the water. Take the valley, then buy your way onto a ship — the far shore is a fare, not a wall.',
  inca: 'Mountains on one hand and ocean on the other. The road runs only between them, but the ocean is a road too, once there is silver for the crossing.',
};

/**
 * Where a start pitches its first camp: OUT ON ITS OWN COUNTRY'S EDGE, among the places its king holds
 * least well. A warband does not begin in the throne room — it begins where nobody is looking, with
 * two or three thin villages in reach and the capital a long way off. Worked out from the map rather
 * than authored, so it stays true if the atlas changes.
 */
export function campPoint(id: string): Pt {
  if (id === 'outlaw') return OUTLAW_CAMP;
  const home = CIVS[id]?.home ?? id;
  const mine = (t: string) => t === home || (home === 'steppe' && t === 'mongolia');
  const fringe = FRINGE.filter(n => mine(n.territory));
  // a warband camps among the hamlets, which is the whole reason the hamlets exist
  if (fringe.length >= 2) {
    // Stand among them — but "among" means beside the one with the others CLOSEST, not at the average
    // of three points scattered across Rus, which is a spot with nothing within a month's walk.
    // Where the camp goes is not a guess: try the middle of the fringe and a spot beside each hamlet,
    // and take whichever leaves the LONGEST of the three marches shortest. A centroid works for a tight
    // cluster and is useless across a desert, so let the pathfinder decide rather than the geometry.
    const cands: Pt[] = [];
    const mx = fringe.reduce((n, k) => n + k.x, 0) / fringe.length;
    const my = fringe.reduce((n, k) => n + k.y, 0) / fringe.length;
    // near the middle of the hamlets first, then further out — a valley as crowded as Mexico's has no
    // clear ground within arm's reach of its own capital, and a camp must still find somewhere to be
    const spread: Array<[number, number]> = [[0, 0], [40, 30], [-40, 30], [40, -30], [-40, -30],
      [56, 0], [-56, 0], [0, 52], [0, -52], [74, 40], [-74, 40], [74, -40], [-74, -40]];
    for (const rad of [96, 132, 170]) {
      for (let i = 0; i < 12; i++) {
        const th = (i / 12) * Math.PI * 2 + rad * 0.013;
        spread.push([Math.cos(th) * rad, Math.sin(th) * rad * 0.8]);
      }
    }
    for (const [dx, dy] of spread) {
      const c: Pt = [mx + dx, my + dy];
      if (isLand(c[0], c[1])) { cands.push([Math.round(c[0]), Math.round(c[1])]); continue; }
      const snap = nearestLand(c[0], c[1], 8);
      if (snap) cands.push([Math.round(snap[0]), Math.round(snap[1])]);
    }
    let best: Pt | null = null, bestWorst = Infinity;
    for (const c of cands) {
      // A camp pitched ON a place buries it: the camp's own name plate is drawn over the chart and is
      // wider than the gap, so its neighbour is neither readable nor tappable. Stand clear of the three
      // hamlets AND of anything the atlas already named — an Aztec camp eighteen units from
      // Tenochtitlan takes the capital's name off the map.
      if (fringe.some(k => Math.hypot(k.x - c[0], k.y - c[1]) < 46)) continue;
      if (FOREIGN.some(k => mine(k.territory) && Math.hypot(k.x - c[0], k.y - c[1]) < 62)) continue;
      let worst = 0, ok = true;
      for (const k of fringe) {
        const r = route(c, [k.x, k.y]);
        if (!r) { ok = false; break; }
        worst = Math.max(worst, r.days);
      }
      if (ok && worst < bestWorst) { bestWorst = worst; best = c; }
    }
    if (best) return best;
    return [fringe[0].x, fringe[0].y];
  }
  const kin = FOREIGN.filter(n => mine(n.territory));
  if (kin.length >= 2) {
    // out on the edge, but not out on a limb: the best corner is the one that is BOTH far from the
    // throne and has neighbours worth walking to. Averaging the frontier instead of choosing from it
    // is how you end up camped in the middle of the Mediterranean.
    const near = (n: typeof kin[number]) => kin.filter(k => k !== n && Math.hypot(k.x - n.x, k.y - n.y) < 300).length;
    const most = Math.max(1, ...kin.map(near));
    const best = [...kin].sort((a, b) =>
      (frontier(b) * 0.66 + (near(b) / most) * 0.34) - (frontier(a) * 0.66 + (near(a) / most) * 0.34))[0];
    // a short walk off it, and on ground a warband can actually stand on
    for (const [dx, dy] of [[34, 26], [-34, 26], [34, -26], [-34, -26], [0, 40], [0, -40]]) {
      const p: Pt = [Math.round(best.x + dx), Math.round(best.y + dy)];
      if (isLand(p[0], p[1])) return p;
    }
    const snap = nearestLand(best.x + 34, best.y + 26, 6);
    return snap ?? [best.x, best.y];
  }
  const at = CAMP_AT[id] ?? CAMP_AT.outlaw;
  return ll(at[0], at[1]);
}
