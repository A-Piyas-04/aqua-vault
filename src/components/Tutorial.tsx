'use client';

import type { GameController, HudSnapshot } from '@/game/controller';

export default function Tutorial({ snap, controller }: { snap: HudSnapshot; controller: GameController }) {
  const t = snap.tutorial;
  if (!t) return null;
  return (
    <div className={`tutorial ${t.finished ? 'done' : ''}`} role="note">
      <div className="tut-kicker">
        <span className="tut-step" aria-hidden="true">
          {t.finished ? 'Done' : `Step ${t.step + 1}/${t.total}`}
        </span>
        <strong className="tut-lesson">{t.lessonTitle}</strong>
      </div>
      <h3>
        {t.bn ? <span className="bn">{t.bn} · </span> : null}
        {t.title}
      </h3>
      <p>{t.text}</p>
      {t.careful?.length ? (
        <ul className="tut-careful">
          {t.careful.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      <div className="tut-actions">
        {t.finished ? (
          <button type="button" className="action" onClick={() => controller.continueLesson()}>
            {t.nextId ? 'Next lesson' : 'Continue'}
          </button>
        ) : null}
        <button type="button" className="text-btn" onClick={() => (t.finished ? controller.dismissTutorial() : controller.skipTutorial())}>
          {t.finished ? 'Stay here' : 'Skip lesson'}
        </button>
      </div>
    </div>
  );
}
