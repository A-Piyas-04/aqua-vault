'use client';

import { memo, useEffect, useRef } from 'react';
import type { GameController } from '@/game/controller';
import { Icon } from './Icons';
import { useSlice } from './useGame';

/**
 * Details for the tapped building or tile. On wide screens it floats beside the thing
 * inspected and follows it as the camera moves; on narrow screens it is a bottom sheet.
 */
function InspectorPopover({ controller }: { controller: GameController }) {
  const { info } = useSlice(controller, 'inspect') ?? { info: null };
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!info) return;
    let raf = 0;
    const place = () => {
      raf = requestAnimationFrame(place);
      const el = ref.current;
      const stage = el?.parentElement;
      if (!el || !stage) return;
      if (window.innerWidth < 720) {
        el.style.transform = '';
        el.classList.add('sheet');
        return;
      }
      el.classList.remove('sheet');
      const a = controller.inspectAnchor();
      const W = stage.clientWidth;
      const Hh = stage.clientHeight;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let x = a ? a.x + 28 : W - w - 16;
      let y = a ? a.y - h / 2 : 80;
      if (a && x + w > W - 12) x = a.x - w - 28;
      x = Math.max(12, Math.min(W - w - 12, x));
      y = Math.max(72, Math.min(Hh - h - 120, y));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [info, controller]);
  if (!info) return null;
  return (
    <div ref={ref} className="inspector" role="region" aria-label={`${info.title} details`}>
      <div className="insp-head">
        <h2>
          {info.title}
          {info.bn ? <span className="bn"> · {info.bn}</span> : null}
        </h2>
        <button type="button" className="icon-btn small ghost" onClick={() => controller.clearSelection()} aria-label="Close details">
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
            <button key={a.id} type="button" className={`action ${a.id === 'remove' ? 'danger' : ''}`} disabled={!a.enabled} onClick={() => controller.inspectAction(a)}>
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {info.note ? <p className="note">{info.note}</p> : null}
    </div>
  );
}

export default memo(InspectorPopover);
