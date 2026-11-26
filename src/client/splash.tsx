import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { formatUsd } from '../shared/game';
import type { GameState } from '../shared/api';

export const Splash = () => {
  const [spot, setSpot] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return;
        const data = (await res.json()) as GameState;
        if (data.type === 'state') {
          setSpot(data.livePrice);
          setLocked(data.locked);
        }
      } catch {
        // Splash stays usable offline of the API; the game view retries.
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#14100a] px-4 text-center text-amber-50">
      <p className="text-5xl">🥇</p>
      <h1 className="gold-text text-3xl font-black">Gold Guess</h1>
      <p className="max-w-[300px] text-sm text-amber-100/80">
        Guess today's gold close. One guess a day — closest wins the day.
      </p>
      <div className="gold-card rounded-2xl px-5 py-3">
        <p className="text-[11px] uppercase tracking-widest text-amber-200/60">Live gold spot</p>
        <p className="text-2xl font-black text-amber-100">{spot ? formatUsd(spot) : '…'}</p>
        <p className="text-[11px] text-amber-100/50">
          {locked ? 'Your guess for today is locked 🔒' : 'Tap to play — it takes 10 seconds'}
        </p>
      </div>
      <button
        className="gold-btn rounded-full px-6 py-2.5 text-sm font-black"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        {locked ? 'See my guess' : '🎯 Play today’s round'}
      </button>
      <p className="text-[11px] text-amber-100/40">
        Hey {context.username ?? 'Redditor'} · r/dailygoldguess
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
