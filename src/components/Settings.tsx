'use client';

import { useState } from 'react';
import type { GameController } from '@/game/controller';
import type { Quality } from '@/game/persistence/profile';
import { SAVE_NOTE, SCIENCE_NOTE } from '@/game/content/strings';
import { Dialog } from './Dialog';
import { useSlice } from './useGame';

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

function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="choice">
      <legend>{label}</legend>
      <div className="seg">
        {options.map((o) => (
          <button key={String(o.v)} type="button" className={o.v === value ? 'on' : ''} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function SettingsDialog({ controller, onClose }: { controller: GameController; onClose: () => void }) {
  const meta = useSlice(controller, 'meta');
  const [confirm, setConfirm] = useState(false);
  if (!meta) return null;
  const st = meta.settings;
  const saved = meta.savedAt ? new Date(meta.savedAt).toLocaleTimeString() : 'not yet';
  const qualities: { v: Quality; label: string }[] = [
    { v: 'auto', label: 'Auto' },
    { v: 'high', label: 'High' },
    { v: 'medium', label: 'Medium' },
    { v: 'low', label: 'Low' },
    { v: 'classic', label: 'Classic 2D' },
  ];
  return (
    <Dialog title="Settings & help" onClose={onClose} wide>
      <div className="settings-grid">
        <section>
          <h3>Sound</h3>
          <Toggle label="Sound" hint="Rain, a babbling brook, birds and gentle chimes. Off until you turn it on." checked={st.sound} onChange={(v) => controller.setSetting('sound', v)} />
          <label className="slider">
            <span>Volume</span>
            <input type="range" min={0} max={1} step={0.05} value={st.volume} onChange={(e) => controller.setSetting('volume', Number(e.target.value))} aria-label="Volume" />
          </label>
        </section>
        <section>
          <h3>Comfort</h3>
          <Toggle label="Reduced motion" hint="Calmer water, no rain streaks, no camera glides." checked={st.reducedMotion} onChange={(v) => controller.setSetting('reducedMotion', v)} />
          <Choice label="Text size" value={st.textScale} options={[{ v: 1, label: 'Normal' }, { v: 1.15, label: 'Large' }, { v: 1.3, label: 'Larger' }]} onChange={(v) => controller.setSetting('textScale', v)} />
        </section>
        <section>
          <h3>Graphics</h3>
          <Choice label="Quality" value={st.quality} options={qualities} onChange={(v) => controller.setSetting('quality', v)} />
          <p className="desc">
            Now: {meta.rendererKind === 'webgl' ? '3D diorama' : meta.rendererKind === 'canvas2d' ? 'classic 2D view' : 'starting'}. Auto lowers detail if your device struggles.
          </p>
        </section>
        <section>
          <h3>Saving</h3>
          <div className="row-buttons">
            <button type="button" className="action" onClick={() => controller.saveNow()}>
              Save now
            </button>
            <button type="button" className="action" onClick={() => controller.resetView()}>
              Reset view
            </button>
          </div>
          <p className="desc">
            Last saved {saved}. {SAVE_NOTE}
          </p>
          {meta.saveError ? <p className="desc warn-text">{meta.saveError}</p> : null}
          {!confirm ? (
            <button type="button" className="action danger" onClick={() => setConfirm(true)}>
              Reset all progress…
            </button>
          ) : (
            <div className="confirm" role="alert">
              <span>Erase every level and all stars? This cannot be undone.</span>
              <button
                type="button"
                className="action danger"
                onClick={() => {
                  controller.resetProgress();
                  setConfirm(false);
                  onClose();
                }}
              >
                Yes, start over
              </button>
              <button type="button" className="action" onClick={() => setConfirm(false)}>
                Keep my progress
              </button>
            </div>
          )}
        </section>
      </div>
      <section>
        <h3>How to play</h3>
        <ul className="help">
          <li>
            <strong>Water only flows downhill.</strong> Show heights (<kbd>H</kbd>) to plan a route.
          </li>
          <li>
            <strong>Drag</strong> with Canal to dig; <strong>tap</strong> with a building tool to place it. Erase or right-drag removes.
          </li>
          <li>
            <strong>Inspect</strong> anything to see exactly what it is missing, and to harvest, stock fish, open gates or turn a pump.
          </li>
          <li>
            <strong>Camera:</strong> drag with Inspect (or two fingers) to look around, wheel or pinch to zoom, <kbd>Q</kbd>/<kbd>E</kbd> or a two-finger twist to turn.
          </li>
          <li>
            <strong>Keys:</strong> <kbd>1</kbd>–<kbd>0</kbd> tools, <kbd>X</kbd> erase, <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>P</kbd> pause, <kbd>F</kbd> speed, <kbd>M</kbd> level map, <kbd>J</kbd> journal. Focus the map and use the arrows, <kbd>Enter</kbd> and <kbd>Shift</kbd>+arrows to play by keyboard.
          </li>
        </ul>
      </section>
      <section>
        <h3>About</h3>
        <p className="desc">{SCIENCE_NOTE}</p>
        <p className="desc">A fictional village in a Bangladeshi monsoon. All art is made in code; no tracking, no accounts, nothing leaves this browser.</p>
      </section>
    </Dialog>
  );
}
