'use client';

import type { GameController, HudSnapshot } from '@/game/controller';

export default function Tutorial({ snap, controller }: { snap: HudSnapshot; controller: GameController }) {
  if (!snap.tutorial) return null;
  return (
    <div className="tutorial" role="note">
      <div className="tut-step" aria-hidden="true">
        {snap.tutorial.step + 1}/4
      </div>
      <p>
        {snap.tutorial.bn ? <strong className="bn">{snap.tutorial.bn} · </strong> : null}
        {snap.tutorial.text}
      </p>
      <button type="button" className="text-btn" onClick={() => controller.skipTutorial()}>
        Skip tips
      </button>
    </div>
  );
}
