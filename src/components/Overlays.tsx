'use client';

import { memo } from 'react';
import type { GameController } from '@/game/controller';
import { TOOL_INFO } from '@/game/content/strings';
import { Dialog } from './Dialog';
import { Icon } from './Icons';
import { Stars } from './ObjectiveCard';
import { formatTime, useSlice } from './useGame';

/** Level intro, new-tool cards and the level-complete card. The game waits while one is open. */
function Overlays({ controller }: { controller: GameController }) {
  const ov = useSlice(controller, 'overlay');
  if (!ov || ov.kind === 'none') return null;
  const close = () => controller.dismissOverlay();

  if (ov.kind === 'intro') {
    return (
      <Dialog title={ov.num ? `Level ${ov.num}: ${ov.title}` : ov.title} onClose={close} className="story">
        <p className="story-kicker">{ov.num ? `Level ${ov.num} of 10` : 'Sandbox'}</p>
        <p className="story-title">
          {ov.title} <span className="bn">{ov.bn}</span>
        </p>
        <p className="story-lead">{ov.intro}</p>
        {ov.objectives.length ? (
          <>
            <h3 className="story-h">Your goals</h3>
            <ol className="story-goals">
              {ov.objectives.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </>
        ) : null}
        <div className="story-actions">
          <button type="button" className="action primary big" onClick={close} data-autofocus>
            Start <Icon name="arrowRight" size={18} />
          </button>
        </div>
      </Dialog>
    );
  }

  if (ov.kind === 'tool') {
    const t = TOOL_INFO[ov.tool];
    return (
      <Dialog title={`New tool: ${t.name}`} onClose={close} className="story tool-card">
        <div className="tool-card-hero" aria-hidden="true">
          <Icon name={t.icon} size={44} />
        </div>
        <p className="story-kicker">New tool</p>
        <p className="story-title">
          {t.name} {t.bn ? <span className="bn">{t.bn}</span> : null}
        </p>
        {t.intro ? (
          <dl className="tool-facts">
            <div>
              <dt>What it does</dt>
              <dd>{t.intro.does}</dd>
            </div>
            <div>
              <dt>Where it goes</dt>
              <dd>{t.intro.where}</dd>
            </div>
            <div>
              <dt>What it needs</dt>
              <dd>{t.intro.needs}</dd>
            </div>
          </dl>
        ) : null}
        <div className="story-actions">
          <button type="button" className="action primary big" onClick={close} data-autofocus>
            {ov.more ? 'Next' : 'Got it'}
          </button>
        </div>
      </Dialog>
    );
  }

  // Level complete.
  const improved = ov.stars > ov.previousStars;
  return (
    <Dialog title={`Level ${ov.num} complete`} onClose={close} className="story complete-card">
      <p className="story-kicker">{ov.num ? `Level ${ov.num} complete` : 'Complete'}</p>
      <p className="story-title">{ov.title}</p>
      <div className="big-stars">
        <Stars n={ov.stars} size={44} />
      </div>
      <ul className="result-lines">
        <li className={ov.spent <= ov.parMaterials ? 'ok' : ''}>
          <Icon name={ov.spent <= ov.parMaterials ? 'starFill' : 'star'} size={16} /> Spent {ov.spent} (target ≤ {ov.parMaterials})
        </li>
        <li className={ov.seconds <= ov.parSeconds ? 'ok' : ''}>
          <Icon name={ov.seconds <= ov.parSeconds ? 'starFill' : 'star'} size={16} /> Time {formatTime(ov.seconds)} (target {formatTime(ov.parSeconds)})
        </li>
      </ul>
      <p className="xp-line">
        {ov.xpGained > 0 ? `+${ov.xpGained} XP` : improved ? 'Best result kept' : 'No new XP: beat your stars to earn more'}
        {ov.rankUp ? ` · New rank: ${ov.rankUp}` : ''}
      </p>
      {ov.next ? (
        <div className="next-preview">
          <span className="story-h">Next: {ov.next === 'sandbox' ? 'Open village (free play)' : ov.nextTitle}</span>
          {ov.nextTools.length ? (
            <span className="next-tools">
              {ov.nextTools.map((t) => (
                <span key={t} className="next-tool">
                  <Icon name={TOOL_INFO[t].icon} size={18} /> {TOOL_INFO[t].name}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="story-actions">
        <button type="button" className="action" onClick={() => controller.restartLevel()}>
          <Icon name="restart" size={16} /> Replay
        </button>
        <button type="button" className="action" onClick={close}>
          Stay here
        </button>
        {ov.next ? (
          <button type="button" className="action primary big" onClick={() => controller.goNextLevel()} data-autofocus>
            {ov.next === 'sandbox' ? 'Open village' : 'Next level'} <Icon name="arrowRight" size={18} />
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}

export default memo(Overlays);
