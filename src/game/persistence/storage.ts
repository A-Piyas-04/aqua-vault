import type { GameState } from '../model/types';
import { migrateSave, type LoadResult } from './migrations';

/** Optional backend seam (e.g. future cloud sync). Gameplay never depends on it. */
export interface SaveRepository {
  load(): LoadResult;
  save(state: GameState): boolean;
  clear(): void;
}

const PREFIX = 'aqua-vault:save:';
const SLOTS = ['a', 'b'] as const;

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
  // Frame-only data (flow vectors) is cheap to recompute but harmless; keep the save self-contained.
  return JSON.stringify(state);
}

/**
 * localStorage repository keeping two alternating generations, so a write
 * interrupted mid-way never destroys the last good save.
 */
export class LocalSaveRepository implements SaveRepository {
  private nextSlot = 0;

  load(): LoadResult {
    const store = getStorage();
    if (!store) return { ok: false, reason: 'empty', message: 'Storage unavailable' };
    const envelopes: { slot: number; env: Envelope }[] = [];
    let sawFuture: LoadResult | null = null;
    SLOTS.forEach((slot, k) => {
      try {
        const raw = store.getItem(PREFIX + slot);
        if (!raw) return;
        const env = JSON.parse(raw) as Envelope;
        if (env && typeof env.savedAt === 'number' && env.state) envelopes.push({ slot: k, env });
      } catch {
        /* ignore a corrupt generation, fall back to the other */
      }
    });
    envelopes.sort((a, b) => b.env.savedAt - a.env.savedAt);
    for (const { slot, env } of envelopes) {
      const res = migrateSave(env.state);
      if (res.ok) {
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
      const env: Envelope = { savedAt: Date.now(), state };
      store.setItem(PREFIX + SLOTS[this.nextSlot], JSON.stringify(env));
      this.nextSlot = (this.nextSlot + 1) % SLOTS.length;
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    const store = getStorage();
    if (!store) return;
    try {
      for (const s of SLOTS) store.removeItem(PREFIX + s);
    } catch {
      /* private mode etc. */
    }
  }
}
