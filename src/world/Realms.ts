// Realms.ts — which of the world's realms a warband can reach ON FOOT, and what it finds when it
// gets there. Both halves of that: a capital or a great city will take a stranger's coin — their
// forge and stables sell what THEY make, at a price that says plainly what they think of you, and
// their inn sells what they know — and every settlement in the realm, down to the last village, can
// be attacked instead. Nothing here forbids that. What each realm keeps under arms is in `army`, and
// the panels print the numbers before you decide.
//
// Everything else — Japan, the Norse jarldoms, the Aztecs, the Inca — is across water, and there are
// no ships yet.
import type { ForgeItem } from './Stock';
import type { HorseKind } from '../state/GameState';
import type { EliteStyle } from '../config/balance';

/** The one unit a realm fields that is its own, and the plain facts about what it keeps in its towns.
 *  Nothing in here forbids a fight — it only says what is standing there. */
export interface RealmArmy {
  style: EliteStyle;
  eliteName: string;
  elitePlural: string;
  eliteNote: string;
  /** For the realm's card: what stands between you and this country. */
  armyNote: string;
  /** For the throne city's panel. */
  capitalWarning: string;
  /** For a fringe village of this realm. */
  villageNote: string;
}

export interface RealmVisit {
  id: string;
  /** Shown the first time you set foot in the realm. */
  enter: string;
  /** Its army, and the one elite of its own it puts in the line. */
  army: RealmArmy;
  /** Why nobody here will take your coin to fight. */
  barracksLocked: string;
  forge: { items: ForgeItem[]; swordMaxTier: number; note: string };
  stables: { horses: HorseKind[]; note: string };
  inn: { name: string; rumors: string[] };
  /** What a foreigner pays. 1.8 is a trading empire that likes coin; 2.6 is one that resents you. */
  markup: number;
}

/** What colour a realm's own men are painted, so the line you are looking at is visibly Rome's or
 *  Persia's and not just "more enemies". Every one is deliberately LIGHT: on a phone, a crowd of
 *  brown militia is one brown mass, and the men who matter have to read out of it at a glance. And
 *  none of them is the green of your troops or the blue of your warlord. */
export const ELITE_TINT: Record<string, number> = {
  rome: 0xe8705f, greece: 0xe8cf7a, rus: 0xb9c6e0, arabia: 0xefd98a, persia: 0xd0a6e8,
  egypt: 0x7fdcd0, kush: 0xf0c48a, india: 0xf0a95c, china: 0xef8f8f,
  japan: 0xe8dcc8, viking: 0xa8c4dc, aztecs: 0x9ad8a0, inca: 0xe0a8b0, mongolia: 0xe0c89a,
};

/** What a country calls the man who holds it. You take their throne; you take their word for it. */
export const CROWN_TITLE: Record<string, string> = {
  homeland: 'King', rome: 'Imperator', greece: 'Hegemon', japan: 'Shogun', china: 'Emperor',
  steppe: 'Khan', mongolia: 'Khan', rus: 'Grand Prince', arabia: 'Caliph', viking: 'Konungr',
  persia: 'Shahanshah', india: 'Maharaja', egypt: 'Pharaoh', kush: 'Qore', aztecs: 'Tlatoani',
  inca: 'Sapa Inca',
};

/** The name the meter uses when you are standing in a realm. Short enough for a phone's status bar. */
export const REALM_SHORT: Record<string, string> = {
  rome: 'ROME', greece: 'GREECE', rus: 'RUS', arabia: 'THE CALIPHATE', persia: 'PERSIA',
  egypt: 'EGYPT', kush: 'KUSH', india: 'INDIA', china: 'CHINA',
  japan: 'JAPAN', viking: 'THE JARLDOMS', aztecs: 'THE AZTECS', inca: 'THE INCA',
  mongolia: 'STEPPE', homeland: '', steppe: 'STEPPE',
};

