'use client';

import type { GameController, HudSnapshot } from '@/game/controller';
import { MILESTONES } from '@/game/content/milestones';
import { Icon } from './Icons';

export default function Inspector({ snap, controller, onOpenGoals }: { snap: HudSnapshot; controller: GameController; onOpenGoals: () => void }) {
  const info = snap.inspect;
  if (!info) {
    const next = MILESTONES.find((m) => !snap.achievements.includes(m.achievement));
    return (
      <div className="inspector idle">
        <h2>Village</h2>
        {next ? (
          <button type="button" className="next-goal" onClick={onOpenGoals}>
            <span className="goal-key">{next.key}</span>
            <span>
              <strong>{next.title}</strong>
              <span className="desc">{next.hint}</span>
            </span>
          </button>
        ) : (
          <p className="bloom">Village in Bloom. The sandbox is yours.</p>
        )}
        <h3>What lives here now</h3>
        {snap.ecosystem.living.length ? (
          <ul className="living">
            {snap.ecosystem.living.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="desc">Dry fields and quiet homes, waiting for water.</p>
        )}
        <p className="desc tip">Choose Inspect and tap anything to see what it needs.</p>
      </div>
    );
  }
  return (
    <div className="inspector sheet" role="region" aria-label={`${info.title} details`}>
      <div className="insp-head">
        <h2>
          {info.title}
          {info.bn ? <span className="bn"> · {info.bn}</span> : null}
        </h2>
        <button type="button" className="icon-btn small" onClick={() => controller.clearSelection()} aria-label="Close details">
          <Icon name="close" size={18} />
        </button>
      </div>
      {info.status ? (
        <div className={`status ${info.ok ? 'ok' : 'warn'}`}>
          <Icon name={info.ok ? 'check' : 'warn'} size={16} />
          <span>{info.status}</span>
        </div>
      ) : null}
      <dl className="lines">
        {info.lines.map((l) => (
          <div key={l.label}>
            <dt>{l.label}</dt>
            <dd>{l.value}</dd>
          </div>
        ))}
      </dl>
      {info.actions.length ? (
        <div className="actions">
          {info.actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`action ${a.id === 'remove' ? 'danger' : ''}`}
              disabled={!a.enabled}
              onClick={() => controller.inspectAction(a)}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {info.note ? <p className="note">{info.note}</p> : null}
    </div>
  );
}
