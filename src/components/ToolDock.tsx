'use client';

import type { GameController, HudSnapshot } from '@/game/controller';
import { CONFIG } from '@/game/model/config';
import { TOOL_INFO, TOOL_ORDER } from '@/game/content/strings';
import { Icon } from './Icons';

export default function ToolDock({ snap, controller }: { snap: HudSnapshot; controller: GameController }) {
  const active = TOOL_INFO[snap.tool];
  const costKey = snap.tool as keyof typeof CONFIG.costs;
  const cost = costKey in CONFIG.costs ? CONFIG.costs[costKey] : 0;
  return (
    <div className="dock">
      <div className="tool-list" role="toolbar" aria-label="Tools">
        {TOOL_ORDER.map((id, k) => {
          const info = TOOL_INFO[id];
          const locked = controller.toolLocked(id);
          const selected = snap.tool === id;
          const pulse = snap.tutorial?.pulseTool === id && !snap.tutorial.finished;
          const hidden = snap.allowedTools && !snap.allowedTools.includes(id) && id !== 'inspect' && id !== 'erase';
          if (hidden) return null;
          return (
            <button
              key={id}
              type="button"
              className={`tool ${selected ? 'selected' : ''} ${locked ? 'locked' : ''} ${pulse ? 'pulse' : ''}`}
              aria-pressed={selected}
              aria-disabled={locked !== 0}
              aria-label={`${info.name}${info.bn ? ` (${info.bn})` : ''}${locked > 0 ? `, unlocks at level ${locked}` : locked < 0 ? ', not in this lesson' : ''}${k < 10 ? `, key ${(k + 1) % 10}` : ''}`}
              onClick={() => {
                if (locked > 0) controller.toast('info', `${info.name} unlocks at level ${locked}`, info.description);
                else if (locked < 0) controller.toast('info', `${info.name} is not in this lesson`, 'Finish the lessons to use every tool in the village.');
                else controller.setTool(id);
              }}
            >
              <span className="tool-icon">
                <Icon name={locked ? 'lock' : info.icon} />
              </span>
              <span className="tool-name">{info.short}</span>
              {locked > 0 ? <span className="tool-lock">Lv{locked}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="tool-help" aria-live="polite">
        <strong>
          {active.name}
          {active.bn ? <span className="bn"> · {active.bn}</span> : null}
        </strong>
        {cost ? <span className="cost"> · {cost} materials</span> : null}
        <span className="desc">{active.description}</span>
      </div>
    </div>
  );
}
