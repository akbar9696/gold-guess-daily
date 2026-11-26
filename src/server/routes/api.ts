import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  GameState,
  GuessResponse,
  LeaderboardEntry,
  YesterdayResult,
} from '../../shared/api';
import {
  isYesterday,
  msUntilReveal,
  pointsForDiff,
  utcToday,
  utcYesterday,
} from '../../shared/game';
import { fetchLiveSpot, finalizeClose, getClose, lastPriceFetchError } from '../core/price';
import { fallbackClose } from '../../shared/game';

export const api = new Hono();

type UserStats = {
  streak: number;
  bestDiff: number | null;
  totalGuesses: number;
  daysPlayed: number;
  totalPoints: number;
  wins: number;
  lastPlayed: string;
  username: string;
};

const emptyStats = (username = ''): UserStats => ({
  streak: 0,
  bestDiff: null,
  totalGuesses: 0,
  daysPlayed: 0,
  totalPoints: 0,
  wins: 0,
  lastPlayed: '',
  username,
});

const readStats = async (userId: string): Promise<UserStats> => {
  const raw = await redis.hGetAll(`user:${userId}`);
  if (!raw || Object.keys(raw).length === 0) return emptyStats();
  const best = raw.bestDiff ? parseFloat(raw.bestDiff) : null;
  return {
    streak: parseInt(raw.streak ?? '0', 10) || 0,
    bestDiff: best !== null && Number.isFinite(best) ? best : null,
    totalGuesses: parseInt(raw.totalGuesses ?? '0', 10) || 0,
    daysPlayed: parseInt(raw.daysPlayed ?? '0', 10) || 0,
    totalPoints: parseInt(raw.totalPoints ?? '0', 10) || 0,
    wins: parseInt(raw.wins ?? '0', 10) || 0,
    lastPlayed: raw.lastPlayed ?? '',
    username: raw.username ?? '',
  };
};

const writeStats = async (userId: string, s: UserStats): Promise<void> => {
  await redis.hSet(`user:${userId}`, {
    streak: String(s.streak),
    bestDiff: s.bestDiff === null ? '' : String(s.bestDiff),
    totalGuesses: String(s.totalGuesses),
    daysPlayed: String(s.daysPlayed),
    totalPoints: String(s.totalPoints),
    wins: String(s.wins),
    lastPlayed: s.lastPlayed,
    username: s.username,
  });
};

const getIdentity = async (): Promise<{ id: string; username: string } | null> => {
  const user = await reddit.getCurrentUser();
  if (user?.id) return { id: user.id, username: user.username };
  const username = await reddit.getCurrentUsername();
  if (username) return { id: `u:${username}`, username };
  return null;
};

const buildYesterdayResult = async (
  yesterday: string,
  username: string | null
): Promise<YesterdayResult | null> => {
  const close = await getClose(yesterday);
  if (!close) return null;
  const guesses = await redis.hGetAll(`guesses:${yesterday}`);
  const entries = Object.entries(guesses)
    .map(([name, raw]) => {
      const guess = parseFloat(raw);
      return { username: name, guess, diff: Math.abs(guess - close.price) };
    })
    .filter((e) => Number.isFinite(e.guess))
    .sort((a, b) => a.diff - b.diff);

  const winner = entries[0] ?? null;
  const yourRaw = username ? guesses[username] : undefined;
  const yourGuess = yourRaw !== undefined ? parseFloat(yourRaw) : null;
  const yourRank =
    yourGuess !== null && username
      ? entries.findIndex((e) => e.username === username) + 1
      : null;
  return {
    date: yesterday,
    close: close.price,
    source: close.source,
    winner: winner?.username ?? null,
    winnerDiff: winner ? Math.round(winner.diff * 100) / 100 : null,
    yourGuess,
    yourDiff:
      yourGuess === null ? null : Math.round(Math.abs(yourGuess - close.price) * 100) / 100,
    yourRank: yourRank && yourRank > 0 ? yourRank : null,
    totalGuesses: entries.length,
  };
};

const dailyLeaderboard = async (date: string): Promise<LeaderboardEntry[]> => {
  const close = await getClose(date);
  const guesses = await redis.hGetAll(`guesses:${date}`);
  return Object.entries(guesses)
    .map(([username, raw]) => {
      const guess = parseFloat(raw);
      const diff = close ? Math.abs(guess - close.price) : null;
      return {
        username,
        diff: diff === null ? null : Math.round(diff * 100) / 100,
        points: diff === null ? 0 : pointsForDiff(diff),
        wins: 0,
      };
    })
    .filter((r) => Number.isFinite(parseFloat(guesses[r.username] ?? '')))
    .sort((a, b) => (a.diff ?? Infinity) - (b.diff ?? Infinity))
    .slice(0, 10);
};

const allTimeLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  const rows = await redis.zRange('leaderboard:alltime', 0, 9, {
    by: 'rank',
    reverse: true,
  });
  const out: LeaderboardEntry[] = [];
  for (const row of rows) {
    const stats = await readStats(row.member);
    out.push({
      username: stats.username || row.member,
      diff: stats.bestDiff,
      points: row.score,
      wins: stats.wins,
    });
  }
  return out;
};

api.get('/state', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json({ status: 'error', message: 'postId is required but missing from context' }, 400);
  }
  try {
    const today = utcToday();
    const yesterday = utcYesterday(today);
    const identity = await getIdentity();

    // Lazy reveal: if yesterday was never finalized (scheduler missed or
    // this is a fresh install), lock it in now so results always show.
    if (!(await getClose(yesterday))) {
      await finalizeClose(yesterday);
    }

    const [spot, yesterdayResult, daily, allTime] = await Promise.all([
      fetchLiveSpot(),
      buildYesterdayResult(yesterday, identity?.username ?? null),
      dailyLeaderboard(yesterday),
      allTimeLeaderboard(),
    ]);

    const yourGuessRaw = identity
      ? await redis.hGet(`guesses:${today}`, identity.username)
      : undefined;
    const parsed = yourGuessRaw ? parseFloat(yourGuessRaw) : NaN;
    const yourGuess = Number.isFinite(parsed) ? parsed : null;
    const stats = identity ? await readStats(identity.id) : emptyStats();

    const state: GameState = {
      type: 'state',
      postId,
      username: identity?.username ?? 'anonymous',
      today,
      yesterday,
      livePrice: spot?.price ?? fallbackClose(today),
      livePriceAt: spot?.at ?? null,
      priceSource: spot ? 'live' : 'fallback',
      debugPriceError: lastPriceFetchError,
      yourGuess,
      locked: yourGuess !== null,
      revealInMs: msUntilReveal(),
      yesterdayResult,
      dailyLeaderboard: daily,
      allTimeLeaderboard: allTime,
      stats: {
        streak: stats.streak,
        bestDiff: stats.bestDiff,
        totalGuesses: stats.totalGuesses,
        daysPlayed: stats.daysPlayed,
        totalPoints: stats.totalPoints,
        wins: stats.wins,
      },
    };
    return c.json(state);
  } catch (error) {
    console.error('API state error:', error);
    return c.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to load game state' },
      500
    );
  }
});

api.post('/guess', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json({ status: 'error', message: 'postId is required but missing from context' }, 400);
  }
  try {
    const identity = await getIdentity();
    if (!identity) {
      return c.json({ status: 'error', message: 'Log in to Reddit to play Gold Guess.' }, 401);
    }

    const body = (await c.req.json().catch(() => ({}))) as { guess?: unknown };
    const guess =
      typeof body.guess === 'number'
        ? body.guess
        : typeof body.guess === 'string'
          ? parseFloat(body.guess)
          : NaN;
    if (!Number.isFinite(guess) || guess < 100 || guess > 20000) {
      return c.json({ status: 'error', message: 'Enter a guess between $100 and $20,000.' }, 400);
    }
    const rounded = Math.round(guess * 100) / 100;
    const today = utcToday();

    // One guess per player per day: hSetNX only writes when absent.
    const written = await redis.hSetNX(`guesses:${today}`, identity.username, String(rounded));
    if (written === 0) {
      return c.json(
        { status: 'error', message: 'Your guess for today is already locked in. Come back tomorrow!' },
        409
      );
    }

    const stats = await readStats(identity.id);
    const playedYesterday = isYesterday(stats.lastPlayed, today);
    const alreadyPlayedToday = stats.lastPlayed === today;
    const next: UserStats = {
      ...stats,
      username: identity.username,
      streak: alreadyPlayedToday ? stats.streak : playedYesterday ? stats.streak + 1 : 1,
      totalGuesses: stats.totalGuesses + 1,
      daysPlayed: alreadyPlayedToday ? stats.daysPlayed : stats.daysPlayed + 1,
      lastPlayed: today,
    };
    await writeStats(identity.id, next);
    // Username -> user id, so the reveal job can credit points/wins.
    await redis.set(`userbyname:${identity.username}`, identity.id);

    return c.json<GuessResponse>({ type: 'guess', guess: rounded, date: today, locked: true });
  } catch (error) {
    console.error('API guess error:', error);
    return c.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Failed to save guess' },
      500
    );
  }
});
