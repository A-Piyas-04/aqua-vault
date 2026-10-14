'use client';

import type { GameController, HudSnapshot } from '@/game/controller';
import { Icon } from './Icons';

const ICON: Record<string, string> = { achievement: 'star', level: 'star', error: 'warn', info: 'leaf', harvest: 'coin' };

export default function Toasts({ snap, controller }: { snap: HudSnapshot; controller: GameController }) {
  return (
    <div className="toasts" aria-live="polite">
      {snap.toasts.map((t) => (
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