/** Filled below. A realm with an entry here can be walked to; everything else needs a ship. */
export const REALM_VISITS: Record<string, RealmVisit> = {
  rus: {
    id: "rus",
    enter: "The forest road ends at the Dnieper. Timber walls, church bells, furs on every landing, and nobody asks your name.",
    army: {
      style: "axeman",
      eliteName: "Druzhinnik",
      elitePlural: "Druzhinniki",
      eliteNote: "Fights on foot in mail, both hands on a long axe. The blow comes down over your shield rim, not against it.",
      armyNote: "Spear militia, bowmen off the river forts, the prince's druzhina in mail behind them, and a winter that starves whatever stands still in front of it.",
      capitalWarning: "Stone gates and a deep ditch. The princes quarrel over that seat until a stranger comes for it, and then every druzhina in Rus is on the wall.",
      villageNote: "Even a hamlet sits behind a palisade with the trees cut back a bowshot, and the men who felled that timber keep their axes by the door.",
    },
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
    army: {
      style: "shieldman",
      eliteName: "Legionary",
      elitePlural: "Legionaries",
      eliteNote: "One javelin at twenty paces ruins the shield it sticks in. Then they close up and the short sword goes in low, under the guard.",
      armyNote: "Militia and bowmen take the first shock, and the cohorts behind them swap their leading rank mid-fight, so the men who tire you are never the men who finish you.",
      capitalWarning: "A guard stands on every gate of Roma, and the roads bring a legion in from three provinces. What you take in a morning you hold against all of it.",
      villageNote: "Veterans take their land grant out here at twenty years' service. The plough did not make them slow, and they still form up on a horn.",
    },
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
    army: {
      style: "spearman",
      eliteName: "Epilektos",
      elitePlural: "Epilektoi",
      eliteNote: "Stands in the first rank, spear held overarm, stabbing down past your shield at the throat and the thigh.",
      armyNote: "Militia spears, bowmen on the roofs, a captain in bronze, and the Epilektoi at the head of it. Eight ranks of spearpoints before you reach a man.",
      capitalWarning: "Athenai's walls run down to the sea, so grain unloads while you sit outside, and Laureion silver pays masons faster than you pull stone down.",
      villageNote: "There is a shield in every house here, and the man who owns it has stood in the line with it. They close the lane, and the lane is narrow.",
    },
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
    army: {
      style: "shieldman",
      eliteName: "Ghulam",
      elitePlural: "Ghilman",
      eliteNote: "Bought as a boy and drilled since. Shoots over the locked shields, and has the bow down and a sword out before the lines touch.",
      armyNote: "Town levies and bowmen in every province, captains who have put down revolts, and bought Ghilman wherever the coin reaches.",
      capitalWarning: "Round walls, four gates, and Ghilman standing on all of them. Break that army and the treasury has hired another before your wounds close.",
      villageNote: "Nothing here is unowned, least of all the well you must drink at. Flat mudbrick roofs, bows on them, and the sand does the rest.",
    },
    barracksLocked: "the guard was bought as boys and raised to it - there is no hiring in",
    forge: { items: ["leather", "round", "composite"], swordMaxTier: 3, note: "Dimashq folds eastern iron until the blade shows watermarks, and the bowyers glue horn to sinew for a bow a man looses from the saddle." },
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
    army: {
      style: "spearman",
      eliteName: "Immortal",
      elitePlural: "Immortals",
      eliteNote: "Wicker shield planted, spear worked past it, bows in the ranks behind. The gap closes before the body is dragged clear.",
      armyNote: "The King's own ten thousand spears, satrap levies feeding them from provinces you have not reached, and Median horse on both flanks.",
      capitalWarning: "One ramp climbs the terrace, wide enough for a rank of spears. The Immortals hold it, and the treasury guard is drawn up behind them.",
      villageNote: "The satrap takes his quota of spears out of every village, and the men who served their years came home and taught the rest.",
    },
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
    army: {
      style: "shieldman",
      eliteName: "Strong-Arm",
      elitePlural: "Strong-Arms",
      eliteNote: "Hide and wood locked into one face, and the curved blade hooks your shield aside and takes the arm behind it.",
      armyNote: "The river feeds and moves them all year without a cart: temple levies, bowmen counted off a roll, Strong-Arms in the front rank, and chariots to pick the ground.",
      capitalWarning: "Armed men live inside the pylons at Waset, and chariot teams stand harnessed behind the gate. The black fields around it are level ground, and theirs.",
      villageNote: "Every man here is written on a temple roll and has served his season. The canals cut a ditch across every field, and they know the crossings.",
    },
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
    army: {
      style: "shieldman",
      eliteName: "Kandake's Shieldman",
      elitePlural: "Kandake's Shieldmen",
      eliteNote: "The hide shield stands taller than the man behind it. They walk it onto you while their own arrows drop over the top.",
      armyNote: "They start killing at two hundred paces. The shieldmen come up behind the arrows, and Musawwarat sends elephants when the Kandake asks for them.",
      capitalWarning: "Bowmen hold the slag ridges over every approach to Meroe, and shieldmen hold the gate. Nothing crosses that open ground unshot.",
      villageNote: "No wall around the palms and none wanted. The men here hunt with war bows, and the shooting starts long before you see a face.",
    },
    barracksLocked: "no bowman here bends his bow for a stranger's coin",
    forge: { items: ["leather", "kite", "bow"], swordMaxTier: 1, note: "More iron comes off the Meroe furnaces than the smiths can use, and most of it goes into arrowheads. The shields are hide, and taller than a man." },
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
    army: {
      style: "spearman",
      eliteName: "Padaraksha",
      elitePlural: "Padarakshas",
      eliteNote: "Long spears held low in a hedge, drilled to guard an elephant's legs. They step over their own dead to close the line.",
      armyNote: "There is no one army here. Each raja keeps his own - militia, cane bows, captains, Padarakshas round the elephants - and there are more rajas than you have men.",
      capitalWarning: "A moat you could lose an army in, sixty-four gates behind it, and Padarakshas holding every causeway over. The elephants are stalled inside.",
      villageNote: "The raja takes spearmen out of here and drills them when the fields are dry. The old men have stood beside elephants and know the work.",
    },
    barracksLocked: "no raja's spearmen will march under a foreigner's banner",
    forge: { items: ["leather", "plate", "bow"], swordMaxTier: 3, note: "Crucible steel out of the south, sold twice before it reaches the west, and mail and plate beaten for men who fight beside elephants." },
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
    army: {
      style: "axeman",
      eliteName: "Horse-Cutter",
      elitePlural: "Horse-Cutters",
      eliteNote: "A blade as long as a man, held in both hands. The stroke is slow and comes down through shield, helm and the horse under it.",
      armyNote: "Registered militia, bowmen and captains, all moving on one drum, with the long blades in reserve and crossbow ranks that shoot by turns and never stop.",
      capitalWarning: "A hundred walled wards inside the great wall, each shutting behind the last. Win a gate and you have taken one ward, and there are ninety-nine more.",
      villageNote: "Word runs ahead of you by smoke. The drum has the men in the ditch before you are close, and every household owes the magistrate one bow.",
    },
    barracksLocked: "a magistrate calls soldiers up by household; nobody sells you any",
    forge: { items: ["leather", "plate", "composite"], swordMaxTier: 2, note: "State arsenals turn out lamellar and the saddle bow by the thousand, each piece the same as the last. The crossbows are counted out and counted back, and never sold." },
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
  viking: {
    id: "viking",
    enter: "You are in the jarldoms. Grey water at the end of every field, boat sheds above the tideline, and no man over the man in the hall.",
    army: {
      style: "shieldman",
      eliteName: "Huscarl",
      elitePlural: "Huscarls",
      eliteNote: "Boards overlapped edge on edge, and he leans on them and walks at you. What you swing hits linden and rivets and stops there.",
      armyNote: "There is no one army. Each jarl brings his own hall - farm levies with axes, hunting bows, Huscarls in mail - and the crews come ashore where the last lot did not.",
      capitalWarning: "Nine days of sacrifice bring every jarl in the north to Uppsala with his sworn men behind him. Come at that temple ground and you fight all of them.",
      villageNote: "No wall here and no lord asked for. The farms lie a day apart, every man keeps an axe and a shield board by the door, and smoke fetches them.",
    },
    barracksLocked: "a sworn man eats at his jarl's table all winter and is not for sale",
    forge: { items: ["plate", "round", "bow"], swordMaxTier: 2, note: "Bog iron drawn into mail, ring by ring. Good blades come up from the Franks, and half those names are filed in false." },
    stables: { horses: ["courser"], note: "Shaggy farm stock, small and sure-footed. Nothing here is bred to carry armour - they ride to the fight and get off it." },
    inn: {
      name: "the mead bench by the boat sheds",
      rumors: [
        "The king at Uppsala is raised at the thing and can be put down at the same thing. A jarl owes him ships and men in summer and nothing after. Break one hall and the neighbours count it a gift and send nobody.",
        "The wall is boards overlapped edge on edge, and they lean on it and walk. Berserkers go in shieldless where it is thinnest. It holds while it is moving forward - stop it, get round the end of it, and it comes apart.",
        "Silver here is weighed, not counted. Hacked coin and cut arm rings on a scale at Birka and Hedeby, and the rest buried under a hall floor by the one man who knows the field. The markets stand empty from the first ice.",
      ],
    },
    markup: 1.9,
  },
  japan: {
    id: "japan",
    enter: "You come up a mountain road into the Shogunate. Pine on the ridges, a gate on every pass, and men at it who counted you first.",
    army: {
      style: "axeman",
      eliteName: "Samurai",
      elitePlural: "Samurai",
      eliteNote: "No shield. The blade goes up in both hands and comes down once, through helm and collarbone, and he is past you already.",
      armyNote: "Few, and each one drilled from childhood. Levy spears and bowmen hold the ground, samurai loose from the saddle and then get down, and the rest is done at night.",
      capitalWarning: "No wall around Heian-kyo. Every pass into the valley is gated and watched, and what you take by day is visited the same night.",
      villageNote: "A lord holds this valley and takes his men out of its fields. Somebody on the ridge counted you an hour back, and the count went up the road.",
    },
    barracksLocked: "a samurai's sword is his lord's, and his father swore it first",
    forge: { items: ["plate", "bow", "composite"], swordMaxTier: 3, note: "Steel folded until the edge holds. Lacquered plates laced with silk, and a long uneven bow loosed at a canter." },
    stables: { horses: ["courser"], note: "Short hill stock out of Kai and Kiso, sure-footed on a track a cart cannot take. A samurai's own mount is never sold." },
    inn: {
      name: "the sakaya by the Rashomon gate",
      rumors: [
        "The Emperor keeps the court at Heian-kyo and seals what he is handed. The Shogun at Kamakura holds the swords, the great houses hold the provinces, and the temples at Nara arm monks who answer to neither of them.",
        "They carry no shield. The long blade goes up in both hands and comes down once, through helm and collarbone together - slow enough to watch and too heavy to turn. Get inside the stroke or do not go in at all.",
        "The towns are timber, thatch and paper, packed close, and the mountains hold every road between them. No house here fears a siege. It fears a dry night wind, and men who come over the wall to set one fire.",
      ],
    },
    markup: 2.5,
  },
  aztecs: {
    id: "aztecs",
    enter: "You come down out of the pines into the lake valley. The city stands out on the water, and canoes are counting your men already.",
    army: {
      style: "shieldman",
      eliteName: "Jaguar Warrior",
      elitePlural: "Jaguar Warriors",
      eliteNote: "Shield up, and the club comes in low at the legs. The obsidian opens a man to the bone and leaves him standing to be carried off.",
      armyNote: "Ward levies, dart-throwers loosing over them, and jaguar and eagle warriors in the front rank - all of it drilled to carry you off the field alive.",
      capitalWarning: "Three causeways onto the island, each one bridged in sections that come up behind you, and canoes on the water either side of every one.",
      villageNote: "Every man here learned the club in the ward school, and the canals cut this ground into strips. They cross by plank and take the plank up after.",
    },
    barracksLocked: "rank here is counted in captives a man took with his own hands",
    forge: { items: ["leather", "plate", "round"], swordMaxTier: 1, note: "No iron. Obsidian knapped in rows and set into a club edge, and cotton quilted in layers till no dart goes through." },
    stables: { horses: [], note: "Nothing here is bred to ride. Every load the empire moves goes on a man's back, under a strap across the brow." },
    inn: {
      name: "the cacao bench in Tlatelolco",
      rumors: [
        "Three cities hold this lake and Tenochtitlan takes two shares. Tribute walks in on carriers' backs from a month off - cloth, cacao, feathers, obsidian - and Tlaxcallan sits ringed by all of it and has never sent a load.",
        "They fight to take you alive. The club is a shaft toothed with obsidian, swung at the legs and not the head, and a man who kills where he could have carried you off gets nothing. Get out of their hands and you are off that field.",
        "Every causeway lifts its bridges out in sections, and the sweet water comes down one clay pipe off the Chapultepec springs. Cut the pipe and the island drinks lake salt with every wall of it still standing.",
      ],
    },
    markup: 2,
  },
  inca: {
    id: "inca",
    enter: "You climb into the Inca country on cut stone. The road is swept, the gorge is bridged, and a runner has already gone ahead of you.",
    army: {
      style: "axeman",
      eliteName: "Sinchi",
      elitePlural: "Sinchikuna",
      eliteNote: "Both hands on a long haft with a bronze star on the end. The blow is slow and comes down through the shield onto the collarbone.",
      armyNote: "Levies out of every province, fed off the road and swapped fresh; slingers on the heights above them; and the Sinchikuna in the line with bronze on long hafts.",
      capitalWarning: "Three walls of fitted stone stand on the hill above Cusco, and slings hold every approach. The road has a province coming up while you climb.",
      villageNote: "Every man here owes the Inca a season of work and has carried a sling since he could walk. The stones start coming down before the path levels.",
    },
    barracksLocked: "every man here owes the Inca his season of work, and it is not sold",
    forge: { items: ["leather", "plate", "kite"], swordMaxTier: 1, note: "Bronze mace heads, plates sewn on quilted cotton, tall shields of hardwood slats. No long blade comes off these anvils." },
    stables: { horses: [], note: "No horse in this country. The llama trains walk their loads up the passes and will not carry a man at all." },
    inn: {
      name: "the chicha house by the tambo",
      rumors: [
        "The Sapa Inca holds Cusco, and the dead ones keep their estates and their servants still. A new Inca inherits the name and no land, so he takes more or he is nothing. Two hold court now, Cusco and Quito, and neither yields.",
        "The fight opens with stones. A sling stone off the height breaks a helmet at a hundred paces, and they drop them on you before you see a face. The maces come down the slope after. Meet them on the flat, if you find any.",
        "Half these provinces were taken inside two lifetimes, and whole villages were moved off their own fields after. The Canari and the Chachapoya count their dead still. They march when Cusco calls, and they will march the other way.",
      ],
    },
    markup: 2.5,
  },
  mongolia: {
    id: "mongolia",
    enter: "You are on the grass. No wall, no gate, no road worth the name — only tracks, and riders on every one of them.",
    army: {
      style: "spearman",
      eliteName: "Noyan",
      elitePlural: "Noyans",
      eliteNote: "Lance couched, and he comes through at a canter with the horse's weight behind it. The ten behind him fill the hole he makes.",
      armyNote: "No line to break. Horse archers on both wings shooting as they wheel, lancers held back, and a camp that will be somewhere else tomorrow.",
      capitalWarning: "Karakorum is a camp, not a city. Burn it and you have burned tents, and every rider on the grass now knows exactly where you are.",
      villageNote: "A dozen tents and a horse line, and every man in it has shot from the saddle since he was six. They will be gone by morning if you give them one.",
    },
    barracksLocked: "a man rides for his own ten, and his ten for its own thousand",
    forge: { items: ["leather", "composite"], swordMaxTier: 1, note: "Horn and sinew glued and left a year to set. The bow is everything here; a blade is what you carry for after." },
    stables: { horses: ["courser"], note: "Every man has five and rides them in turn, so none is ever blown. You will be sold the worst of somebody's string." },
    inn: {
      name: "the airag tent by the horse lines",
      rumors: [
        "The Khan's word runs from the Kherlen to wherever his riders have got to this season, and no further. A camp that misses two musters is not punished. It is simply no longer counted, and nobody comes when it is raided.",
        "They shoot at a full gallop, which nobody else on the chart can do, and they never stand to take a charge. Ride at them and they open, shoot you as you pass, and close behind you. The only ground you beat them on is ground they cannot ride around.",
        "There are no granaries to burn and no walls to sit outside. A camp moves the day after it is threatened, and everything it owns goes with it. Whoever holds the wells at the end of a dry summer holds the grass, and the grass is the country.",
      ],
    },
    markup: 2,
  },
};
/** The realms whose gates are open to a foreigner on foot. */
export function openRealms() { return Object.keys(REALM_VISITS); }
export function visitOf(realm: string): RealmVisit | null { return REALM_VISITS[realm] ?? null; }
export function reachOf(realm: string): 'land' | 'sea' { return REALM_VISITS[realm] ? 'land' : 'sea'; }
