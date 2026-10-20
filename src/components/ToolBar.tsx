'use client';

import { memo } from 'react';
import type { GameController } from '@/game/controller';
import { Icon } from './Icons';
import { useSlice } from './useGame';

function ToolBar({ controller }: { controller: GameController }) {
  const t = useSlice(controller, 'tools');
  const hint = useSlice(controller, 'hint');
  if (!t) return null;
  const selected = t.tools.find((b) => b.id === t.tool);
  return (
    <div className="toolbar-wrap">
      <div className="tool-help" aria-live="polite">
        {hint ? (
          <span className="hint-text">{hint}</span>
        ) : selected ? (
          <>
            <strong>{selected.name}</strong>
            {selected.cost ? <span className="cost"> · {selected.cost} materials</span> : null}
            <span className="desc"> {t.description}</span>
          </>
        ) : null}
      </div>
      <div className="toolbar" role="toolbar" aria-label="Tools">
        {t.tools.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`tool ${t.tool === b.id ? 'selected' : ''} ${b.pulse ? 'pulse' : ''} ${b.id === 'erase' ? 'erase' : ''}`}
            aria-pressed={t.tool === b.id}
            aria-label={`${b.name}${b.cost ? `, ${b.cost} materials` : ''}${b.key ? `, key ${b.key}` : ''}`}
            title={`${b.name}${b.key ? ` (${b.key})` : ''}`}
            onClick={() => controller.setTool(b.id)}
          >
            <Icon name={b.icon} size={24} />
            <span className="tool-name">{b.short}</span>
            {b.key ? (
              <span className="tool-key" aria-hidden="true">
                {b.key}
              </span>
            ) : null}
            {b.isNew ? (
              <span className="tool-new" aria-hidden="true">
                New
              </span>
            ) : null}
          </button>
        ))}
        <span className="tool-sep" aria-hidden="true" />
        <button type="button" className="tool undo" onClick={() => controller.undo()} disabled={!t.canUndo} aria-label="Undo last change (Ctrl+Z)" title="Undo (Ctrl+Z)">
          <Icon name="undo" size={24} />
          <span className="tool-name">Undo</span>
        </button>
      </div>
    </div>
  );
}

export default memo(ToolBar);
