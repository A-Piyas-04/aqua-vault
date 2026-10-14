'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameController, HudSnapshot } from '@/game/controller';
import { MILESTONES } from '@/game/content/milestones';
import { SAVE_NOTE, SCIENCE_NOTE } from '@/game/content/strings';
import { Icon } from './Icons';

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
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

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
      <span>
        {label}
        {hint ? <span className="desc">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SettingsDialog({ snap, controller, onClose }: { snap: HudSnapshot; controller: GameController; onClose: () => void }) {
  const [confirmNew, setConfirmNew] = useState(false);
  const saved = snap.savedAt ? new Date(snap.savedAt).toLocaleTimeString() : 'not yet';
  return (
    <Dialog title="Settings & help" onClose={onClose}>
      <section>
        <Toggle label="Sound" hint="Gentle procedural rain, water and chimes. Off by default." checked={snap.settings.sound} onChange={(v) => controller.setSetting('sound', v)} />
        <Toggle label="Reduced motion" hint="No rain particles or fast animation." checked={snap.settings.reducedMotion} onChange={(v) => controller.setSetting('reducedMotion', v)} />
        <Toggle label="Show ground heights" hint="Water only flows downhill: plan with the numbers. (H)" checked={snap.showHeights} onChange={() => controller.toggleHeights()} />
      </section>
      <section className="row-buttons">
        <button type="button" className="action" onClick={() => controller.saveNow()}>
          Save now
        </button>
        <button type="button" className="action" onClick={() => controller.resetView()}>
          Reset view
        </button>
        {!confirmNew ? (
          <button type="button" className="action danger" onClick={() => setConfirmNew(true)}>
            New world…
          </button>
        ) : (
          <span className="confirm" role="alert">
            Start over? Your village will be replaced.
            <button
              type="button"
              className="action danger"
              onClick={() => {
                controller.newWorld();
                setConfirmNew(false);
                onClose();
              }}
            >
              Yes, new world
            </button>
            <button type="button" className="action" onClick={() => setConfirmNew(false)}>
              Keep playing
            </button>
          </span>
        )}
      </section>
      <p className="desc">
        Last saved: {saved}. {SAVE_NOTE}
      </p>
      {snap.saveError ? <p className="desc warn-text">{snap.saveError}</p> : null}
      <section>
        <h3>How to play</h3>
        <ul className="help">
          <li>Drag with the Canal tool to dig. Water only runs downhill, and canals carry it far faster than soil.</li>
          <li>Buildings take water from neighbouring wet tiles. Tap with Inspect to see what each one needs.</li>
          <li>Waterwheels need moving water <em>and</em> a drop in height. Batteries store their power.</li>
          <li>Treatment needs raw water plus power; only treated water can supply homes through taps.</li>
          <li>Gates (tap to open or close) let you choose who gets the water.</li>
          <li>Mouse: right-drag erases, wheel zooms. Touch: two fingers pan and pinch; with Inspect, one finger pans.</li>
          <li>Keyboard: focus the map, arrows move, Enter uses the tool, Shift+arrows digs, 1–0 pick tools, Ctrl+Z undo, P pause, J journal, H heights.</li>
          <li>The Journal (book button) keeps every lesson so you can re-read what can and cannot happen.</li>
        </ul>
      </section>
      <section>
        <h3>About</h3>
        <p className="desc">{SCIENCE_NOTE}</p>
        <p className="desc">A fictional village in a Bangladeshi monsoon. All art is drawn procedurally; no external assets, tracking or accounts.</p>
      </section>
    </Dialog>
  );
}

export function GoalsDialog({ snap, onClose }: { snap: HudSnapshot; onClose: () => void }) {
  return (
    <Dialog title="Milestones" onClose={onClose}>
      <ol className="goals">
        {MILESTONES.map((m) => {
          const done = snap.achievements.includes(m.achievement);
          return (
            <li key={m.key} className={done ? 'done' : ''}>
              <span className="goal-key" aria-hidden="true">
                {done ? <Icon name="check" size={16} /> : m.key}
              </span>
              <span>
                <strong>
                  {m.title}
                  {done ? <span className="sr-only"> (done)</span> : null}
                </strong>
                <span className="desc">{m.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <h3>Ecosystem</h3>
      <div className="eco">
        <span className="eco-bar">
          <span style={{ width: `${snap.ecosystem.score}%` }} />
        </span>
        <span className="desc">{snap.ecosystem.living.length ? snap.ecosystem.living.join(' · ') : 'Waiting for water.'}</span>
      </div>
    </Dialog>
  );
}
