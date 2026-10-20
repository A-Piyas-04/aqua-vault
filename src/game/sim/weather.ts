import { CONFIG } from '../model/config';
import type { GameState, WeatherMode } from '../model/types';
import { getLevel, type WeatherStep } from '../content/campaign';
import { nextRandom } from './rng';

/** Open-ended scripted phases ("until an objective latches") report this many ticks left. */
const OPEN_ENDED = 9999;

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

export function scriptedWeather(step: WeatherStep): GameState['weather'] {
  const d = step.ticks ?? OPEN_ENDED;
  return { mode: step.mode, remaining: d, duration: d };
}

/** Scripted levels follow their weather steps deterministically; returns false when unscripted. */
function stepScript(state: GameState): boolean {
  const script = getLevel(state.levelId).weatherScript;
  if (!script || state.weatherStep < 0 || state.weatherStep >= script.steps.length) return false;
  const step = script.steps[state.weatherStep];
  let advance = false;
  if (step.until) advance = state.objectives.done.includes(step.until);
  else {
    state.weather.remaining -= 1;
    advance = state.weather.remaining <= 0;
  }
  if (advance) {
    state.weatherStep += 1;
    if (state.weatherStep >= script.steps.length) state.weatherStep = Math.min(script.loop, script.steps.length - 1);
    state.weather = scriptedWeather(script.steps[state.weatherStep]);
  }
  return true;
}

/** Advance the seeded (or scripted) weather; returns rain volume to add this tick. */
export function stepWeather(state: GameState): number {
  if (!stepScript(state)) {
    const w = state.weather;
    w.remaining -= 1;
    if (w.remaining <= 0) {
      const mode = pickNext(state);
      const d = pickDuration(state, mode);
      w.mode = mode;
      w.duration = d;
      w.remaining = d;
    }
  }
  if (!state.flags.rain) return 0;
  return CONFIG.rain.perTick[state.weather.mode];
}

/** 0..1 time of day; 0 = dawn, 0.5 = dusk. Presentational only. */
export function dayPhase(tick: number): number {
  const L = CONFIG.weather.dayLengthTicks;
  return (((tick % L) + L) % L) / L;
}

export function statePhase(state: GameState): number {
  return dayPhase(state.tick + (state.dayOffset ?? 0));
}

/** True during the dark part of the day cycle. */
export function isNight(phase: number): boolean {
  return phase > 0.55 && phase < 0.95;
}

export function evaporationMultiplier(state: GameState): number {
  return state.weather.mode === 'dry' ? CONFIG.water.dryEvaporationMultiplier : 1;
}
