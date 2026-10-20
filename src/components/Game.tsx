'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameController } from '@/game/controller';
import { Icon } from './Icons';
import InspectorPopover from './InspectorPopover';
import ObjectiveCard from './ObjectiveCard';
import Overlays from './Overlays';
import ToolBar from './ToolBar';
import TopBar, { type Panel } from './TopBar';
import Toasts from './Toasts';
import { JournalDialog, LevelMapDialog } from './Journal';
import { SettingsDialog } from './Settings';
import { useSlice } from './useGame';

function Stage({ controller, panel, setPanel }: { controller: GameController; panel: Panel; setPanel: (p: Panel | ((p: Panel) => Panel)) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const meta = useSlice(controller, 'meta');
  const hud = useSlice(controller, 'hud');
  const overlay = useSlice(controller, 'overlay');

  useEffect(() => {
    if (!mountRef.current) return;
    controller.attach(mountRef.current);
    return () => controller.detach();
  }, [controller]);

  const modalOpen = panel !== 'none' || overlay.kind !== 'none';

  const onGlobalKey = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (!modalOpen) controller.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (panel !== 'none') setPanel('none');
        else controller.clearSelection();
        return;
      }
      if (modalOpen) return;
      const k = e.key.toLowerCase();
      if (k === 'j') setPanel((p) => (p === 'journal' ? 'none' : 'journal'));
      else if (k === 'm') setPanel((p) => (p === 'levels' ? 'none' : 'levels'));
      else if (k === 'p') controller.togglePause();
      else if (k === 'h') controller.toggleHeights();
      else if (k === 'f') controller.cycleSpeed();
      else if (k === 'q') controller.rotateView(1);
      else if (k === 'e') controller.rotateView(-1);
      else if (k === 'x') controller.setTool('erase');
      else if (/^[0-9]$/.test(e.key)) {
        const n = e.key === '0' ? 9 : Number(e.key) - 1;
        const buttons = controller.store.get('tools').tools.filter((t) => t.id !== 'erase');
        const b = buttons[n];
        if (b) controller.setTool(b.id);
      } else return;
      e.preventDefault();
    },
    [controller, panel, modalOpen, setPanel],
  );

  useEffect(() => {
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [onGlobalKey]);

  const onMapKey = (e: React.KeyboardEvent) => {
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[e.key]) {
      e.preventDefault();
      controller.keyboardMove(dirs[e.key][0], dirs[e.key][1], e.shiftKey);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      controller.keyboardActivate();
    } else if (e.key === 'Shift') controller.keyboardEnd();
    else if (e.key === '+' || e.key === '=') controller.zoomBy(1.2);
    else if (e.key === '-') controller.zoomBy(1 / 1.2);
  };

  return (
    <div className="app" style={{ ['--text-scale' as string]: String(meta?.settings.textScale ?? 1) }}>
      <main className="stage" aria-label="Village map">
        <div
          ref={mountRef}
          className="map-focus"
          tabIndex={0}
          role="application"
          aria-label="Village map. Arrow keys move a cursor, Enter uses the selected tool, Shift with arrows digs or erases continuously, plus and minus zoom."
          onKeyDown={onMapKey}
          onKeyUp={(e) => e.key === 'Shift' && controller.keyboardEnd()}
          onBlur={() => controller.clearKeyboardCursor()}
        />
        {hud ? (
          <>
            <TopBar controller={controller} onOpen={setPanel} />
            <ObjectiveCard controller={controller} />
            <Toasts controller={controller} />
            <InspectorPopover controller={controller} />
            <ToolBar controller={controller} />
            {hud.paused && overlay.kind === 'none' ? <div className="paused-badge">Paused · press P</div> : null}
            <div className="zoom-controls" role="group" aria-label="Camera">
              <button type="button" className="icon-btn" onClick={() => controller.rotateView(1)} aria-label="Turn view left (Q)" title="Turn left (Q)">
                <Icon name="rotateL" />
              </button>
              <button type="button" className="icon-btn" onClick={() => controller.rotateView(-1)} aria-label="Turn view right (E)" title="Turn right (E)">
                <Icon name="rotateR" />
              </button>
              <button type="button" className="icon-btn" onClick={() => controller.zoomBy(1.25)} aria-label="Zoom in">
                <Icon name="plus" />
              </button>
              <button type="button" className="icon-btn" onClick={() => controller.zoomBy(1 / 1.25)} aria-label="Zoom out">
                <Icon name="minus" />
              </button>
              <button type="button" className="icon-btn" onClick={() => controller.resetView()} aria-label="Reset view">
                <Icon name="fit" />
              </button>
            </div>
            {meta?.loadMessage ? (
              <div className="load-message" role="alert">
                <span>{meta.loadMessage}</span>
                <button type="button" className="text-btn" onClick={() => controller.dismissLoadMessage()}>
                  OK
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="loading-overlay">Preparing the monsoon…</div>
        )}
      </main>
      <Overlays controller={controller} />
      {panel === 'settings' ? <SettingsDialog controller={controller} onClose={() => setPanel('none')} /> : null}
      {panel === 'journal' ? <JournalDialog controller={controller} onClose={() => setPanel('none')} /> : null}
      {panel === 'levels' ? <LevelMapDialog controller={controller} onClose={() => setPanel('none')} /> : null}
    </div>
  );
}

export default function Game() {
  const [controller, setController] = useState<GameController | null>(null);
  const [panel, setPanel] = useState<Panel>('none');

  useEffect(() => {
    const c = new GameController();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !c.profile.levels['first-canal'] && c.state.tick === 0) {
      c.setSetting('reducedMotion', true);
    }
    setController(c);
    return () => {
      c.save();
    };
  }, []);

  if (!controller) return <div className="loading-overlay boot">Preparing the monsoon…</div>;
  return <Stage controller={controller} panel={panel} setPanel={setPanel} />;
}
