import type { ToolId } from '../model/types';

export interface ToolInfo {
  id: ToolId;
  name: string;
  bn?: string;
  short: string;
  /** One-line description for the tool bar help. */
  description: string;
  icon: string;
  /** Tool introduction card: what it does, where it goes, what it needs. */
  intro?: { does: string; where: string; needs: string };
}

export const TOOL_INFO: Record<ToolId, ToolInfo> = {
  inspect: {
    id: 'inspect',
    name: 'Inspect',
    short: 'Inspect',
    description: 'Tap anything to see what it needs. Harvest, stock and open gates here. Drag to look around.',
    icon: 'inspect',
  },
  canal: {
    id: 'canal',
    name: 'Canal',
    bn: 'খাল',
    short: 'Canal',
    description: 'Drag to dig a channel. Water runs downhill through canals much faster than over soil.',
    icon: 'canal',
    intro: { does: 'Digs a channel that carries water.', where: 'Drag across soil. Not through rock.', needs: 'A downhill route from water.' },
  },
  erase: {
    id: 'erase',
    name: 'Erase',
    short: 'Erase',
    description: 'Drag over canals or tap a building to remove it. Canal tiles return to your free canals.',
    icon: 'erase',
  },
  gate: {
    id: 'gate',
    name: 'Gate',
    short: 'Gate',
    description: 'Place on a canal. Inspect it to open or close it and choose where water goes.',
    icon: 'gate',
    intro: { does: 'Stops or lets water through one canal tile.', where: 'On a canal tile.', needs: 'Inspect it to open or close.' },
  },
  bridge: {
    id: 'bridge',
    name: 'Bamboo bridge',
    bn: 'সাঁকো',
    short: 'Bridge',
    description: 'A bamboo footbridge over a canal. Decoration only.',
    icon: 'bridge',
    intro: { does: 'Decoration: a sanko footbridge.', where: 'Across an open canal.', needs: 'Nothing. Purely for beauty.' },
  },
  field: {
    id: 'field',
    name: 'Rice paddy',
    bn: 'ধানক্ষেত',
    short: 'Paddy',
    description: 'Drinks from a wet tile beside it at the same height or higher. Harvest gold rice for materials.',
    icon: 'field',
    intro: { does: 'Grows rice you can harvest.', where: 'Flat open soil.', needs: 'A wet tile beside it, not lower.' },
  },
  reservoir: {
    id: 'reservoir',
    name: 'Reservoir',
    short: 'Reservoir',
    description: 'Stores up to 220 water. Fills from higher ground, drains to lower. Best in a basin.',
    icon: 'reservoir',
    intro: { does: 'Stores water for dry spells.', where: 'Flat ground, ideally a basin.', needs: 'A canal flowing into it.' },
  },
  turbine: {
    id: 'turbine',
    name: 'Waterwheel',
    short: 'Wheel',
    description: 'Place on a canal or stream where it steps downhill. Power = flow × drop. Water passes through.',
    icon: 'turbine',
    intro: { does: 'Turns moving water into power.', where: 'On a canal or stream tile.', needs: 'A lower tile right next to it.' },
  },
  battery: {
    id: 'battery',
    name: 'Battery',
    short: 'Battery',
    description: 'Stores 120 power from waterwheels and lights the homes.',
    icon: 'battery',
    intro: { does: 'Stores power from waterwheels.', where: 'Any dry ground.', needs: 'A spinning waterwheel.' },
  },
  treatment: {
    id: 'treatment',
    name: 'Treatment plant',
    short: 'Treat',
    description: 'Takes raw water from a wet tile beside it, plus power, and makes clean drinking water.',
    icon: 'treatment',
    intro: { does: 'Makes clean, safe drinking water.', where: 'Dry flat ground beside water.', needs: 'Raw water and power.' },
  },
  connector: {
    id: 'connector',
    name: 'Home tap',
    short: 'Tap',
    description: 'Place right beside a home. Pipes clean water from a treatment plant up to 10 tiles away.',
    icon: 'connector',
    intro: { does: 'Pipes clean water into a home.', where: 'Right beside a house.', needs: 'A treatment plant within 10 tiles.' },
  },
  fishpond: {
    id: 'fishpond',
    name: 'Fish pond',
    bn: 'পুকুর',
    short: 'Pond',
    description: 'Fill above 65, then stock fish. Water flowing in and out keeps it fresh.',
    icon: 'fishpond',
    intro: { does: 'Raises fish you can harvest.', where: 'Flat ground, ideally a basin.', needs: 'Fresh water flowing in and out.' },
  },
  wetland: {
    id: 'wetland',
    name: 'Wetland',
    short: 'Wetland',
    description: 'Shallow water on low ground (height 2 or less) grows reeds, shāpla and wildlife.',
    icon: 'wetland',
    intro: { does: 'Brings reeds, shāpla and birds back.', where: 'Low ground, height 2 or less.', needs: 'Steady shallow water.' },
  },
  floating: {
    id: 'floating',
    name: 'Floating garden',
    bn: 'ধাপ',
    short: 'Float',
    description: 'Place on a pond or wetland. Vegetables grow on beds that rise with the water.',
    icon: 'floating',
    intro: { does: 'Grows vegetables on the water.', where: 'On a wetland or fish pond.', needs: 'The host at least 40% full.' },
  },
  pump: {
    id: 'pump',
    name: 'Pump',
    short: 'Pump',
    description: 'Uses power to move water from the tile behind it to the tile it faces, even uphill.',
    icon: 'pump',
    intro: { does: 'Lifts water uphill using power.', where: 'Dry ground between water and target.', needs: 'Power. Rotate it to aim.' },
  },
  fountain: {
    id: 'fountain',
    name: 'Fountain',
    short: 'Fountain',
    description: 'A powered fountain. Beside a fish pond it aerates the water and keeps it fresher.',
    icon: 'fountain',
    intro: { does: 'Aerates a fish pond.', where: 'Right beside a pond or water.', needs: 'A little power.' },
  },
};

