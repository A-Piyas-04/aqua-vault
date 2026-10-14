import { CONFIG } from '../model/config';
import type { GameState } from '../model/types';
import type { FlowReport } from './water';

export function energyCapacity(state: GameState): number {
  let batteries = 0;
  for (const b of state.buildings) if (b.type === 'battery') batteries++;
  return CONFIG.energy.baseBuffer + batteries * CONFIG.energy.batteryCapacity;
}

export function hasBattery(state: GameState): boolean {
  return state.buildings.some((b) => b.type === 'battery');
}

/** Toy hydropower: power = eff * k * throughput * head. Water passes through untouched. */
export function turbinePower(throughput: number, head: number): number {
  const T = CONFIG.turbine;
  if (!(throughput >= T.minFlow) || !(head >= T.minHead)) return 0;
  return T.efficiency * T.k * throughput * head;
}

export function stepTurbines(state: GameState, report: FlowReport): number {
  const g = state.grid;
  let generated = 0;
  for (const b of state.buildings) {
    if (b.type !== 'turbine') continue;
    const i = b.y * g.w + b.x;
    const inflow = report.tileIn[i];
    const outflow = report.tileOut[i];
    const throughput = Math.min(inflow, outflow);
    const up = inflow > 0 ? report.inHeadSum[i] / inflow : 0;
    const down = outflow > 0 ? report.outHeadSum[i] / outflow : 0;
    const head = throughput > 0 ? Math.max(0, up - down) : 0;
    const p = turbinePower(throughput, head);
    b.flow = throughput;
    b.head = head;
    b.rate = p;
    b.active = p > 0;
    b.status = p > 0 ? '' : throughput < CONFIG.turbine.minFlow ? 'needsFlow' : 'needsHead';
    generated += p;
  }
  const cap = energyCapacity(state);
  state.resources.energy = Math.min(cap, state.resources.energy + generated);
  state.ledger.energyGenerated = generated;
  return generated;
}

/** Draw energy all-or-nothing. */
export function drawEnergy(state: GameState, amount: number): boolean {
  if (amount <= 0) return true;
  if (state.resources.energy + 1e-9 < amount) return false;
  state.resources.energy = Math.max(0, state.resources.energy - amount);
  state.ledger.energyUsed += amount;
  return true;
}
