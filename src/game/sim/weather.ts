import { CONFIG } from '../model/config';
import type { GameState, WeatherMode } from '../model/types';
import { nextRandom } from './rng';

const MODES: WeatherMode[] = ['drizzle', 'rain', 'heavy', 'dry'];

function pickNext(state: GameState): WeatherMode {
  const prev = state.weather.mode;
  const weights = CONFIG.weather.weights;
  const options = MODES.filter((m) => m !== prev && !(prev === 'dry' && m === 'dry'));
  const total = options.reduce((s, m) => s + weights[m], 0);
  const r = nextRandom(state.rngState);
  state.rngState = r.state;
  let acc = r.value * total;
  for (const m of options) {
    acc -= weights[m];
    if (acc < 0) return m;
  }
  return options[options.length - 1];
}

function pickDuration(state: GameState, mode: WeatherMode): number {
  const r = nextRandom(state.rngState);
  state.rngState = r.state;
  const [lo, hi] =
    mode === 'dry'
      ? [CONFIG.weather.dryMinTicks, CONFIG.weather.dryMaxTicks]
      : [CONFIG.weather.minTicks, CONFIG.weather.maxTicks];
  return Math.round(lo + r.value * (hi - lo));
}

/** Advance the seeded weather; returns rain volume to add this tick. */
export function stepWeather(state: GameState): number {
  const w = state.weather;
  w.remaining -= 1;
  if (w.remaining <= 0) {
    const mode = pickNext(state);
    const d = pickDuration(state, mode);
    w.mode = mode;
    w.duration = d;
    w.remaining = d;
  }
  if (!state.flags.rain) return 0;
  return CONFIG.rain.perTick[w.mode];
}

/** 0..1 time of day; 0 = dawn, 0.5 = dusk. Purely presentational + house lighting. */
export function dayPhase(tick: number): number {
  return (tick % CONFIG.weather.dayLengthTicks) / CONFIG.weather.dayLengthTicks;
}

export function evaporationMultiplier(state: GameState): number {
  return state.weather.mode === 'dry' ? CONFIG.water.dryEvaporationMultiplier : 1;
}
