// Pure helpers shared by client and server. No imports, no I/O.

export const utcToday = (now = new Date()): string =>
  now.toISOString().slice(0, 10);

export const utcYesterday = (today: string): string => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export const isYesterday = (lastPlayed: string, today: string): boolean =>
  lastPlayed === utcYesterday(today);

/** ms until the next UTC midnight (the daily reveal). */
export const msUntilReveal = (now = new Date()): number => {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
};

export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/**
 * Deterministic fallback close for a date, used ONLY when the live gold
 * price endpoint cannot be reached. It is a stable pseudo-price derived
 * from the date (same date -> same value), clearly labelled `fallback`
 * wherever it is shown. It is NOT a real historical close.
 */
export const fallbackClose = (date: string): number => {
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
  }
  // Plausible band around the late-Nov 2026 spot (~$3,590): $3,450–$3,750.
  return Math.round((3450 + (hash % 30000) / 100) * 100) / 100;
};

/** Points for a guess: 1000 at a perfect hit, -1 per $1 off, floor 0. */
export const pointsForDiff = (diff: number): number =>
  Math.max(0, Math.round(1000 - diff));

export const formatUsd = (n: number): string =>
  `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const formatDiff = (diff: number | null): string =>
  diff === null ? '—' : `$${diff.toFixed(2)} off`;
