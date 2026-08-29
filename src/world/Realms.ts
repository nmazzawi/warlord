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
export const REALM_VISITS: Record<string, RealmVisit> = {
  rus: {
    id: "rus",
    enter: "The forest road ends at the Dnieper. Timber walls, church bells, furs on every landing, and nobody asks your name.",
    warLocked: "Every prince keeps a druzhina in mail behind a shield wall, and winter starves whatever stands still in front of it. The Dnieper is not yours until a later age.",
    barracksLocked: "no prince arms a man who came in off the steppe road",
    forge: { items: ["plate", "round", "kite", "bow"], swordMaxTier: 2, note: "They ring mail shirt by shirt, hang round and tall shields on one rack, and re-hilt blades bought out of the west." },
    stables: { horses: ["courser"], note: "Horses come up off the grass each autumn. The heavy stock is spoken for by the prince's men before the market opens." },
    inn: {
      name: "the korchma by the river gate",
      rumors: [
        "The seat at Kiev passes brother to brother, not father to son, so every prince alive holds a claim and the men to press it. Vladimir keeps the treasury now, and Novgorod buys and dismisses its prince by show of hands.",
        "The druzhina get off their horses to fight. Mail on every man, shields locked, and a long axe swung two-handed over the rim - it comes down through helm and shoulder, and the man behind steps into the gap.",
        "The rivers are the roads. Boats are dragged overland at Smolensk and the toll is taken there. Twice a year the tracks turn to mud and nothing moves; in hard frost a sledge runs the Dnieper faster than a horse runs on grass.",
      ],
    },
    markup: 2,
  },
  rome: {
    id: "rome",
    enter: "You come into Rome on a stone road laid straight to the horizon. It was cut and numbered before your grandfather was born.",
    warLocked: "Roads move a legion faster than your riders, the siege engines arrive already built, and every night they dig a fort. The west answers to a later age.",
    barracksLocked: "a legionary swears to the eagle, not to a foreigner's purse",
    forge: { items: ["leather", "plate", "kite"], swordMaxTier: 2, note: "Segmented plate and the tall shield, turned out by the thousand, every piece cut to the same measure." },
    stables: { horses: ["courser"], note: "Rome wins on foot. What horse it has is bought off Numidians and Gauls, and the army keeps the heavy ones." },
    inn: {
      name: "the taberna on the Subura",
      rumors: [
        "The purple sits at Roma, but the legions make and unmake whoever wears it. A governor with three legions is a claimant - which is why the frontier armies are never all in one place, and never all loyal.",
        "They lock the tall shields into a roof and arrows rattle off it. At twenty paces every man throws one heavy javelin - it bends where it sticks, so the shield it hits is ruined - and then the short swords come in.",
        "Rome eats from the sea. African and Egyptian grain unloads at Ostia, which has no ditch and no gate. They fear no army. They fear a corn fleet held up by weather and the bread price after.",
      ],
    },
    markup: 2.3,
  },
  greece: {
    id: "greece",
    enter: "You come down into olive country. A city on every hill, and each one has a quarrel with the one across the valley.",
    warLocked: "Spears eight deep, and cities that hate each other will close ranks against a foreigner. Your warband dies on the points. That wall breaks in a later age.",
    barracksLocked: "a hoplite stands beside his own neighbours, never beside a stranger",
    forge: { items: ["leather", "plate", "round"], swordMaxTier: 2, note: "Bronze beaten into the round shield and the breastplate. The sword is short and worn behind the spear, an afterthought." },
    stables: { horses: ["courser"], note: "Horses off the Argos plain and the Thessalian grass, light and quick. This stony ground breaks a heavy horse." },
    inn: {
      name: "the kapeleion off the agora",
      rumors: [
        "Everything moving between the north and the south crosses the neck of land at Korinthos, and Korinthos takes a toll at both ends. The rock above the town has one path up and a spring inside it.",
        "Athenai holds the throne on silver out of the Laureion hills, and most of it goes to the ships. The city eats bread carried in from the Euxine; what frightens it is a fleet across that road, not an army.",
        "Sparta keeps no wall. Helots outnumber their masters ten to one and work every field, so the men do nothing but drill. That line holds anything from the front and cannot turn - the flank undoes it.",
      ],
    },
    markup: 1.8,
  },
  arabia: {
    id: "arabia",
    enter: "Palms line the road into the Caliph's country. Every well is owned, and the caravan ahead of you is longer than your warband.",
    warLocked: "The Caliph's treasury hires a new army the week you break the last one, and the sand starves whoever marches on Baghdad. War here comes in a later age.",
    barracksLocked: "the guard was bought as boys and raised to it - there is no hiring in",
    forge: { items: ["leather", "round", "bow"], swordMaxTier: 3, note: "Dimashq folds eastern iron until the blade shows watermarks. Nowhere is a sword finished better than here." },
    stables: { horses: ["courser"], note: "Desert mares, light and long-winded, bred where the next well is a day off. Nothing here is built to carry armour." },
    inn: {
      name: "the khan by the Khurasan gate",
      rumors: [
        "The Commander of the Faithful holds the Round City, and his guard is bought, not born here - Turkish boys raised to the bow and paid in silver every month. They ride to the fight, get down, and shoot from planted feet.",
        "From al-Kufah to Makkah the pilgrim road runs cistern to cistern, one stage apart, and the governor's men count every one. Step off that line of water and the sand has your horses in two days.",
        "Every caravan out of the south moves on camels, and a horse that has never smelled one will bolt from the line. Their captains know it. They put the camels in front and let your own mounts break your ranks.",
      ],
    },
    markup: 1.9,
  },
  persia: {
    id: "persia",
    enter: "You cross into Persia. Gardens behind walls, snow on the mountains, and men on the road who ask which satrap gave you leave.",
    warLocked: "Ten thousand Immortals close their own gaps by morning, and the Royal Road puts a satrap's army on your camp in days. Persia is for a later age.",
    barracksLocked: "the King buys spears from whole nations, never from one man",
    forge: { items: ["plate", "round", "composite"], swordMaxTier: 2, note: "Their smiths armour horse and rider both, and bend horn and sinew into a bow that shoots from the saddle." },
    stables: { horses: ["courser", "destrier"], note: "Nisaean stock off the Median grass, deep-chested and bred to carry armour; light-legged horses from the eastern oases." },
    inn: {
      name: "the ninth-stage caravanserai",
      rumors: [
        "Ten thousand Immortals stand for the King of Kings, never one more. A man who falls is carried off and a reserve takes his name before the next muster - the line you broke is whole again by morning.",
        "The Royal Road runs by measured stages, and every stage keeps a shed of fed horses. A courier changes mount at each one and is at the capital in a week from anywhere, while your warband is still counting days.",
        "Every load of silk out of the east and every turquoise off the Nishapur hills passes through Marv, so the King keeps armoured horse in that oasis. He fears the man who commands them as much as he fears the sand.",
      ],
    },
    markup: 2.2,
  },
  egypt: {
    id: "egypt",
    enter: "You are in the Kingdom of the Nile now. Green a bowshot wide between two deserts, and every field of it already counted.",
    warLocked: "Their chariots own every flat mile of the valley, and the river feeds and moves their army all year without a cart. Egypt falls in a later age, not this one.",
    barracksLocked: "every fighting man here is written on a temple roll, and you are not",
    forge: { items: ["leather", "kite", "bow"], swordMaxTier: 2, note: "Temple workshops cast the curved bronze blade. The best bows go to the chariot crews and are never sold at all." },
    stables: { horses: ["courser"], note: "Light horses bred to the chariot pole. The matched pairs go to the king's teams; you are sold a single animal." },
    inn: {
      name: "the beer house at the quay",
      rumors: [
        "The throne sits at Waset, but the temple of Amun holds the granaries and arms men of its own. Every measure is weighed by a scribe before it goes down to Alexandria, and from Alexandria it feeds Rome.",
        "A chariot carries a driver and a bowman behind two horses, and on the flat black fields it runs down anything on foot. Wheels split in the canal country and on desert scree - broken ground is where you meet them level.",
        "The valley ends at Abu, where the river turns to rock and no hull goes further. Beyond it are Kushite bowmen who outshoot anything Egypt fields, so the fort there looks south - and the desert road behind it goes unwatched.",
      ],
    },
    markup: 2.4,
  },
  kush: {
    id: "kush",
    enter: "You come south past the last cataract into the Land of the Bow. Iron smoke stands over Meroe, and the cliffs have eyes.",
    warLocked: "Their bowmen kill at a range you cannot answer, and six cataracts break the river above Aswan while they shoot down on you. You settle that in a later age.",
    barracksLocked: "no bowman here bends his bow for a stranger's coin",
    forge: { items: ["leather", "round", "bow"], swordMaxTier: 1, note: "The Meroe furnaces pour more iron than any smith can use, and near all of it is beaten into arrowheads, not blades." },
    stables: { horses: ["courser"], note: "Kawa breeds the light river horses the northern kings pay gold for. Nothing here is bred to carry a man in armour." },
    inn: {
      name: "the red pot",
      rumors: [
        "The Kandake rules at Meroe and her son's name is spoken after hers. Her bowmen are picked for the eye - acacia bows taller than a man, and a shaft that goes through a shield at two hundred paces.",
        "Cargo does not sail the cataracts. It is unloaded and walked past them on donkeys, and Qasr Ibrim sits on its crag downriver taxing whatever it can see. Caravans dodge it by the desert road over the great bend: five days, no well.",
        "Meroe sells iron, gold out of the eastern hills, ivory, and elephants broken to war at Musawwarat, and takes Egyptian grain and wine. What it lacks is wood - the acacia is cut a day's walk back, and charcoal sets every price.",
      ],
    },
    markup: 2,
  },
  india: {
    id: "india",
    enter: "The heat closes on you a mile inside the Kingdoms of India, and the road to Pataliputra is never empty.",
    warLocked: "Every raja fields elephants, and elephants walk through a shield wall like standing wheat. Your warband would not slow one. Come back in a later age.",
    barracksLocked: "no raja's spearmen will march under a foreigner's banner",
    forge: { items: ["leather", "bow"], swordMaxTier: 3, note: "Crucible steel that goes west as bars and comes back as famous blades. The cane bow is drawn braced under the foot." },
    stables: { horses: [], note: "Every warhorse here was walked down the passes at a price, and the heat kills them off. None leaves the raja's stable." },
    inn: {
      name: "the toddy house by the ghats",
      rumors: [
        "The raja at Pataliputra stalls his elephants inside the sixty-four gates and feeds each one what would keep ten men. No shield wall stops them. Fire and noise turn them, and a turned elephant kills whoever stands nearest.",
        "Everything coming from the north is counted at Takshashila. The passes above it shut with snow half the year, then open with the horse dealers - this land breeds no warhorse, so a raja's mount is bought with gold, not raised.",
        "The temples hold more gold than the kings do, and no king will touch it. Raiders from beyond the passes worked that out long ago: they come down in the dry season, strip a shrine, and are gone before the levy is called.",
      ],
    },
    markup: 2.1,
  },
  china: {
    id: "china",
    enter: "You cross into the Middle Kingdom. Before the first gate a clerk writes down your name, your men and your horses.",
    warLocked: "Ten thousand crossbows loose on one drumbeat, and their walls outlast any siege you could sit through. The Middle Kingdom is shut until a later age.",
    barracksLocked: "a magistrate calls soldiers up by household; nobody sells you any",
    forge: { items: ["leather", "round", "composite"], swordMaxTier: 2, note: "Blades come out of the state arsenals by the thousand, each the same as the last. Armour and crossbows are not sold." },
    stables: { horses: [], note: "Their warhorses are bought off the steppe and counted by clerks. None is sold on to a man riding back north." },
    inn: {
      name: "the wineshop under the drum tower",
      rumors: [
        "The Son of Heaven keeps his court at Chang'an and is not seen. The empire is run by men who passed examinations - they move grain, levy soldiers and post orders. Beat one province and nine more answer inside the month.",
        "Their crossbows are spanned with the foot and loosed by rank - one rank shoots, one spans, one waits, so the bolts never stop. At a hundred paces a bolt goes through shield and mail together. Yours would need a season to learn it.",
        "They fear the north and they watch for it. Beacon towers stand a day apart along the passes - smoke by day, fire by night - and the garrison at the far end is mounted before the smoke has gone cold.",
      ],
    },
    markup: 2.6,
  },
};
/** The realms whose gates are open to a foreigner on foot. */
export function openRealms() { return Object.keys(REALM_VISITS); }
export function visitOf(realm: string): RealmVisit | null { return REALM_VISITS[realm] ?? null; }
export function reachOf(realm: string): 'land' | 'sea' { return REALM_VISITS[realm] ? 'land' : 'sea'; }
