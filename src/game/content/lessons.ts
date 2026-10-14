import { CONFIG } from '../model/config';
import type { GameState, ScenarioId, ToolId } from '../model/types';
import { GATE_CLOSED } from '../model/types';
import { isRipe } from '../sim/consumers';

export interface LessonStepDef {
  title: string;
  bn?: string;
  text: string;
  careful?: string[];
  highlightPath?: { x: number; y: number }[];
  highlightZone?: { x: number; y: number; w: number; h: number };
  highlightCells?: { x: number; y: number }[];
  pointer?: { x: number; y: number };
  pulseTool?: ToolId;
  /** When true, the step completes as soon as `pulseTool` is the active tool. */
  waitForTool?: boolean;
  showHeights?: boolean;
  done: (s: GameState) => boolean;
}

export interface LessonDef {
  id: string;
  scenarioId: ScenarioId;
  title: string;
  bn?: string;
  steps: LessonStepDef[];
  careful: string[];
}

function idx(s: GameState, x: number, y: number): number {
  return y * s.grid.w + x;
}

function wetCanal(s: GameState): boolean {
  return s.grid.canal.some((c, i) => c === 1 && s.grid.water[i] > 0.3);
}

function fieldWet(s: GameState): boolean {
  return s.buildings.some((b) => b.type === 'field' && b.water >= CONFIG.field.wetMoisture);
}

function hasBuilding(s: GameState, type: string): boolean {
  return s.buildings.some((b) => b.type === type);
}

