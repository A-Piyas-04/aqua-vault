'use client';

import type { GameController, HudSnapshot } from '@/game/controller';
import { WEATHER_LABEL } from '@/game/content/strings';
import { Icon } from './Icons';

interface Props {
  snap: HudSnapshot;
  controller: GameController;
  onOpen: (p: 'settings' | 'goals') => void;
}

export default function GameHUD({ snap, controller, onOpen }: Props) {
  const span = snap.levelNext !== null ? snap.levelNext - snap.levelFloor : 1;
  const frac = snap.levelNext !== null ? (snap.xp - snap.levelFloor) / span : 1;
  const weather = WEATHER_LABEL[snap.weather];
  return (
    <div className="hud">
      <div className="brand" aria-hidden="true">
        aqua<span>·</span>vault
      </div>
      <div className="stats" role="group" aria-label="Village status">
        <div className="stat level" title="Level and experience">
          <span className="stat-label">Lv</span>
          <strong>{snap.level}</strong>
          <span className="xpbar" aria-label={`Experience ${snap.xp}${snap.levelNext !== null ? ` of ${snap.levelNext}` : ''}`}>
            <span style={{ width: `${Math.round(frac * 100)}%` }} />
          </span>
        </div>
        <div className={`stat weather ${snap.weather}`}>
          <Icon name={snap.weather === 'dry' ? 'sun' : 'rain'} size={18} />
          <span>
            <span className="bn">{weather.bn}</span> <span className="wide-only">{weather.en}</span>
          </span>
        </div>
        <div className="stat" aria-label={`Materials ${snap.materials}`}>
          <Icon name="coin" size={18} />
          <strong>{snap.materials}</strong>
          {snap.freeCanals > 0 ? <span className="free">+{snap.freeCanals} free</span> : null}
        </div>
        <div className="stat" aria-label={`Stored water ${Math.floor(snap.storedWater)}`}>
          <Icon name="drop" size={18} />
          <strong>{Math.floor(snap.storedWater)}</strong>
          <span className="stat-label wide-only">stored</span>
        </div>
        <div className="stat" aria-label={`Energy ${Math.floor(snap.energy)} of ${snap.energyCap}`}>
          <Icon name="bolt" size={18} />
          <strong>{Math.floor(snap.energy)}</strong>
          <span className="stat-label">/{snap.energyCap}</span>
          {snap.generation > 0.05 ? <span className="gen">+{snap.generation.toFixed(1)}/s</span> : null}
        </div>
        <div className="stat clean" aria-label={`Clean water ${snap.clean.toFixed(1)}`}>
          <Icon name="check" size={18} />
          <strong>{snap.clean.toFixed(1)}</strong>
          <span className="stat-label wide-only">clean</span>
        </div>
      </div>
      <div className="hud-buttons">
        <button type="button" className="icon-btn" onClick={() => controller.togglePause()} aria-label={snap.paused ? 'Resume' : 'Pause'} aria-pressed={snap.paused}>
          <Icon name={snap.paused ? 'play' : 'pause'} />
        </button>
        <button type="button" className="icon-btn speed" onClick={() => controller.setSpeed(snap.speed === 1 ? 2 : 1)} aria-label={`Speed ${snap.speed}x, click to change`}>
          {snap.speed}x
        </button>
        <button type="button" className="icon-btn" onClick={() => controller.undo()} disabled={!snap.canUndo} aria-label="Undo last edit">
          <Icon name="undo" />
        </button>
        <button type="button" className="icon-btn wide-only-flex" onClick={() => controller.setSetting('sound', !snap.settings.sound)} aria-label={snap.settings.sound ? 'Mute sound' : 'Turn sound on'} aria-pressed={snap.settings.sound}>
          <Icon name={snap.settings.sound ? 'soundOn' : 'soundOff'} />
        </button>
        <button type="button" className="icon-btn goals-btn" onClick={() => onOpen('goals')} aria-label={`Goals, ${snap.milestonesDone} of 7 done`}>
          <Icon name="goals" />
          <span className="badge">{snap.milestonesDone}/7</span>
        </button>
        <button type="button" className="icon-btn" onClick={() => onOpen('settings')} aria-label="Settings and help">
          <Icon name="settings" />
        </button>
      </div>
    </div>
  );
}
