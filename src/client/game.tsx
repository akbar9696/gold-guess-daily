import './index.css';

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { navigateTo, showToast } from '@devvit/web/client';
import { useGoldGuess } from './hooks/useGoldGuess';
import { formatCountdown, formatDiff, formatUsd } from '../shared/game';
import type { GameState } from '../shared/api';

type Tab = 'play' | 'results' | 'leaders';

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col items-center rounded-xl bg-black/30 px-2 py-2">
    <span className="text-base font-bold text-amber-100">{value}</span>
    <span className="text-[10px] uppercase tracking-wider text-amber-200/60">{label}</span>
  </div>
);

const PlayTab = ({
  state,
  submitGuess,
  submitting,
}: {
  state: GameState;
  submitGuess: (n: number) => Promise<boolean>;
  submitting: boolean;
}) => {
  const [guess, setGuess] = useState<number>(Math.round(state.livePrice ?? 3600));
  const [done, setDone] = useState(false);
  const [countdown, setCountdown] = useState(formatCountdown(state.revealInMs));

  useEffect(() => {
    const target = Date.now() + state.revealInMs;
    const tick = () => setCountdown(formatCountdown(target - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state.revealInMs]);

  const live = state.livePrice ?? 3600;
  const min = Math.floor(live - 200);
  const max = Math.ceil(live + 200);
  const chips = useMemo(() => [-50, -10, 10, 50], []);

  if (state.locked || done) {
    const myGuess = state.yourGuess ?? guess;
    const shareText = `🥇 Gold Guess ${state.today}: I locked in ${formatUsd(myGuess)} for today's gold close. Closest guess wins the day — what's yours? r/dailygoldguess`;
    return (
      <div className="flex flex-col gap-3">
        <div className="gold-card rounded-2xl p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-amber-200/70">Your guess is locked 🔒</p>
          <p className="gold-text mt-1 text-4xl font-black">{formatUsd(myGuess)}</p>
          <p className="mt-1 text-xs text-amber-100/70">
            The real close is revealed at midnight UTC. Come back tomorrow to see how close you were.
          </p>
          <p className="mt-2 text-sm font-mono text-amber-200">⏳ Reveal in {countdown}</p>
        </div>
        <button
          className="gold-btn w-full rounded-full py-2.5 text-sm font-bold"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareText);
              showToast('Guess copied — paste it in the comments!');
            } catch {
              showToast(shareText);
            }
          }}
        >
          📣 Share my guess
        </button>
        <button
          className="w-full rounded-full border border-amber-500/50 py-2.5 text-sm font-semibold text-amber-200"
          onClick={() => navigateTo(`https://www.reddit.com/r/dailygoldguess/comments/${state.postId}`)}
        >
          💬 Discuss in the comments
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="gold-card rounded-2xl p-4">
        <p className="text-center text-xs uppercase tracking-widest text-amber-200/70">
          What will gold close at today?
        </p>
        <p className="mt-2 text-center text-4xl font-black text-amber-100">
          <span className="text-amber-400">$</span>
          <input
            type="number"
            value={guess}
            min={100}
            max={20000}
            step={0.01}
            onChange={(e) => setGuess(parseFloat(e.target.value) || 0)}
            className="w-40 bg-transparent text-center outline-none [appearance:textfield]"
            aria-label="Your gold price guess in USD"
          />
        </p>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={Math.min(max, Math.max(min, guess))}
          onChange={(e) => setGuess(parseInt(e.target.value, 10))}
          className="gold-range mt-3 w-full"
          aria-label="Guess slider"
        />
        <div className="flex justify-between text-[11px] text-amber-200/60">
          <span>{formatUsd(min)}</span>
          <span>Live spot: {formatUsd(live)}</span>
          <span>{formatUsd(max)}</span>
        </div>
        <div className="mt-3 flex justify-center gap-2">
          {chips.map((d) => (
            <button
              key={d}
              className="rounded-full border border-amber-500/50 px-3 py-1 text-xs font-semibold text-amber-200"
              onClick={() => setGuess(Math.round((live + d) * 100) / 100)}
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
          <button
            className="rounded-full border border-amber-500/50 px-3 py-1 text-xs font-semibold text-amber-200"
            onClick={() => setGuess(Math.round(live * 100) / 100)}
          >
            = spot
          </button>
        </div>
      </div>
      <button
        className="gold-btn w-full rounded-full py-3 text-base font-black disabled:opacity-50"
        disabled={submitting || guess < 100 || guess > 20000}
        onClick={async () => {
          const ok = await submitGuess(guess);
          if (ok) {
            setDone(true);
            showToast('Guess locked in. Good luck! 🥇');
          }
        }}
      >
        {submitting ? 'Locking in…' : `🔒 Lock in ${formatUsd(guess)}`}
      </button>
      <p className="text-center text-[11px] text-amber-100/50">
        One guess per day. The live spot is a hint, not the answer — the close is what counts.
      </p>
    </div>
  );
};

const ResultsTab = ({ state }: { state: GameState }) => {
  const r = state.yesterdayResult;
  if (!r) {
    return <p className="py-6 text-center text-sm text-amber-100/70">No results yet — the first reveal happens at midnight UTC.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="gold-card rounded-2xl p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-amber-200/70">Yesterday · {r.date}</p>
        <p className="mt-1 text-sm text-amber-100/80">Actual gold close</p>
        <p className="gold-text text-4xl font-black">{formatUsd(r.close)}</p>
        <p className="mt-1 text-[11px] text-amber-100/50">
          {r.source === 'live' ? 'Source: live gold price (gold-api.com)' : 'Source: fallback estimate — live feed was unreachable'}
        </p>
      </div>
      <div className="gold-card rounded-2xl p-4">
        <p className="text-sm">
          👑 <b>{r.winner ?? 'No winner yet'}</b>
          {r.winnerDiff !== null && (
            <span className="text-amber-100/80"> — only {formatDiff(r.winnerDiff)}</span>
          )}
        </p>
        <p className="mt-1 text-sm text-amber-100/80">
          {r.yourGuess !== null
            ? `You guessed ${formatUsd(r.yourGuess)} — ${formatDiff(r.yourDiff)}${r.yourRank ? ` · #${r.yourRank} of ${r.totalGuesses}` : ''}.`
            : `You didn't guess yesterday. ${r.totalGuesses} ${r.totalGuesses === 1 ? 'player' : 'players'} did.`}
        </p>
      </div>
      <div className="gold-card rounded-2xl p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-200/70">
          Yesterday's closest guesses
        </p>
        {state.dailyLeaderboard.length === 0 ? (
          <p className="text-sm text-amber-100/70">No guesses yesterday.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {state.dailyLeaderboard.slice(0, 5).map((e, i) => (
              <li key={e.username} className="flex justify-between text-sm">
                <span>
                  {i + 1}. <b>u/{e.username}</b>
                </span>
                <span className="text-amber-200">{formatDiff(e.diff)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

const LeadersTab = ({ state }: { state: GameState }) => (
  <div className="flex flex-col gap-3">
    <div className="gold-card rounded-2xl p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-200/70">🏆 All-time points</p>
      {state.allTimeLeaderboard.length === 0 ? (
        <p className="text-sm text-amber-100/70">
          No points yet — points are awarded at each midnight reveal. Closest guess earns up to 1,000 points.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {state.allTimeLeaderboard.map((e, i) => (
            <li key={e.username} className="flex justify-between text-sm">
              <span>
                {i + 1}. <b>u/{e.username}</b>
                {e.wins > 0 && <span className="text-amber-200"> · 👑×{e.wins}</span>}
              </span>
              <span className="text-amber-200">{e.points.toLocaleString()} pts</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11px] text-amber-100/50">
        Points: 1,000 for a perfect hit, minus 1 per $1 off. Best diff shown on your profile card.
      </p>
    </div>
  </div>
);

export const App = () => {
  const { state, loading, error, submitGuess, submitting } = useGoldGuess();
  const [tab, setTab] = useState<Tab>('play');

  if (loading || !state) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#14100a] text-amber-100">
        <p className="text-4xl">🥇</p>
        <p className="text-sm">Polishing the gold…</p>
        {error && <p className="px-6 text-center text-xs text-red-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col gap-3 bg-[#14100a] px-3 py-4 text-amber-50">
      <header className="text-center">
        <h1 className="gold-text text-3xl font-black tracking-tight">🥇 Gold Guess</h1>
        <p className="text-xs text-amber-100/70">
          Guess today's gold close · {state.today} · u/{state.username}
        </p>
      </header>

      <div className="grid grid-cols-4 gap-2">
        <Stat label="Streak" value={`🔥 ${state.stats.streak}`} />
        <Stat label="Best diff" value={formatDiff(state.stats.bestDiff)} />
        <Stat label="Guesses" value={String(state.stats.totalGuesses)} />
        <Stat label="Points" value={state.stats.totalPoints.toLocaleString()} />
      </div>

      <div className="gold-card flex items-center justify-between rounded-2xl px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-amber-200/60">Live gold spot (XAU/USD)</p>
          <p className="text-2xl font-black text-amber-100">{formatUsd(state.livePrice ?? 0)}</p>
          {state.priceSource !== 'live' && state.debugPriceError && (
            <p className="mt-1 max-w-[300px] text-[10px] text-red-300">debug: {state.debugPriceError}</p>
          )}
        </div>
        <span className="rounded-full border border-amber-500/50 px-2 py-1 text-[10px] font-semibold text-amber-200">
          {state.priceSource === 'live' ? '● LIVE' : '○ ESTIMATE'}
        </span>
      </div>

      <nav className="flex gap-1 rounded-full bg-black/40 p-1">
        {(
          [
            ['play', '🎯 Play'],
            ['results', '📊 Results'],
            ['leaders', '🏆 Leaders'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full py-2 text-xs font-bold ${
              tab === key ? 'gold-btn' : 'text-amber-200/70'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && <p className="rounded-xl bg-red-900/50 px-3 py-2 text-center text-xs text-red-200">{error}</p>}

      {tab === 'play' && <PlayTab state={state} submitGuess={submitGuess} submitting={submitting} />}
      {tab === 'results' && <ResultsTab state={state} />}
      {tab === 'leaders' && <LeadersTab state={state} />}

      <footer className="mt-auto pt-2 text-center">
        <button
          className="text-xs font-semibold text-amber-300 underline"
          onClick={() => navigateTo('https://www.reddit.com/r/dailygoldguess/')}
        >
          Join r/dailygoldguess
        </button>
        <p className="mt-1 text-[11px] text-amber-100/40">
          One guess a day · Revealed at midnight UTC · Closest guess wins the day
        </p>
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