/** Tool bar order, by when each tool is introduced. */
export const TOOL_ORDER: ToolId[] = [
  'inspect', 'canal', 'gate', 'field', 'reservoir', 'turbine', 'battery', 'treatment', 'connector',
  'fishpond', 'wetland', 'floating', 'pump', 'fountain', 'bridge', 'erase',
];

export const STATUS_TEXT: Record<string, string> = {
  needsFlow: 'Needs a connection to flowing water',
  needsHead: 'Needs elevation drop',
  needsPower: 'Needs electricity',
  pumpNoPower: 'Pump needs electricity',
  pumpNoWater: 'Nothing to pump: intake is dry',
  pumpBlocked: 'Outlet is full or blocked',
  treatNoRaw: 'Treatment needs raw water from an adjacent canal',
  treatNoPower: 'Treatment needs energy (build a waterwheel)',
  treatFull: 'Clean tank full: add a home tap nearby',
  pondLow: 'Pond needs more water',
  pondStagnant: 'Pond water is stagnant: give it a gentle inflow',
  notStocked: 'Ready for fish: stock the pond',
  dry: 'Dry: needs a wet tile beside it, at the same height or higher',
  drying: 'Drying out: re-water to keep growing',
  ripe: 'Ready to harvest',
  noClean: 'Waiting for clean water from the treatment plant',
  tooFar: 'No treatment plant within 10 tiles of the tap',
  noTap: 'No tap: place a Home tap beside this house',
  noBattery: 'Lights need a battery charged by a waterwheel',
  hostLow: 'Host water too low',
  full: 'Full: overflow continues downstream',
  wetlandDry: 'Needs sustained shallow water',
  idle: 'Idle',
  noWater: 'Needs water nearby',
};

export const SCIENCE_NOTE =
  'Inspired by real science; simplified for play. Micro-turbines and compact treatment plants are science-fiction miniatures. ' +
  'Game units are not litres or kWh. Real rainwater can carry germs and chemicals depending on how it is collected; ' +
  'boiling kills many germs but does NOT remove toxic chemicals. Never use this game as advice on drinking-water safety.';

export const SAVE_NOTE =
  'Your village is saved only in this browser. Clearing browser data or switching devices loses it.';

export const WEATHER_LABEL: Record<string, { en: string; bn: string }> = {
  drizzle: { en: 'Drizzle', bn: 'গুঁড়ি বৃষ্টি' },
  rain: { en: 'Monsoon rain', bn: 'বৃষ্টি' },
  heavy: { en: 'Heavy rain', bn: 'ভারী বৃষ্টি' },
  dry: { en: 'Dry spell', bn: 'শুকনো' },
};
