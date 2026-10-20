import { CONFIG } from './model/config';
import { storageCapacity } from './model/buildings';
import type { Building, GameState } from './model/types';
import { GATE_CLOSED } from './model/types';
import { getBuilding } from './model/world';
import { STATUS_TEXT, TOOL_INFO } from './content/strings';
import { distanceToFootprint, fieldStage, houseHasTap, isRipe, plantsInReach } from './sim/consumers';
import { energyCapacity } from './sim/power';

export type InspectAction = 'harvest' | 'stock' | 'rotate' | 'toggleGate' | 'remove';

export interface InspectInfo {
  key: string;
  title: string;
  bn?: string;
  lines: { label: string; value: string }[];
  status: string;
  ok: boolean;
  actions: { id: InspectAction; label: string; enabled: boolean; buildingId?: number; cell?: number }[];
  note?: string;
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const perSec = (v: number) => `${f1(v * CONFIG.ticksPerSecond)}/s`;

const STAGE_NAMES = ['Bare paddy', 'Seedlings', 'Lush green rice', 'Golden rice'];
const TERRAIN_NAMES: Record<string, string> = {
  soil: 'Open soil',
  rock: 'Rock',
  source: 'Rain catchment',
  river: 'Stream (khal)',
  outlet: 'Outlet to the river',
  basin: 'Low basin',
  marsh: 'Marshy ground',
  foundation: 'Village ground',
  path: 'Village path',
};

export function inspectBuilding(state: GameState, b: Building): InspectInfo {
  const info = b.type === 'house' ? { name: 'Home', bn: 'বাড়ি' } : { name: TOOL_INFO[b.type].name, bn: TOOL_INFO[b.type].bn };
  const lines: InspectInfo['lines'] = [];
  const actions: InspectInfo['actions'] = [];
  let note: string | undefined;
  switch (b.type) {
    case 'field': {
      lines.push({ label: 'Growth', value: `${STAGE_NAMES[fieldStage(b)]}` });
      lines.push({ label: 'Soil moisture', value: `${Math.round((b.water / CONFIG.field.moistureCap) * 100)}%` });
      lines.push({ label: 'Water intake', value: perSec(b.flow) });
      lines.push({ label: 'Input → output', value: 'water → rice → materials' });
      actions.push({ id: 'harvest', label: `Harvest (+${CONFIG.field.harvestMaterials})`, enabled: isRipe(b), buildingId: b.id });
      break;
    }
    case 'reservoir':
    case 'wetland':
    case 'fishpond': {
      const cap = storageCapacity(b.type);
      lines.push({ label: 'Stored water', value: `${Math.floor(b.water)} / ${cap}` });
      lines.push({ label: 'Inflow', value: perSec(b.flow) });
      if (b.type === 'fishpond') {
        lines.push({ label: 'Pond health', value: `${Math.round(b.quality * 100)}% ${b.quality >= CONFIG.fishpond.minQuality ? '(fresh)' : '(stagnant)'}` });
        lines.push({ label: 'Fish', value: b.stocked ? `growing ${Math.round(b.progress * 100)}%` : 'none yet' });
        actions.push({ id: 'stock', label: `Stock fish (-${CONFIG.fishpond.stockCost})`, enabled: !b.stocked && b.water >= CONFIG.fishpond.minFill, buildingId: b.id });
        actions.push({ id: 'harvest', label: `Harvest fish (+${CONFIG.fishpond.harvestMaterials})`, enabled: isRipe(b), buildingId: b.id });
        note = 'Fish need enough water and a fresh, gentle inflow. Pond water is not drinking water.';
      }
      if (b.type === 'wetland') {
        lines.push({ label: 'Ecology', value: `${Math.round(b.progress * 100)}%` });
        note = 'Shallow, steady water lets reeds, shāpla, frogs and birds return.';
      }
      if (b.type === 'reservoir') note = 'Water flows in and out by height. Close a gate on the outflow canal to hold water for dry spells.';
      break;
    }
    case 'turbine':
      lines.push({ label: 'Power', value: `${f1(b.rate * CONFIG.ticksPerSecond)} /s` });
      lines.push({ label: 'Water through', value: perSec(b.flow) });
      lines.push({ label: 'Head (drop)', value: f1(b.head) });
      lines.push({ label: 'Input → output', value: 'moving water + drop → power; water continues' });
      note = 'Power = efficiency × flow × head. A still reservoir alone makes no power.';
      break;
    case 'battery':
      lines.push({ label: 'Bank charge', value: `${Math.floor(state.resources.energy)} / ${energyCapacity(state)}` });
      lines.push({ label: 'Generating', value: `${f1(state.ledger.energyGenerated * CONFIG.ticksPerSecond)} /s` });
      lines.push({ label: 'Using', value: `${f1(state.ledger.energyUsed * CONFIG.ticksPerSecond)} /s` });
      break;
    case 'treatment':
      lines.push({ label: 'Raw water buffer', value: `${f1(b.water)} / ${CONFIG.treatment.rawCap}` });
      lines.push({ label: 'Clean tank', value: `${f1(b.clean)} / ${CONFIG.treatment.cleanCap}` });
      lines.push({ label: '1. Filter', value: b.water >= CONFIG.treatment.rawPerTick ? 'has raw water' : 'waiting for raw water' });
      lines.push({ label: '2. Disinfect', value: b.active ? 'powered' : b.status === 'treatNoPower' ? 'no power' : 'idle' });
      lines.push({ label: '3. Covered store', value: b.active ? `+${perSec(b.rate)}` : 'idle' });
      note = 'Fictional compact plant. Real rainwater may carry germs and chemicals; boiling kills germs but does not remove chemicals.';
      break;
    case 'connector': {
      const plants = plantsInReach(state, b);
      const total = plants.reduce((s, p) => s + p.clean, 0);
      lines.push({ label: 'Piped from', value: plants.length ? `treatment plant, ${distanceToFootprint(b.x, b.y, plants[0])} tiles` : 'nothing in reach' });
      lines.push({ label: 'Clean water in reach', value: f1(total) });
      lines.push({ label: 'Serving a home', value: b.active ? 'yes' : 'no' });
      note = `Sealed pipes reach treatment plants up to ${CONFIG.connector.pipeRange} tiles away.`;
      break;
    }
    case 'house':
      lines.push({ label: 'Tap', value: houseHasTap(state, b) ? 'connected' : 'none' });
      lines.push({ label: 'Clean water', value: b.supplied ? 'flowing' : 'none' });
      lines.push({ label: 'Water pot (কলসি)', value: `${f1(b.water)} / ${CONFIG.house.potCap}` });
      lines.push({ label: 'Lights', value: b.lit ? 'on' : 'off' });
      break;
    case 'floating': {
      const host = getBuilding(state, b.hostId);
      lines.push({ label: 'Vegetables', value: `${Math.round(b.progress * 100)}%` });
      if (host) lines.push({ label: 'Host water', value: `${Math.round((host.water / storageCapacity(host.type)) * 100)}%` });
      actions.push({ id: 'harvest', label: `Harvest (+${CONFIG.floating.harvestMaterials})`, enabled: isRipe(b), buildingId: b.id });
      note = 'Floating beds (ধাপ) are a real farming heritage of Bangladesh’s waterlogged south.';
      break;
    }
    case 'pump':
      lines.push({ label: 'Moving', value: perSec(b.flow) });
      lines.push({ label: 'Energy use', value: `${f1(b.rate * CONFIG.ticksPerSecond)} /s` });
      lines.push({ label: 'Facing', value: ['north', 'east', 'south', 'west'][b.dir] });
      lines.push({ label: 'Lift', value: b.active ? `${b.head} step${b.head === 1 ? '' : 's'} up` : '-' });
      actions.push({ id: 'rotate', label: 'Rotate', enabled: true, buildingId: b.id });
      note = 'Lifting water always costs more energy than a wheel could win back.';
      break;
    case 'fountain':
      lines.push({ label: 'Running', value: b.active ? 'yes' : 'no' });
      note = 'Beside a fish pond, a running fountain aerates the water.';
      break;
  }
  if (!b.builtin) actions.push({ id: 'remove', label: `Remove (+${Math.floor(CONFIG.costs[b.type as keyof typeof CONFIG.costs] * CONFIG.eraseRefund.building)})`, enabled: true, buildingId: b.id });
  const status = b.status ? STATUS_TEXT[b.status] ?? b.status : b.active || b.type === 'house' ? 'Working' : '';
  return {
    key: `b${b.id}`,
    title: info.name,
    bn: info.bn,
    lines,
    status: status || 'Working',
    ok: !b.status || b.status === 'ripe' || b.status === 'full',
    actions,
    note,
  };
}

export function inspectTile(state: GameState, cell: number): InspectInfo {
  const g = state.grid;
  const t = g.terrain[cell];
  const lines: InspectInfo['lines'] = [
    { label: 'Height', value: String(g.elevation[cell]) },
    { label: 'Water', value: f1(g.water[cell]) },
  ];
  if (t === 'soil' || t === 'basin' || t === 'marsh') lines.push({ label: 'Soil moisture', value: `${Math.round(g.saturation[cell] * 100)}%` });
  const actions: InspectInfo['actions'] = [];
  let title = TERRAIN_NAMES[t] ?? t;
  let bn: string | undefined;
  if (g.canal[cell]) {
    title = 'Canal';
    bn = 'খাল';
    const flow = Math.hypot(g.flowX[cell], g.flowY[cell]);
    lines.push({ label: 'Flow', value: perSec(flow) });
    if (g.gate[cell]) {
      lines.push({ label: 'Gate', value: g.gate[cell] === GATE_CLOSED ? 'closed' : 'open' });
      actions.push({ id: 'toggleGate', label: g.gate[cell] === GATE_CLOSED ? 'Open gate' : 'Close gate', enabled: true, cell });
    }
  }
  if (t === 'river') bn = 'খাল';
  if (t === 'source') bn = 'বৃষ্টি';
  return { key: `t${cell}`, title, bn, lines, status: '', ok: true, actions };
}
