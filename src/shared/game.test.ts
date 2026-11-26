import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fallbackClose,
  formatCountdown,
  msUntilReveal,
  pointsForDiff,
  utcToday,
  utcYesterday,
} from './game.ts';

describe('dates', () => {
  test('utcToday / utcYesterday step back exactly one day', () => {
    assert.equal(utcYesterday('2026-11-26'), '2026-11-25');
    assert.equal(utcYesterday('2026-01-01'), '2025-12-31');
    assert.equal(utcToday(new Date('2026-11-26T05:26:00Z')), '2026-11-26');
  });

  test('msUntilReveal lands between 0 and 24h', () => {
    const ms = msUntilReveal(new Date('2026-11-26T05:26:00Z'));
    assert.ok(ms > 0);
    assert.ok(ms <= 24 * 60 * 60 * 1000);
  });

  test('formatCountdown pads hours, minutes, seconds', () => {
    assert.equal(formatCountdown(3661000), '01:01:01');
    assert.equal(formatCountdown(0), '00:00:00');
  });
});

describe('scoring', () => {
  test('perfect guess is 1000 points, $1 off is 999, $1000+ off is 0', () => {
    assert.equal(pointsForDiff(0), 1000);
    assert.equal(pointsForDiff(1), 999);
    assert.equal(pointsForDiff(10.4), 990);
    assert.equal(pointsForDiff(1000), 0);
    assert.equal(pointsForDiff(5000), 0);
  });
});

describe('fallback close', () => {
  test('deterministic per date and inside the plausible band', () => {
    assert.equal(fallbackClose('2026-11-26'), fallbackClose('2026-11-26'));
    const price = fallbackClose('2026-11-26');
    assert.ok(price >= 3450);
    assert.ok(price <= 3750);
    assert.notEqual(fallbackClose('2026-11-27'), price);
  });
});
