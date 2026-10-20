'use client';

import { useState } from 'react';
import type { GameController } from '@/game/controller';
import { TOOL_INFO } from '@/game/content/strings';
import { Dialog } from './Dialog';
import { Icon } from './Icons';
import { Stars } from './ObjectiveCard';
import { useSlice } from './useGame';

export function JournalDialog({ controller, onClose }: { controller: GameController; onClose: () => void }) {
  const meta = useSlice(controller, 'meta');
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  if (!meta) return null;
  const entry = meta.journal.find((e) => e.id === openId && !e.locked) ?? null;

  if (entry) {
    const p = entry.pages[page] ?? entry.pages[0];
    return (
      <Dialog title={entry.title} onClose={onClose}>
        <p className="desc">
          {entry.num ? `Level ${entry.num} · ` : ''}
          <span className="bn">{entry.bn}</span> · Page {page + 1} of {entry.pages.length}
        </p>
        <h3>{p.title}</h3>
        <p className="journal-text">{p.text}</p>
        {p.careful?.length ? (
          <ul className="careful">
            {p.careful.map((c) => (
              <li key={c}>
                <Icon name="warn" size={14} /> {c}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="row-buttons">
          <button type="button" className="action" disabled={page <= 0} onClick={() => setPage((n) => Math.max(0, n - 1))}>
            Back
          </button>
          <button type="button" className="action" disabled={page >= entry.pages.length - 1} onClick={() => setPage((n) => Math.min(entry.pages.length - 1, n + 1))}>
            Next
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              setOpenId(null);
              setPage(0);
            }}
          >
            All pages
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Journal" onClose={onClose}>
      <p className="desc">What each level taught, and what can and cannot happen. Pages open as you reach each level.</p>
      <ol className="list">
        {meta.journal.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="list-item"
              disabled={e.locked}
              onClick={() => {
                setOpenId(e.id);
                setPage(0);
              }}
            >
              <span className="num-badge" aria-hidden="true">
                {e.locked ? <Icon name="lock" size={16} /> : e.num || <Icon name="sprout" size={16} />}
              </span>
              <span>
                <strong>
                  {e.title} <span className="bn">{e.bn}</span>
                </strong>
                <span className="desc">{e.locked ? 'Reach this level to unlock.' : `${e.pages.length} page${e.pages.length > 1 ? 's' : ''}`}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

export function LevelMapDialog({ controller, onClose }: { controller: GameController; onClose: () => void }) {
  const meta = useSlice(controller, 'meta');
  if (!meta) return null;
  const all = [...meta.levels, meta.sandbox];
  const stars = meta.levels.reduce((s, l) => s + l.stars, 0);
  return (
    <Dialog title="Level map" onClose={onClose} wide>
      <p className="desc">
        Each level teaches one idea. Finish one (or skip it after a few minutes) to open the next. <strong>★ {stars} / 30</strong>
      </p>
      <ol className="level-path">
        {all.map((l) => {
          const state = l.current ? 'current' : l.completed ? 'done' : l.unlocked ? 'open' : 'locked';
          return (
            <li key={l.id} className={`node ${state}`}>
              <button
                type="button"
                disabled={!l.unlocked}
                onClick={() => {
                  if (!l.current) controller.startLevel(l.id);
                  onClose();
                }}
                aria-label={`${l.num ? `Level ${l.num}` : 'Sandbox'}: ${l.title}. ${l.completed ? `${l.stars} stars` : l.skipped ? 'skipped' : l.unlocked ? 'open' : 'locked'}${l.current ? ', you are here' : ''}`}
              >
                <span className="node-num" aria-hidden="true">
                  {!l.unlocked ? <Icon name="lock" size={18} /> : l.num || <Icon name="sprout" size={18} />}
                </span>
                <span className="node-text">
                  <strong>{l.title}</strong>
                  <span className="bn">{l.bn}</span>
                  <span className="node-meta">
                    {l.completed ? <Stars n={l.stars} size={14} /> : l.skipped ? <span className="desc">Skipped</span> : l.current ? <span className="desc">You are here</span> : null}
                  </span>
                  {l.tools.length ? (
                    <span className="node-tools" aria-hidden="true">
                      {l.tools.map((t) => (
                        <Icon key={t} name={TOOL_INFO[t].icon} size={16} />
                      ))}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}
