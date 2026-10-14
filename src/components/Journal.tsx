'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameController, HudSnapshot } from '@/game/controller';
import { JOURNAL } from '@/game/content/lessons';
import { Icon } from './Icons';

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal journal-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button ref={closeRef} type="button" className="icon-btn small" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function JournalDialog({ snap, controller, onClose }: { snap: HudSnapshot; controller: GameController; onClose: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const entry = JOURNAL.find((e) => e.id === openId) ?? null;
  const unlocked = (id: string) => snap.unlockedJournal.includes(id);

  if (entry && unlocked(entry.id)) {
    const p = entry.pages[page] ?? entry.pages[0];
    return (
      <Dialog title={entry.title} onClose={onClose}>
        <p className="desc">
          Page {page + 1} of {entry.pages.length}
          {p.bn ? (
            <>
              {' '}
              · <span className="bn">{p.bn}</span>
            </>
          ) : null}
        </p>
        <h3>{p.title}</h3>
        <p>{p.text}</p>
        {p.careful?.length ? (
          <ul className="tut-careful">
            {p.careful.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
        <div className="tut-actions">
          <button type="button" className="action" disabled={page <= 0} onClick={() => setPage((n) => Math.max(0, n - 1))}>
            Back
          </button>
          <button type="button" className="action" disabled={page >= entry.pages.length - 1} onClick={() => setPage((n) => Math.min(entry.pages.length - 1, n + 1))}>
            Next
          </button>
          {entry.replayScenario ? (
            <button
              type="button"
              className="action"
              onClick={() => {
                controller.replayLesson(entry.replayScenario!);
                onClose();
              }}
            >
              Replay lesson
            </button>
          ) : null}
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              setOpenId(null);
              setPage(0);
            }}
          >
            All entries
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Journal" onClose={onClose}>
      <p className="desc">Lessons you have seen, in order. Locked pages unlock as you play.</p>
      <ol className="journal-list">
        {JOURNAL.map((e, i) => {
          const lock = !unlocked(e.id);
          return (
            <li key={e.id} className={lock ? 'locked' : ''}>
              <button
                type="button"
                className="journal-item"
                disabled={lock}
                onClick={() => {
                  setOpenId(e.id);
                  setPage(0);
                }}
              >
                <span className="goal-key" aria-hidden="true">
                  {lock ? <Icon name="lock" size={16} /> : i + 1}
                </span>
                <span>
                  <strong>
                    {e.title}
                    {e.bn ? <span className="bn"> · {e.bn}</span> : null}
                  </strong>
                  <span className="desc">{lock ? lockHint(e.id, i, snap) : 'Tap to re-read'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}

function lockHint(id: string, index: number, snap: HudSnapshot): string {
  const prev = JOURNAL[index - 1];
  if (prev && !snap.unlockedJournal.includes(prev.id)) return `Finish “${prev.title}” first.`;
  if (id === 'treatment') return 'Unlocks when a treatment plant makes clean water.';
  if (id === 'taps') return 'Unlocks when a home receives clean water.';
  if (id === 'fishpond') return 'Unlocks when you stock a fish pond.';
  if (id === 'wetland') return 'Unlocks when a wetland thrives.';
  return 'Play the matching lesson to unlock.';
}

export function LevelSelectDialog({ snap, controller, onClose }: { snap: HudSnapshot; controller: GameController; onClose: () => void }) {
  const levels = JOURNAL.filter((e) => e.replayScenario);
  return (
    <Dialog title="Levels" onClose={onClose}>
      <p className="desc">Five short lessons, then the village. Finish one to open the next.</p>
      <ol className="journal-list">
        {levels.map((e) => {
          const id = e.replayScenario!;
          const lock = e.id !== 'lesson-1' && !snap.completedLessons.includes(prevLesson(e.id)) && !snap.completedLessons.includes(id) && snap.scenarioId !== id;
          const current = snap.scenarioId === id;
          const done = snap.completedLessons.includes(id);
          return (
            <li key={e.id} className={lock ? 'locked' : ''}>
              <button
                type="button"
                className={`journal-item ${current ? 'current' : ''}`}
                disabled={lock}
                onClick={() => {
                  controller.loadScenario(id, false);
                  onClose();
                }}
              >
                <span className="goal-key" aria-hidden="true">
                  {lock ? <Icon name="lock" size={16} /> : done ? <Icon name="check" size={16} /> : <Icon name="map" size={16} />}
                </span>
                <span>
                  <strong>
                    {e.title}
                    {current ? ' (here)' : ''}
                  </strong>
                  <span className="desc">{lock ? 'Complete the previous lesson to unlock.' : done ? 'Completed — tap to return' : 'Tap to play'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}

function prevLesson(id: string): string {
  const order = ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5', 'village'];
  const i = order.indexOf(id);
  return i > 0 ? order[i - 1] : 'lesson-1';
}
