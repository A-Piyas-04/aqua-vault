'use client';

import { memo } from 'react';
import type { GameController } from '@/game/controller';
import { Icon } from './Icons';
import { useSlice } from './useGame';

const ICON: Record<string, string> = { achievement: 'coin', objective: 'check', error: 'warn', info: 'info', harvest: 'coin' };

function Toasts({ controller }: { controller: GameController }) {
  const toasts = useSlice(controller, 'toasts') ?? [];
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast ${t.kind}`} onClick={() => controller.dismissToast(t.id)} aria-label={`${t.title}${t.sub ? `. ${t.sub}` : ''}. Dismiss`}>
          <Icon name={ICON[t.kind]} size={18} />
          <span>
            <strong>{t.title}</strong>
            {t.sub ? <span className="sub">{t.sub}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export default memo(Toasts);
