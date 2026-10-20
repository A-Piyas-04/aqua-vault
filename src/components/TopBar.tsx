'use client';

import { memo, useEffect, useRef, useState } from 'react';
import type { GameController } from '@/game/controller';
import { WEATHER_LABEL } from '@/game/content/strings';
import { Icon } from './Icons';
import { useSlice } from './useGame';

export type Panel = 'none' | 'settings' | 'journal' | 'levels';

function Stat({ icon, label, value, sub, tone = '', title }: { icon: string; label: string; value: string; sub?: string; tone?: string; title?: string }) {
  return (
    <div className={`stat ${tone}`} role="group" aria-label={`${label}: ${value}${sub ? `, ${sub}` : ''}`} title={title ?? label}>
      <Icon name={icon} size={18} />
      <span className="stat-text">
        <strong>{value}</strong>
        {sub ? <span className="stat-sub">{sub}</span> : null}
        <span className="stat-label">{label}</span>
      </span>
    </div>
  );
}

function TopBar({ controller, onOpen }: { controller: GameController; onOpen: (p: Panel) => void }) {
  const hud = useSlice(controller, 'hud');
  const obj = useSlice(controller, 'objectives');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [menu]);
  if (!hud) return null;
  const has = (k: string) => hud.hud.includes(k as never);
  const weather = WEATHER_LABEL[hud.weather];
  const pick = (p: Panel) => {
    setMenu(false);
    onOpen(p);
  };
  return (
    <div className={`topbar ${hud.night ? 'night' : ''}`}>
      <button type="button" className="level-chip" onClick={() => onOpen('levels')} aria-label={`Level ${hud.levelNum || 'sandbox'}: ${hud.levelTitle}. Open the level map`}>
        <span className="level-num" aria-hidden="true">
          {hud.levelNum || <Icon name="sprout" size={16} />}
        </span>
        <span className="level-name">
          <strong>{hud.levelTitle}</strong>
          <span className="bn">{hud.levelBn}</span>
        </span>
      </button>

      <div className="stats">
        <div className={`stat weather ${hud.weather}`} role="group" aria-label={`Weather: ${weather.en}`}>
          <Icon name={hud.weather === 'dry' ? 'sun' : 'rain'} size={18} />
          <span className="stat-text">
            <strong>{weather.en}</strong>
            <span className="bn stat-sub">{weather.bn}</span>
          </span>
        </div>
        {has('materials') ? (
          <Stat icon="coin" label="Materials" value={String(hud.materials)} sub={hud.freeCanals > 0 ? `+${hud.freeCanals} free canals` : undefined} />
        ) : has('freeCanals') ? (
          <Stat icon="canal" label="Free canal tiles" value={String(hud.freeCanals)} tone={hud.freeCanals === 0 ? 'warn' : ''} />
        ) : null}
        {has('stored') ? <Stat icon="drop" label="Stored water" value={hud.storageCap ? `${hud.stored}/${hud.storageCap}` : '0'} /> : null}
        {has('energy') ? <Stat icon="bolt" label="Power" value={`${hud.energy}/${hud.energyCap}`} sub={hud.generation > 0.05 ? `+${hud.generation.toFixed(1)}/s` : undefined} /> : null}
        {has('clean') ? <Stat icon="treatment" label="Clean water" value={hud.clean.toFixed(1)} tone="clean" /> : null}
        {has('ecosystem') ? <Stat icon="leaf" label="Life" value={`${hud.ecosystem}%`} title={hud.living.join(' · ') || 'Waiting for water'} /> : null}
        {has('rank') ? <Stat icon="star" label={hud.rankName} value={`★ ${hud.totalStars}`} title={`Village rank: ${hud.rankName} (${hud.xp} XP)`} /> : null}
      </div>

      <div className="bar-buttons">
        <button type="button" className="icon-btn" onClick={() => controller.togglePause()} aria-label={hud.paused ? 'Resume (P)' : 'Pause (P)'} aria-pressed={hud.paused} title={hud.paused ? 'Resume (P)' : 'Pause (P)'}>
          <Icon name={hud.paused ? 'play' : 'pause'} />
        </button>
        {has('speed') ? (
          <button type="button" className="icon-btn speed" onClick={() => controller.cycleSpeed()} aria-label={`Game speed ${hud.speed}x. Change (F)`} title="Game speed (F)">
            <Icon name="fast" size={18} />
            <span>{hud.speed}×</span>
          </button>
        ) : null}
        {has('heights') ? (
          <button type="button" className="icon-btn" onClick={() => controller.toggleHeights()} aria-pressed={hud.showHeights} aria-label="Show ground heights (H)" title="Ground heights (H)">
            <Icon name="heights" />
          </button>
        ) : null}
        <div className="menu-wrap" ref={menuRef}>
          <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} aria-label="Menu" title="Menu">
            <Icon name="menu" />
          </button>
          {menu ? (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={() => pick('levels')}>
                <Icon name="map" size={18} /> Level map <kbd>M</kbd>
              </button>
              {has('journal') ? (
                <button type="button" role="menuitem" onClick={() => pick('journal')}>
                  <Icon name="journal" size={18} /> Journal <kbd>J</kbd>
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={() => controller.setSetting('sound', !hud.sound)}>
                <Icon name={hud.sound ? 'soundOn' : 'soundOff'} size={18} /> {hud.sound ? 'Sound on' : 'Sound off'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  controller.restartLevel();
                }}
              >
                <Icon name="restart" size={18} /> Restart level
              </button>
              {obj?.canSkip ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    controller.skipLevel();
                  }}
                >
                  <Icon name="skip" size={18} /> Skip this level
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={() => pick('settings')}>
                <Icon name="settings" size={18} /> Settings &amp; help
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(TopBar);
