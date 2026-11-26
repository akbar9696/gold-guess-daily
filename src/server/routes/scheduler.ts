import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import { pointsForDiff, utcToday, utcYesterday } from '../../shared/game';
import { finalizeClose } from '../core/price';
import { createPost } from '../core/post';

export const scheduler = new Hono();

/**
 * Runs daily at 00:05 UTC (see devvit.json). Locks in yesterday's gold
 * close from the live endpoint, then scores every guess: points go to the
 * all-time leaderboard, the closest guesser gets a win, and each player's
 * best (smallest) diff is updated. Idempotent: a `scored:<date>` flag
 * stops a second run from crediting points twice.
 */
scheduler.post('/daily-reveal', async (c) => {
  try {
    const today = utcToday();
    const yesterday = utcYesterday(today);
    const close = await finalizeClose(yesterday);

    const scoredKey = `scored:${yesterday}`;
    if (await redis.get(scoredKey)) {
      return c.json({ status: 'ok', message: `${yesterday} already scored`, close: close.price });
    }

    const guesses = await redis.hGetAll(`guesses:${yesterday}`);
    const entries = Object.entries(guesses)
      .map(([username, raw]) => ({
        username,
        guess: parseFloat(raw),
        diff: Math.abs(parseFloat(raw) - close.price),
      }))
      .filter((e) => Number.isFinite(e.guess))
      .sort((a, b) => a.diff - b.diff);

    for (const entry of entries) {
      const userId = await redis.get(`userbyname:${entry.username}`);
      if (!userId) continue;
      const points = pointsForDiff(entry.diff);
      await redis.zIncrBy('leaderboard:alltime', userId, points);
      const raw = await redis.hGetAll(`user:${userId}`);
      const best = raw.bestDiff ? parseFloat(raw.bestDiff) : null;
      const updates: Record<string, string> = {
        totalPoints: String((parseInt(raw.totalPoints ?? '0', 10) || 0) + points),
      };
      if (best === null || entry.diff < best) {
        updates.bestDiff = String(Math.round(entry.diff * 100) / 100);
      }
      if (entries[0] && entry.username === entries[0].username) {
        updates.wins = String((parseInt(raw.wins ?? '0', 10) || 0) + 1);
      }
      await redis.hSet(`user:${userId}`, updates);
    }

    await redis.set(scoredKey, '1');
    return c.json({
      status: 'ok',
      date: yesterday,
      close: close.price,
      source: close.source,
      guesses: entries.length,
      winner: entries[0]?.username ?? null,
    });
  } catch (error) {
    console.error('daily-reveal error:', error);
    return c.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Reveal failed' },
      500
    );
  }
});

/** Runs daily at 00:10 UTC: posts a fresh Gold Guess game for the new day. */
scheduler.post('/daily-post', async (c) => {
  try {
    const post = await createPost();
    return c.json({ status: 'ok', postId: post.id, date: utcToday() });
  } catch (error) {
    console.error('daily-post error:', error);
    return c.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Daily post failed' },
      500
    );
  }
});
