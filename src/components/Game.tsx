'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GameController, type HudSnapshot } from '@/game/controller';
import { TOOL_ORDER } from '@/game/content/strings';
import GameHUD from './GameHUD';
import ToolDock from './ToolDock';
import Inspector from './Inspector';
import Tutorial from './Tutorial';
import { GoalsDialog, SettingsDialog } from './Settings';
import { JournalDialog, LevelSelectDialog } from './Journal';
import Toasts from './Toasts';
import { Icon } from './Icons';

const noopSubscribe = () => () => {};
const nullSnapshot = () => null;

export default function Game() {
  const [controller, setController] = useState<GameController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [panel, setPanel] = useState<'none' | 'settings' | 'goals' | 'journal' | 'levels'>('none');

  useEffect(() => {
    const c = new GameController();
    if (!c.state.settings.tutorialDone && c.state.tick === 0 && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      c.state.settings.reducedMotion = true;
    }
    setController(c);
    return () => {
      c.save();
      c.detach();
    };
  }, []);

  useEffect(() => {
    if (controller && canvasRef.current) {
      controller.attach(canvasRef.current);
      return () => controller.detach();
    }
  }, [controller]);

  const snap = useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    controller ? controller.getSnapshot : nullSnapshot,
    nullSnapshot,
  ) as HudSnapshot | null;

  const onGlobalKey = useCallback(
    (e: KeyboardEvent) => {
      if (!controller) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        controller.undo();
        return;
      }
      if (e.key === 'Escape') {
        if (panel !== 'none') setPanel('none');
        else controller.clearSelection();
        return;
      }
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setPanel((p) => (p === 'journal' ? 'none' : 'journal'));
        return;
      }
      if (panel !== 'none' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'p' || e.key === 'P') controller.togglePause();
      else if (e.key === 'h' || e.key === 'H') controller.toggleHeights();
      else if (/^[0-9]$/.test(e.key)) {
        const n = e.key === '0' ? 9 : Number(e.key) - 1;
        const tool = TOOL_ORDER[n];
        if (tool && !controller.toolLocked(tool)) controller.setTool(tool);
      }
    },
    [controller, panel],
  );

  useEffect(() => {
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [onGlobalKey]);

  const onMapKey = (e: React.KeyboardEvent) => {
    if (!controller) return;
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[e.key]) {
      e.preventDefault();
      controller.keyboardMove(dirs[e.key][0], dirs[e.key][1], e.shiftKey);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      controller.keyboardActivate();
    } else if (e.key === 'Shift') {
      controller.keyboardEnd();
    } else if (e.key === '+' || e.key === '=') controller.zoomBy(1.2);
    else if (e.key === '-') controller.zoomBy(1 / 1.2);
  };

  return (
    <div className="app">
      <header className="hud-area">{snap && controller ? <GameHUD snap={snap} controller={controller} onOpen={setPanel} /> : <div className="hud loading">aqua-vault</div>}</header>

      <nav className="tools-area" aria-label="Build tools">
        {snap && controller ? <ToolDock snap={snap} controller={controller} /> : null}
      </nav>

      <main className="stage" aria-label="Village map">
        <div
          className="map-focus"
          tabIndex={0}
          role="application"
          aria-label="Village map. Arrow keys move a cursor, Enter uses the selected tool, Shift with arrows digs or erases continuously, plus and minus zoom."
          onKeyDown={onMapKey}
          onKeyUp={(e) => e.key === 'Shift' && controller?.keyboardEnd()}
          onBlur={() => {
            if (controller) controller.keyboardCell = -1;
          }}
        >
          <canvas ref={canvasRef} className="game-canvas" />
        </div>
        {snap && controller ? (
          <>
            <Tutorial snap={snap} controller={controller} />
            <Toasts snap={snap} controller={controller} />
            {snap.hint ? (
              <div className="hint" role="status">
                {snap.hint}
              </div>
            ) : null}
            {snap.paused ? <div className="paused-badge">Paused</div> : null}
            <div className="zoom-controls" role="group" aria-label="Camera">
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
            {snap.loadMessage ? (
              <div className="load-message" role="alert">
                <span>{snap.loadMessage}</span>
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

      <aside className="inspector-area" aria-label="Inspector">
        {snap && controller ? <Inspector snap={snap} controller={controller} onOpenGoals={() => setPanel('goals')} /> : null}
      </aside>

      {snap && controller && panel === 'settings' ? <SettingsDialog snap={snap} controller={controller} onClose={() => setPanel('none')} /> : null}
      {snap && controller && panel === 'goals' ? <GoalsDialog snap={snap} onClose={() => setPanel('none')} /> : null}
      {snap && controller && panel === 'journal' ? <JournalDialog snap={snap} controller={controller} onClose={() => setPanel('none')} /> : null}
      {snap && controller && panel === 'levels' ? <LevelSelectDialog snap={snap} controller={controller} onClose={() => setPanel('none')} /> : null}
    </div>
  );
}