export const LESSONS: LessonDef[] = [
  {
    id: 'lesson-1',
    scenarioId: 'lesson-1',
    title: 'First Canal',
    bn: 'প্রথম খাল',
    careful: [
      'Canals cannot cross rock — go around the stones.',
      'Water needs a connected channel; a gap of dry soil stops the flow.',
      'The first canal tiles are free. After that, digging costs materials.',
    ],
    steps: [
      {
        title: 'Rain collects here',
        bn: 'বৃষ্টি',
        text: 'Rain is filling the catchment — the spring pool at the top-left. That is where water begins.',
        highlightCells: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
        pointer: { x: 1, y: 1 },
        done: (s) => s.tick >= 8,
      },
      {
        title: 'Choose Canal',
        bn: 'খাল',
        text: 'Select the Canal tool. You will drag a channel from the spring to the dry rice paddy.',
        pulseTool: 'canal',
        waitForTool: true,
        done: () => true,
      },
      {
        title: 'Dig to the paddy',
        text: 'Drag along the glowing path from the spring down to the dry paddy. Water only moves through connected tiles.',
        highlightPath: [
          { x: 2, y: 2 },
          { x: 3, y: 2 },
          { x: 4, y: 2 },
          { x: 5, y: 2 },
          { x: 6, y: 2 },
          { x: 7, y: 2 },
          { x: 8, y: 2 },
          { x: 8, y: 3 },
        ],
        pulseTool: 'canal',
        careful: ['A gap of soil or a rock tile will stop the water.'],
        done: (s) => s.grid.canal.reduce((n, v) => n + v, 0) >= 4,
      },
      {
        title: 'Watch it flow',
        text: 'Water is travelling downhill along your canal. Wait until the paddy drinks — the soil will darken and green.',
        done: (s) => wetCanal(s) && fieldWet(s),
      },
      {
        title: 'Mistakes are cheap',
        text: 'Dug the wrong line? Use Undo, or pick Erase and drag over a canal. The paddy is already drinking — this lesson is done.',
        pulseTool: 'erase',
        careful: ['Undo restores a whole stroke. Erase refunds half the materials.'],
        done: (s) => fieldWet(s) && s.tick > 40,
      },
    ],
  },
  {
    id: 'lesson-2',
    scenarioId: 'lesson-2',
    title: 'Water Flows Downhill',
    bn: 'ঢাল বেয়ে',
    careful: [
      'Water cannot climb. A canal that runs uphill stays dry.',
      'Overflow spills onto soil as puddles and soaks in — it does not jump a ridge.',
      'Press H anytime to see ground heights. Lower numbers are downhill.',
    ],
    steps: [
      {
        title: 'See the heights',
        text: 'Press H (or use Settings) to show ground heights. The ridge in the middle is taller than the spring.',
        showHeights: true,
        highlightZone: { x: 4, y: 0, w: 3, h: 5 },
        done: (s) => s.tick >= 6,
      },
      {
        title: 'The short path is a trap',
        text: 'A straight canal into the rocks would climb from height 3 to 5. Water cannot do that. Go around the south, where the ground drops to 2.',
        highlightPath: [
          { x: 2, y: 3 },
          { x: 2, y: 4 },
          { x: 2, y: 5 },
          { x: 2, y: 6 },
          { x: 3, y: 6 },
          { x: 4, y: 6 },
          { x: 5, y: 6 },
          { x: 6, y: 6 },
          { x: 7, y: 6 },
          { x: 8, y: 6 },
          { x: 8, y: 5 },
          { x: 8, y: 4 },
          { x: 8, y: 3 },
          { x: 8, y: 2 },
        ],
        pulseTool: 'canal',
        careful: ['While you drag, uphill tiles turn red. Follow the downhill arrows.'],
        done: (s) => s.grid.canal.reduce((n, v) => n + v, 0) >= 6,
      },
      {
        title: 'Around, then down',
        text: 'Keep the canal on low ground until it touches the paddy. When water arrives, the field will drink.',
        pulseTool: 'canal',
        done: (s) => fieldWet(s),
      },
    ],
  },
  {
    id: 'lesson-3',
    scenarioId: 'lesson-3',
    title: 'Gates and Harvest',
    bn: 'গেট ও ফসল',
    careful: [
      'A closed gate stops all flow through that tile — both directions.',
      'A field that dries out stops growing. Re-water it to continue.',
      'Harvest only when the rice is gold. Inspect the paddy, then Harvest.',
    ],
    steps: [
      {
        title: 'Two paddies, one stream',
        text: 'A canal already splits toward two paddies. Both would drink if we leave it open. Place a Gate on the left branch (the canal tile west of the split).',
        highlightCells: [{ x: 4, y: 4 }],
        pointer: { x: 4, y: 4 },
        pulseTool: 'gate',
        done: (s) => s.grid.gate.some((v) => v > 0),
      },
      {
        title: 'Close the gate',
        text: 'Switch to Inspect, tap the gate, and close it. Water will stop on the left and keep feeding the right paddy.',
        pulseTool: 'inspect',
        careful: ['A closed gate is a wooden board across the channel, with an X.'],
        done: (s) => s.grid.gate.some((v) => v === GATE_CLOSED),
      },
      {
        title: 'Wait for gold',
        text: 'The right-hand paddy is almost ripe. When the rice turns gold, a sickle badge appears.',
        highlightZone: { x: 9, y: 5, w: 2, h: 2 },
        done: (s) => s.buildings.some((b) => b.type === 'field' && isRipe(b)),
      },
      {
        title: 'Harvest',
        bn: 'প্রথম ফসল',
        text: 'Pick Inspect, tap the gold paddy, and press Harvest. That gives materials and XP.',
        pulseTool: 'inspect',
        done: (s) => s.achievements.includes('first-harvest') || s.buildings.some((b) => b.type === 'field' && b.progress < CONFIG.field.ticksPerStage && s.tick > 10),
      },
    ],
  },
  {
    id: 'lesson-4',
    scenarioId: 'lesson-4',
    title: 'Save the Rain',
    bn: 'বৃষ্টি রাখো',
    careful: [
      'A reservoir fills and drains only by height: water flows in from higher neighbours and out to lower ones.',
      'When it is full, extra water overflows downstream.',
      'Build in a basin so the rim holds the water.',
    ],
    steps: [
      {
        title: 'The east basin',
        text: 'The hollow in the middle is a basin — the right place for a Reservoir. Select Reservoir and tap inside the glow.',
        highlightZone: { x: 6, y: 4, w: 4, h: 3 },
        pulseTool: 'reservoir',
        done: (s) => hasBuilding(s, 'reservoir'),
      },
      {
        title: 'Feed it from the stream',
        text: 'Dig a short canal from the river (top) down into the reservoir so monsoon water can fill it.',
        highlightPath: [
          { x: 7, y: 2 },
          { x: 7, y: 3 },
        ],
        pulseTool: 'canal',
        done: (s) => {
          const r = s.buildings.find((b) => b.type === 'reservoir');
          return !!r && (r.water > 8 || s.grid.canal.some((c, i) => c === 1 && s.grid.water[i] > 0.2));
        },
      },
      {
        title: 'Fill the tank',
        text: 'Watch the reservoir fill. The paddy beside it drinks from stored water, not only from rain.',
        done: (s) => {
          const r = s.buildings.find((b) => b.type === 'reservoir');
          return !!r && r.water >= CONFIG.reservoir.capacity * 0.2;
        },
      },
      {
        title: 'Dry spell',
        text: 'The rain is stopping. The reservoir should keep the paddy moist. If it dries, dig a better inlet from the stream.',
        careful: ['Without storage, a dry spell wilts the rice. With a full tank, the field keeps drinking.'],
        done: (s) => {
          const r = s.buildings.find((b) => b.type === 'reservoir');
          const f = s.buildings.find((b) => b.type === 'field');
          return !!r && r.water >= 15 && !!f && f.water >= CONFIG.field.wetMoisture * 0.5;
        },
      },
    ],
  },
  {
    id: 'lesson-5',
    scenarioId: 'lesson-5',
    title: 'Power and Light',
    bn: 'আলো জ্বালো',
    careful: [
      'No drop, or no flow, means no power. The wheel sits where the channel steps down.',
      'The wheel spins only while it is really generating.',
      'Batteries store the power. Homes draw a little every tick — at night the lights go out if the tank is empty.',
    ],
    steps: [
      {
        title: 'The drop',
        text: 'The stream steps down here. Place a Waterwheel on the higher tile, just before the drop.',
        highlightCells: [{ x: 5, y: 3 }],
        pointer: { x: 5, y: 3 },
        pulseTool: 'turbine',
        done: (s) => hasBuilding(s, 'turbine'),
      },
      {
        title: 'Let it spin',
        text: 'If the wheel is silent, it is in the wrong place or the stream is dry. It should sit on flowing water with a downhill neighbour.',
        done: (s) => s.buildings.some((b) => b.type === 'turbine' && b.rate > 0),
      },
      {
        title: 'Store the power',
        text: 'Place a Battery near the house. It stores electricity from the wheel.',
        highlightZone: { x: 2, y: 6, w: 4, h: 3 },
        pulseTool: 'battery',
        done: (s) => hasBuilding(s, 'battery'),
      },
      {
        title: 'Lights on',
        bn: 'গ্রামে আলো',
        text: 'When the battery holds a charge, the house lights up. You have finished the lessons — the village is next.',
        done: (s) => s.buildings.some((b) => b.type === 'house' && b.lit),
      },
    ],
  },
  {
    id: 'village',
    scenarioId: 'village',
    title: 'The Village',
    bn: 'গ্রাম',
    careful: [
      'Water only flows downhill. Press H to see heights.',
      'Each building only works when it is really connected — Inspect shows what is missing.',
      'Open the Journal anytime to re-read a lesson.',
    ],
    steps: [
      {
        title: 'Rain is filling the catchment',
        bn: 'বৃষ্টি',
        text: 'Drag along the glowing arrow to dig a canal from the spring (top-left) to the dry rice paddy.',
        highlightPath: [
          { x: 2, y: 3 },
          { x: 3, y: 3 },
          { x: 4, y: 3 },
          { x: 5, y: 3 },
          { x: 5, y: 4 },
          { x: 6, y: 4 },
          { x: 7, y: 4 },
          { x: 7, y: 5 },
        ],
        pulseTool: 'canal',
        done: (s) => s.achievements.includes('canal-delivered') || wetCanal(s),
      },
      {
        title: 'Watch it travel',
        text: 'Water only flows downhill. Watch it travel along your canal to the paddy.',
        done: (s) => s.achievements.includes('first-irrigation') || fieldWet(s),
      },
      {
        title: 'First irrigation',
        bn: 'প্রথম সেচ',
        text: 'When the rice turns gold, pick Inspect and tap the paddy to harvest.',
        pulseTool: 'inspect',
        done: (s) => s.achievements.includes('first-harvest'),
      },
      {
        title: 'Save the rain',
        text: 'Level 2 unlocks the Reservoir. The east basin glows — build there, then dig a short canal from the stream into it.',
        highlightZone: { x: 17, y: 3, w: 5, h: 5 },
        pulseTool: 'reservoir',
        done: (s) => hasBuilding(s, 'reservoir'),
      },
    ],
  },
];

