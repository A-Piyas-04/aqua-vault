import type { ToolId } from '../model/types';

export interface ToolInfo {
  id: ToolId;
  name: string;
  bn?: string;
  short: string;
  description: string;
  icon: string;
}

export const TOOL_INFO: Record<ToolId, ToolInfo> = {
  inspect: {
    id: 'inspect',
    name: 'Inspect',
    short: 'Inspect',
    description: 'Tap anything to see its inputs, outputs and what it needs. Harvest and stock from here.',
    icon: 'inspect',
  },
  canal: {
    id: 'canal',
    name: 'Canal',
    bn: 'খাল',
    short: 'Canal',
    description: 'Drag to dig a channel. Water flows downhill through canals much faster than over soil.',
    icon: 'canal',
  },
  erase: {
    id: 'erase',
    name: 'Erase',
    short: 'Erase',
    description: 'Drag over canals or tap a building to remove it. Refunds half the cost.',
    icon: 'erase',
  },
  gate: {
    id: 'gate',
    name: 'Gate',
    short: 'Gate',
    description: 'Place on a canal, then tap to open or close it and redirect the flow.',
    icon: 'gate',
  },
  bridge: {
    id: 'bridge',
    name: 'Bamboo bridge',
    bn: 'সাঁকো',
    short: 'Bridge',
    description: 'A decorative bamboo footbridge over a canal. Purely for beauty.',
    icon: 'bridge',
  },
  field: {
    id: 'field',
    name: 'Rice paddy',
    bn: 'ধানক্ষেত',
    short: 'Paddy',
    description: 'Needs water from an adjacent wet tile at the same height or higher. Grows through four stages; harvest for materials.',
    icon: 'field',
  },
  reservoir: {
    id: 'reservoir',
    name: 'Reservoir',
    short: 'Reservoir',
    description: 'Stores up to 220 water. Water flows in and out by height. Best in a basin.',
    icon: 'reservoir',
  },
  turbine: {
    id: 'turbine',
    name: 'Waterwheel',
    short: 'Wheel',
    description: 'Place on a canal or stream where it drops downhill. Power = flow x head drop. Water passes through.',
    icon: 'turbine',
  },
  battery: {
    id: 'battery',
    name: 'Battery',
    short: 'Battery',
    description: 'Stores electricity from waterwheels (120 each) and powers the village lights.',
    icon: 'battery',
  },
  treatment: {
    id: 'treatment',
    name: 'Treatment plant',
    short: 'Treat',
    description: 'Takes raw water from an adjacent wet tile plus electricity; filters and disinfects it into clean drinking water.',
    icon: 'treatment',
  },
  connector: {
    id: 'connector',
    name: 'Home tap',
    short: 'Tap',
    description: 'Place next to a home. Delivers clean water from treatment plants through sealed pipes.',
    icon: 'connector',
  },
  fishpond: {
    id: 'fishpond',
    name: 'Fish pond',
    bn: 'পুকুর',
    short: 'Pond',
    description: 'Fill above 65/140, then stock fish. Fresh inflow keeps the pond healthy.',
    icon: 'fishpond',
  },
  wetland: {
    id: 'wetland',
    name: 'Wetland',
    short: 'Wetland',
    description: 'Shallow water on low ground (height 2 or less) grows reeds, shāpla and wildlife.',
    icon: 'wetland',
  },
  floating: {
    id: 'floating',
    name: 'Floating garden',
    bn: 'ধাপ',
    short: 'Float',
    description: 'Place on a pond or wetland. Vegetables grow on beds that rise with the water.',
    icon: 'floating',
  },
  pump: {
    id: 'pump',
    name: 'Pump',
    short: 'Pump',
    description: 'Uses electricity to lift water from behind it to the tile it faces. Tap to rotate in Inspect.',
    icon: 'pump',
  },
  fountain: {
    id: 'fountain',
    name: 'Fountain',
    short: 'Fountain',
    description: 'A small powered fountain beside water. Decorative; uses a little electricity.',
    icon: 'fountain',
  },
};

export const TOOL_ORDER: ToolId[] = [
  'inspect', 'canal', 'erase', 'gate', 'field', 'reservoir', 'turbine', 'battery',
  'treatment', 'connector', 'fishpond', 'wetland', 'floating', 'pump', 'bridge', 'fountain',
];

export const STATUS_TEXT: Record<string, string> = {
  needsFlow: 'Needs a connection to flowing water',
  needsHead: 'Needs elevation drop',
  needsPower: 'Needs electricity',
  pumpNoPower: 'Pump needs electricity',
  pumpNoWater: 'Nothing to pump: intake is dry',
  pumpBlocked: 'Outlet is full or blocked',
  treatNeeds: 'Treatment needs raw water and energy',
  treatNoRaw: 'Treatment needs raw water from an adjacent canal',
  treatNoPower: 'Treatment needs energy (build a waterwheel)',
  treatFull: 'Clean tank full: connect a home tap',
  pondLow: 'Pond needs more water',
  pondStagnant: 'Pond water is stagnant: give it a gentle inflow',
  notStocked: 'Ready for fish: stock the pond',
  dry: 'Water is flowing away from this field',
  drying: 'Drying out: re-water to keep growing',
  ripe: 'Ready to harvest',
  noClean: 'Needs clean water: connect a tap to a treatment plant',
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
