import type { GameState, LevelId } from '../model/types';
import { isLevelId } from '../content/campaign';
import { migrateSave, type LoadResult } from './migrations';
import { defaultProfile, migrateProfileV2, sanitizeProfile, type Profile } from './profile';

/** Optional backend seam (e.g. future cloud sync). Gameplay never depends on it. */
export interface SaveRepository {
  load(levelId: LevelId): LoadResult;
  save(state: GameState): boolean;
  clear(levelId?: LevelId): void;
  loadProfile(): { profile: Profile; upgraded: boolean };
  saveProfile(profile: Profile): boolean;
}

/** Minimal Storage surface, so tests can pass an in-memory store. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

const PREFIX = 'aqua-vault:v3:level:';
const PROFILE_KEY = 'aqua-vault:v3:profile';
const SLOTS = ['a', 'b'] as const;

// v2 layout, read once for the upgrade.
const V2_PROFILE_KEY = 'aqua-vault:profile';
const V2_PREFIX = 'aqua-vault:save:';
const V2_VILLAGE_KEYS = [`${V2_PREFIX}village:a`, `${V2_PREFIX}village:b`, `${V2_PREFIX}a`, `${V2_PREFIX}b`];

interface Envelope {
  savedAt: number;
  state: GameState;
}

function browserStorage(): KeyValueStore | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function slotKey(levelId: LevelId, slot: (typeof SLOTS)[number]): string {
  return `${PREFIX}${levelId}:${slot}`;
}

function readEnvelope(store: KeyValueStore, key: string): Envelope | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope;
    return env && typeof env.savedAt === 'number' && env.state ? env : null;
  } catch {
    return null;
  }
}

/**
 * localStorage repository: one profile, plus two alternating generations per level so a
 * write interrupted mid-way never destroys the last good save.
 */
export class LocalSaveRepository implements SaveRepository {
  private nextSlot = new Map<LevelId, number>();
  /** Strictly increasing save stamps, so two saves in one millisecond still order correctly. */
  private lastStamp = 0;

  constructor(private readonly storeOverride?: KeyValueStore | null) {}

  private get store(): KeyValueStore | null {
    return this.storeOverride !== undefined ? this.storeOverride : browserStorage();
  }

  load(levelId: LevelId): LoadResult {
    const store = this.store;
    if (!store) return { ok: false, reason: 'empty', message: 'Storage unavailable' };
    const envelopes: { slot: number; env: Envelope }[] = [];
    SLOTS.forEach((slot, k) => {
      const env = readEnvelope(store, slotKey(levelId, slot));
      if (env) envelopes.push({ slot: k, env });
    });
    envelopes.sort((a, b) => b.env.savedAt - a.env.savedAt);
    let sawFuture: LoadResult | null = null;
    for (const { slot, env } of envelopes) {
      const res = migrateSave(env.state);
      if (res.ok && res.state.levelId === levelId) {
        this.nextSlot.set(levelId, (slot + 1) % SLOTS.length);
        this.lastStamp = Math.max(this.lastStamp, env.savedAt);
        return res;
      }
      if (!res.ok && res.reason === 'future') sawFuture = res;
    }
    if (sawFuture) return sawFuture;
    return envelopes.length ? { ok: false, reason: 'corrupt', message: 'Saved level could not be read' } : { ok: false, reason: 'empty', message: 'No save yet' };
  }

  save(state: GameState): boolean {
    const store = this.store;
    if (!store || !isLevelId(state.levelId)) return false;
    try {
      const slot = this.nextSlot.get(state.levelId) ?? 0;
      this.lastStamp = Math.max(Date.now(), this.lastStamp + 1);
      const env: Envelope = { savedAt: this.lastStamp, state };
      store.setItem(slotKey(state.levelId, SLOTS[slot]), JSON.stringify(env));
      this.nextSlot.set(state.levelId, (slot + 1) % SLOTS.length);
      return true;
    } catch {
      return false;
    }
  }

  clear(levelId?: LevelId): void {
    const store = this.store;
    if (!store) return;
    try {
      if (levelId) {
        for (const s of SLOTS) store.removeItem(slotKey(levelId, s));
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

  loadProfile(): { profile: Profile; upgraded: boolean } {
    const store = this.store;
    if (!store) return { profile: defaultProfile(), upgraded: false };
    try {
      const raw = store.getItem(PROFILE_KEY);
      if (raw) return { profile: sanitizeProfile(JSON.parse(raw)), upgraded: false };
    } catch {
      return { profile: defaultProfile(), upgraded: false };
    }
    return this.upgradeFromV2(store);
  }

  /**
   * One-time upgrade from the v2 layout: map lesson progress onto the campaign and carry
   * the village save over. Old keys are removed only after every v3 write succeeded.
   */
  private upgradeFromV2(store: KeyValueStore): { profile: Profile; upgraded: boolean } {
    let oldProfile: unknown = null;
    try {
      const raw = store.getItem(V2_PROFILE_KEY);
      if (raw) oldProfile = JSON.parse(raw);
    } catch {
      oldProfile = null;
    }
    const villageEnvs = V2_VILLAGE_KEYS.map((k) => readEnvelope(store, k)).filter((e): e is Envelope => !!e);
    villageEnvs.sort((a, b) => b.savedAt - a.savedAt);
    if (!oldProfile && villageEnvs.length === 0) return { profile: defaultProfile(), upgraded: false };

    let village: GameState | null = null;
    let legacySettings: unknown;
    for (const env of villageEnvs) {
      const res = migrateSave(env.state);
      if (res.ok && res.state.levelId === 'village') {
        village = res.state;
        legacySettings = res.legacySettings;
        break;
      }
    }
    const profile = migrateProfileV2(oldProfile, !!village, legacySettings);
    let ok = this.saveProfile(profile);
    if (village) {
      ok = this.save(village) && ok;
    }
    if (ok) {
      try {
        store.removeItem(V2_PROFILE_KEY);
        for (let i = store.length - 1; i >= 0; i--) {
          const k = store.key(i);
          if (k && k.startsWith(V2_PREFIX)) store.removeItem(k);
        }
      } catch {
        /* leave the old keys; they are harmless */
      }
    }
    return { profile, upgraded: true };
  }

  saveProfile(profile: Profile): boolean {
    const store = this.store;
    if (!store) return false;
    try {
      store.setItem(PROFILE_KEY, JSON.stringify(profile));
      return true;
    } catch {
      return false;
    }
  }
}

/** In-memory store for tests and private-mode fallbacks. */
export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('quota');
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
}
