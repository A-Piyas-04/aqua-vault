'use client';

import { memo, useState } from 'react';
import type { GameController } from '@/game/controller';
import { Icon } from './Icons';
import { formatTime, useSlice } from './useGame';

function Stars({ n, of = 3, size = 16 }: { n: number; of?: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, k) => (
        <Icon key={k} name={k < n ? 'starFill' : 'star'} size={size} />
      ))}
    </span>
  );
}

export { Stars };

function ObjectiveCard({ controller }: { controller: GameController }) {
  const o = useSlice(controller, 'objectives');
  const hud = useSlice(controller, 'hud');
  const [collapsed, setCollapsed] = useState(false);
  if (!o) return null;
  if (o.sandbox) {
    return (
      <section className="objective-card sandbox" aria-label="Open village">
        <div className="oc-head">
          <span className="oc-kicker">Open village</span>
        </div>
        <p className="oc-sandbox">No goals here. Every tool is yours. Build freely.</p>
      </section>
    );
  }
  const current = o.items.filter((i) => i.current);
  const doneCount = o.items.filter((i) => i.done).length;
  const timeOk = o.elapsed <= o.parSeconds;
  const spendOk = o.spent <= o.parMaterials;
  return (
    <section className={`objective-card ${o.complete ? 'complete' : ''} ${collapsed ? 'collapsed' : ''}`} aria-label={`Level ${o.num} goals`}>
      <div className="oc-head">
        <span className="oc-kicker">
          Level {o.num} · {doneCount}/{o.items.length}
        </span>
        <button type="button" className="icon-btn small ghost" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? 'Show goals' : 'Hide goals'}>
          <Icon name={collapsed ? 'chevronDown' : 'chevronUp'} size={18} />
        </button>
      </div>
      <h2 className="oc-title">
        {o.title} <span className="bn">{o.bn}</span>
      </h2>
      {collapsed ? (
        current[0] ? (
          <p className="oc-mini" aria-live="polite">
            <Icon name={current[0].icon} size={16} /> {current[0].text}
          </p>
        ) : null
      ) : (
        <>
          <ol className="oc-list" aria-live="polite">
            {o.items.map((it) => (
              <li key={it.id} className={it.done ? 'done' : it.current ? 'current' : 'todo'}>
                <span className="oc-icon" aria-hidden="true">
                  <Icon name={it.done ? 'check' : it.icon} size={it.current ? 20 : 16} />
                </span>
                <span className="oc-body">
                  <span className="oc-text">
                    {it.text}
                    {it.done ? <span className="sr-only"> (done)</span> : null}
                  </span>
                  {it.current && it.hint ? <span className="oc-hint">{it.hint}</span> : null}
                  {it.current && it.progress !== null ? (
                    <span className="oc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(it.progress * 100)}>
                      <span style={{ width: `${Math.round(it.progress * 100)}%` }} />
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {!o.complete ? (
            <div className="oc-actions">
              {o.hasCoach ? (
                <button type="button" className="chip" onClick={() => controller.showCoach()}>
                  <Icon name="eye" size={16} /> Show me
                </button>
              ) : null}
              {o.waiting && hud && hud.speed < 4 ? (
                <button type="button" className="chip" onClick={() => controller.setSpeed(4)}>
                  <Icon name="fast" size={16} /> Speed up
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="oc-stars">
            {o.complete ? (
              <>
                <Stars n={o.stars} />
                <span>Level complete</span>
              </>
            ) : (
              <>
                <span className={`par ${spendOk ? 'ok' : 'miss'}`} title="Second star: spend at most this many materials">
                  <Icon name={spendOk ? 'starFill' : 'star'} size={14} /> spend ≤ {o.parMaterials}
                  <span className="par-now">({o.spent})</span>
                </span>
                <span className={`par ${timeOk ? 'ok' : 'miss'}`} title="Third star: finish within this game time">
                  <Icon name={timeOk ? 'starFill' : 'star'} size={14} /> by {formatTime(o.parSeconds)}
                  <span className="par-now">
                    <Icon name="clock" size={12} /> {formatTime(o.elapsed)}
                  </span>
                </span>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default memo(ObjectiveCard);
