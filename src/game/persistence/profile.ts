import { CONFIG } from '../model/config';
import type { LevelId, ToolId } from '../model/types';
import { getLevel, isLevelId, LEVEL_ORDER } from '../content/campaign';

/** Player progress that spans levels. Lives apart from each level's map save. */
export interface LevelRecord {
  completed: boolean;
  /** Skipped without finishing: unlocks the next level but earns no stars or XP. */
  skipped: boolean;
  stars: number;
  bestSeconds: number;
  bestSpent: number;
}

export type Quality = 'auto' | 'high' | 'medium' | 'low' | 'classic';

export interface ProfileSettings {
  sound: boolean;
  /** 0..1 master volume. */
  volume: number;
  reducedMotion: boolean;
  speed: 1 | 2 | 4;
  quality: Quality;
  textScale: 1 | 1.15 | 1.3;
}

export interface Profile {
  version: 3;
  currentLevel: LevelId;
  xp: number;
  levels: Partial<Record<LevelId, LevelRecord>>;
  seenToolIntros: ToolId[];
  settings: ProfileSettings;
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  sound: false,
  volume: 0.7,
  reducedMotion: false,
  speed: 1,
  quality: 'auto',
  textScale: 1,
};

export function defaultProfile(): Profile {
  return { version: 3, currentLevel: LEVEL_ORDER[0], xp: 0, levels: {}, seenToolIntros: [], settings: { ...DEFAULT_SETTINGS } };
}

const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

function sanitizeSettings(raw: unknown): ProfileSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const speed = r.speed === 2 || r.speed === 4 ? r.speed : 1;
  const quality: Quality = ['auto', 'high', 'medium', 'low', 'classic'].includes(r.quality as string) ? (r.quality as Quality) : 'auto';
  const textScale = r.textScale === 1.15 || r.textScale === 1.3 ? r.textScale : 1;
  return {
    sound: r.sound === true,
    volume: num(r.volume, DEFAULT_SETTINGS.volume, 0, 1),
    reducedMotion: r.reducedMotion === true,
    speed,
    quality,
    textScale,
  };
}

/** Repair anything malformed; never throws. */
export function sanitizeProfile(raw: unknown): Profile {
  const p = defaultProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Record<string, unknown>;
  p.xp = num(r.xp, 0, 0);
  if (r.levels && typeof r.levels === 'object') {
    for (const [id, rec] of Object.entries(r.levels as Record<string, unknown>)) {
      if (!isLevelId(id) || !rec || typeof rec !== 'object') continue;
      const x = rec as Record<string, unknown>;
      p.levels[id] = {
        completed: x.completed === true,
        skipped: x.skipped === true,
        stars: num(x.stars, 0, 0, 3),
        bestSeconds: num(x.bestSeconds, 0, 0),
        bestSpent: num(x.bestSpent, 0, 0),
      };
    }
  }
  if (Array.isArray(r.seenToolIntros)) p.seenToolIntros = r.seenToolIntros.filter((t): t is ToolId => typeof t === 'string');
  p.settings = sanitizeSettings(r.settings);
  p.currentLevel = isLevelId(r.currentLevel) && isLevelUnlocked(p, r.currentLevel) ? r.currentLevel : LEVEL_ORDER[0];
  return p;
}

function finishedOrSkipped(p: Profile, id: LevelId): boolean {
  const rec = p.levels[id];
  return !!rec && (rec.completed || rec.skipped);
}

/** Level 1 is always open; each level opens when the previous one is finished or skipped. */
export function isLevelUnlocked(p: Profile, id: LevelId): boolean {
  if (id === 'sandbox') return finishedOrSkipped(p, 'village');
  const i = LEVEL_ORDER.indexOf(id);
  if (i <= 0) return i === 0;
  return finishedOrSkipped(p, LEVEL_ORDER[i - 1]);
}

export interface CompletionResult {
  xpGained: number;
  firstTime: boolean;
  improved: boolean;
  previousStars: number;
}

