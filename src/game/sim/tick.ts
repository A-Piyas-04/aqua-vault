import type { Command, GameEvent, GameState } from '../model/types';
import { applyCommand } from './commands';
import { stepConsumers } from './consumers';
import { stepTurbines } from './power';
import { evaluateObjectives } from './objectives';
import { checkProgression } from './progression';
import { addRain, applyTileSinks, computeTileFlags, infiltrate, stepFlux, totalWater } from './water';
import { evaporationMultiplier, stepWeather } from './weather';

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  /** Mass-balance residual for this tick (should be ~0). */
  residual: number;
}

/**
 * Advance the simulation by one fixed 100 ms tick. Mutates `state` in place
 * (the renderer only reads it). Commands are validated and applied first.
 */
export function stepGame(state: GameState, commands: Command[] = []): StepResult {
  const events: GameEvent[] = [];
  const L = state.ledger;
  L.rainAdded = 0;
  L.evaporation = 0;
  L.cropUptake = 0;
  L.householdUse = 0;
  L.discharged = 0;
  L.treatmentLoss = 0;
  L.spill = 0;
  L.energyGenerated = 0;
  L.energyUsed = 0;

  const before = totalWater(state);

  for (const cmd of commands) applyCommand(state, cmd, events);

  const flags = computeTileFlags(state);
  const rain = stepWeather(state);
  L.rainAdded = addRain(state, rain);

  const report = stepFlux(state, flags);
  infiltrate(state, flags);
  stepTurbines(state, report);
  const evapMult = evaporationMultiplier(state);
  stepConsumers(state, flags, report.storageIn, evapMult);
  if (state.flags.sinks) {
    const s = applyTileSinks(state, evapMult);
    L.evaporation += s.evaporation;
    L.discharged += s.discharged;
  }

  checkProgression(state, events);
  evaluateObjectives(state, events);
  state.tick += 1;

  L.total = totalWater(state);
  const expected =
    before + L.rainAdded - L.evaporation - L.cropUptake - L.householdUse - L.discharged - L.treatmentLoss - L.spill;
  const residual = L.total - expected;
  return { state, events, residual };
}

export function massTolerance(total: number): number {
  return 1e-5 * Math.max(1, total);
}