export function lessonForScenario(id: ScenarioId): LessonDef | undefined {
  return LESSONS.find((l) => l.scenarioId === id);
}

function stepSatisfied(lesson: LessonDef, i: number, state: GameState, selectedTool?: ToolId): boolean {
  const st = lesson.steps[i];
  if (st.waitForTool) {
    if (selectedTool === st.pulseTool) return true;
    for (let j = i + 1; j < lesson.steps.length; j++) {
      if (!lesson.steps[j].waitForTool && lesson.steps[j].done(state)) return true;
    }
    return false;
  }
  return st.done(state);
}

export function currentLessonStep(state: GameState, skipped: boolean, selectedTool?: ToolId): { lesson: LessonDef; index: number; finished: boolean } | null {
  if (skipped) return null;
  const lesson = lessonForScenario(state.scenarioId);
  if (!lesson) return null;
  for (let i = 0; i < lesson.steps.length; i++) {
    if (!stepSatisfied(lesson, i, state, selectedTool)) return { lesson, index: i, finished: false };
  }
  return { lesson, index: lesson.steps.length, finished: true };
}

export function lessonComplete(state: GameState, selectedTool?: ToolId): boolean {
  const lesson = lessonForScenario(state.scenarioId);
  if (!lesson || !lesson.steps.length) return false;
  return lesson.steps.every((_, i) => stepSatisfied(lesson, i, state, selectedTool));
}

