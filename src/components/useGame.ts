'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { GameController, SliceName, Slices } from '@/game/controller';

/** Subscribe to one controller slice; the component re-renders only when that slice changes. */
export function useSlice<K extends SliceName>(controller: GameController, name: K): Slices[K] {
  const subscribe = useCallback((fn: () => void) => controller.store.subscribe(name, fn), [controller, name]);
  const get = useCallback(() => controller.store.get(name), [controller, name]);
  return useSyncExternalStore(subscribe, get, get);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