/** Record a finished level. XP is paid once per level, plus only star improvements. */
export function recordCompletion(p: Profile, id: LevelId, stars: number, seconds: number, spent: number): CompletionResult {
  const level = getLevel(id);
  const prev = p.levels[id];
  const firstTime = !prev?.completed;
  const previousStars = prev?.completed ? prev.stars : 0;
  const bestStars = Math.max(previousStars, stars);
  let xpGained = (bestStars - previousStars) * CONFIG.progression.starXp;
  if (firstTime) xpGained += level.xp;
  p.levels[id] = {
    completed: true,
    skipped: false,
    stars: bestStars,
    bestSeconds: prev?.completed && prev.bestSeconds > 0 ? Math.min(prev.bestSeconds, seconds) : seconds,
    bestSpent: prev?.completed ? Math.min(prev.bestSpent, spent) : spent,
  };
  p.xp += xpGained;
  return { xpGained, firstTime, improved: bestStars > previousStars, previousStars };
}

export function recordSkip(p: Profile, id: LevelId): void {
  const prev = p.levels[id];
  if (prev?.completed) return;
  p.levels[id] = { completed: false, skipped: true, stars: 0, bestSeconds: 0, bestSpent: 0 };
}

export function totalStars(p: Profile): number {
  return Object.values(p.levels).reduce((s, r) => s + (r?.completed ? r.stars : 0), 0);
}

const V2_LESSONS: Record<string, LevelId> = {
  'lesson-1': 'first-canal',
  'lesson-2': 'downhill',
  'lesson-3': 'gates-harvest',
  'lesson-4': 'save-rain',
  'lesson-5': 'wheel-light',
  village: 'village',
};

export function levelIdFromV2(id: unknown): LevelId | null {
  return typeof id === 'string' && id in V2_LESSONS ? V2_LESSONS[id] : null;
}

/**
 * Convert a v2 profile ({ currentScenario, completedLessons }) to v3. Completed lessons
 * count as finished with one star; a legacy village save implies all lessons were done.
 */
export function migrateProfileV2(old: unknown, hasVillageSave: boolean, legacySettings?: unknown): Profile {
  const p = defaultProfile();
  const o = (old && typeof old === 'object' ? old : {}) as Record<string, unknown>;
  const completed = new Set<LevelId>();
  if (Array.isArray(o.completedLessons)) {
    for (const id of o.completedLessons) {
      const mapped = levelIdFromV2(id);
      if (mapped && mapped !== 'village') completed.add(mapped);
    }
  }
  if (hasVillageSave) for (const id of LEVEL_ORDER.slice(0, 5)) completed.add(id);
  for (const id of LEVEL_ORDER) {
    if (!completed.has(id)) continue;
    p.levels[id] = { completed: true, skipped: false, stars: 1, bestSeconds: 0, bestSpent: 0 };
    p.xp += getLevel(id).xp + CONFIG.progression.starXp;
  }
  // Players who already reached the old village keep it: the new levels before it count as skipped.
  if (hasVillageSave) {
    for (const id of LEVEL_ORDER.slice(5, LEVEL_ORDER.indexOf('village'))) {
      p.levels[id] = { completed: false, skipped: true, stars: 0, bestSeconds: 0, bestSpent: 0 };
    }
  }
  const current = levelIdFromV2(o.currentScenario);
  p.currentLevel = current && isLevelUnlocked(p, current) ? current : firstOpenLevel(p);
  if (legacySettings) {
    const ls = legacySettings as Record<string, unknown>;
    p.settings = sanitizeSettings({ sound: ls.sound, reducedMotion: ls.reducedMotion, speed: ls.speed });
  }
  return p;
}

/** The first level not yet finished (or the sandbox when everything is done). */
export function firstOpenLevel(p: Profile): LevelId {
  for (const id of LEVEL_ORDER) if (!p.levels[id]?.completed && isLevelUnlocked(p, id)) return id;
  return isLevelUnlocked(p, 'sandbox') ? 'sandbox' : LEVEL_ORDER[0];
}
