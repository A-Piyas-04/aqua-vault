import type { GameState, ScenarioId } from '../model/types';
import { isScenarioId } from '../content/scenarios';
import { migrateSave, type LoadResult } from './migrations';

/** Optional backend seam (e.g. future cloud sync). Gameplay never depends on it. */
export interface SaveRepository {
  load(scenarioId?: ScenarioId): LoadResult;
  save(state: GameState): boolean;
  clear(scenarioId?: ScenarioId): void;
  loadProfile(): PlayerProfile;
  saveProfile(profile: PlayerProfile): boolean;
}

const PREFIX = 'aqua-vault:save:';
const LEGACY_PREFIX = 'aqua-vault:save:';
const PROFILE_KEY = 'aqua-vault:profile';
const SLOTS = ['a', 'b'] as const;

export interface PlayerProfile {
  currentScenario: ScenarioId;
  completedLessons: string[];
  unlockedJournal: string[];
}

export const DEFAULT_PROFILE: PlayerProfile = {
  currentScenario: 'lesson-1',
  completedLessons: [],
  unlockedJournal: [],
};

interface Envelope {
  savedAt: number;
  state: GameState;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

function slotKey(scenarioId: ScenarioId, slot: (typeof SLOTS)[number]): string {
  return `${PREFIX}${scenarioId}:${slot}`;
}

/**
 * localStorage repository keeping two alternating generations per scenario, so a write
 * interrupted mid-way never destroys the last good save.
 */
export class LocalSaveRepository implements SaveRepository {
  private nextSlot = 0;

  load(scenarioId: ScenarioId = 'village'): LoadResult {
    const store = getStorage();
    if (!store) return { ok: false, reason: 'empty', message: 'Storage unavailable' };
    const envelopes: { slot: number; env: Envelope }[] = [];
    let sawFuture: LoadResult | null = null;
    const keys = SLOTS.map((slot, k) => ({ k, key: slotKey(scenarioId, slot) }));
    if (scenarioId === 'village') {
      SLOTS.forEach((slot, k) => keys.push({ k, key: LEGACY_PREFIX + slot }));
    }
    const seen = new Set<string>();
    for (const { k, key } of keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const raw = store.getItem(key);
        if (!raw) continue;
        const env = JSON.parse(raw) as Envelope;
        if (env && typeof env.savedAt === 'number' && env.state) envelopes.push({ slot: k, env });
      } catch {
        /* ignore a corrupt generation, fall back to the other */
      }
    }
    envelopes.sort((a, b) => b.env.savedAt - a.env.savedAt);
    for (const { slot, env } of envelopes) {
      const res = migrateSave(env.state);
      if (res.ok) {
        if (res.state.scenarioId !== scenarioId && scenarioId !== 'village') continue;
        this.nextSlot = (slot + 1) % SLOTS.length;
        return res;
      }
      if (res.reason === 'future') sawFuture = res;
    }
    if (sawFuture) return sawFuture;
    return envelopes.length ? { ok: false, reason: 'corrupt', message: 'Saved world could not be read' } : { ok: false, reason: 'empty', message: 'No save yet' };
  }

  save(state: GameState): boolean {
    const store = getStorage();
    if (!store) return false;
    try {
      const id = isScenarioId(state.scenarioId) ? state.scenarioId : 'village';
      const env: Envelope = { savedAt: Date.now(), state };
      store.setItem(slotKey(id, SLOTS[this.nextSlot]), JSON.stringify(env));
      this.nextSlot = (this.nextSlot + 1) % SLOTS.length;
      return true;
    } catch {
      return false;
    }
  }

  clear(scenarioId?: ScenarioId): void {
    const store = getStorage();
    if (!store) return;
    try {
      if (scenarioId) {
        for (const s of SLOTS) store.removeItem(slotKey(scenarioId, s));
        if (scenarioId === 'village') for (const s of SLOTS) store.removeItem(LEGACY_PREFIX + s);
      } else {
        for (let i = store.length - 1; i >= 0; i--) {
          const k = store.key(i);
          if (k && k.startsWith(PREFIX)) store.removeItem(k);
        }
      }
    } catch {
      /* private mode etc. */
    }
  }

  loadProfile(): PlayerProfile {
    const store = getStorage();
    const fallback = { ...DEFAULT_PROFILE };
    if (!store) return fallback;
    try {
      const raw = store.getItem(PROFILE_KEY);
      if (!raw) {
        const legacy = store.getItem(LEGACY_PREFIX + 'a') || store.getItem(LEGACY_PREFIX + 'b');
        if (legacy) {
          return { currentScenario: 'village', completedLessons: [...LESSON_IDS, 'village'], unlockedJournal: [] };
        }
        return fallback;
      }
      const p = JSON.parse(raw) as Partial<PlayerProfile>;
      const current = isScenarioId(p.currentScenario) ? p.currentScenario : 'lesson-1';
      const completed = Array.isArray(p.completedLessons) ? p.completedLessons.filter((x) => typeof x === 'string') : [];
      const journal = Array.isArray(p.unlockedJournal) ? p.unlockedJournal.filter((x) => typeof x === 'string') : [];
      return { currentScenario: current, completedLessons: completed, unlockedJournal: journal };
    } catch {
      return fallback;
    }
  }

  saveProfile(profile: PlayerProfile): boolean {
    const store = getStorage();
    if (!store) return false;
    try {
      store.setItem(PROFILE_KEY, JSON.stringify(profile));
      return true;
    } catch {
      return false;
    }
  }
}

const LESSON_IDS = ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5'];