export interface JournalPage {
  title: string;
  bn?: string;
  text: string;
  careful?: string[];
}

export interface JournalEntry {
  id: string;
  title: string;
  bn?: string;
  order: number;
  /** Lesson id or achievement id that unlocks this entry. */
  unlock: { kind: 'lesson' | 'achievement'; key: string };
  pages: JournalPage[];
  replayScenario?: ScenarioId;
}

function pagesFromLesson(lesson: LessonDef): JournalPage[] {
  const pages: JournalPage[] = lesson.steps.map((st) => ({
    title: st.title,
    bn: st.bn,
    text: st.text,
    careful: st.careful,
  }));
  pages.push({ title: 'Careful', text: 'Things that can and cannot happen.', careful: lesson.careful });
  return pages;
}

export const JOURNAL: JournalEntry[] = [
  ...LESSONS.filter((l) => l.id !== 'village').map((l, i) => ({
    id: l.id,
    title: l.title,
    bn: l.bn,
    order: i + 1,
    unlock: { kind: 'lesson' as const, key: l.id },
    pages: pagesFromLesson(l),
    replayScenario: l.scenarioId,
  })),
  {
    id: 'village',
    title: 'The Village',
    bn: 'গ্রাম',
    order: 6,
    unlock: { kind: 'lesson', key: 'village' },
    pages: pagesFromLesson(LESSONS.find((l) => l.id === 'village')!),
    replayScenario: 'village',
  },
  {
    id: 'treatment',
    title: 'Clean drinking water',
    bn: 'বিশুদ্ধ পানি',
    order: 7,
    unlock: { kind: 'achievement', key: 'clean-water' },
    pages: [
      {
        title: 'Treatment plant',
        text: 'A treatment plant takes raw canal water plus electricity and fills a clean tank. Only that clean water is safe for homes.',
        careful: ['Raw rain and river water are never piped to taps. Homes need a treatment plant and a Home tap beside the house.'],
      },
    ],
  },
  {
    id: 'taps',
    title: 'Home taps',
    order: 8,
    unlock: { kind: 'achievement', key: 'house-supplied' },
    pages: [
      {
        title: 'Sealed pipes',
        text: 'Place a Home tap beside a house. Clean water travels from the plant through sealed pipes — you will see a pale-blue line.',
        careful: ['A tap with no treatment plant nearby does nothing. Inspect the house to see what is missing.'],
      },
    ],
  },
  {
    id: 'fishpond',
    title: 'Living pond',
    bn: 'পুকুর',
    order: 9,
    unlock: { kind: 'achievement', key: 'fish-stocked' },
    pages: [
      {
        title: 'Stock the pond',
        text: 'Fill a fish pond above 65, then Inspect and Stock. Fish need a gentle fresh inflow or the water goes stagnant.',
        careful: ['A full but stagnant pond will not grow healthy fish. Keep a canal feeding it.'],
      },
    ],
  },
  {
    id: 'wetland',
    title: 'Wetland in bloom',
    bn: 'শাপলা',
    order: 10,
    unlock: { kind: 'achievement', key: 'wetland-thrives' },
    pages: [
      {
        title: 'Shallow water, low ground',
        text: 'Wetlands need height 2 or less and sustained shallow water. Reeds and shāpla grow as the ecology rises.',
        careful: ['A dry wetland withers. Keep a little water on it, not a deep reservoir.'],
      },
    ],
  },
];

export function journalUnlockedIds(completedLessons: string[], achievements: string[]): string[] {
  const ids: string[] = [];
  for (const e of JOURNAL) {
    const ok = e.unlock.kind === 'lesson' ? completedLessons.includes(e.unlock.key) : achievements.includes(e.unlock.key);
    if (ok) ids.push(e.id);
  }
  return ids;
}

void idx;
