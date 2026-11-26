export type LeaderboardEntry = {
  username: string;
  diff: number | null;
  points: number;
  wins: number;
};

export type YesterdayResult = {
  date: string;
  close: number;
  source: 'live' | 'fallback';
  winner: string | null;
  winnerDiff: number | null;
  yourGuess: number | null;
  yourDiff: number | null;
  yourRank: number | null;
  totalGuesses: number;
};

export type GameState = {
  type: 'state';
  postId: string;
  username: string;
  today: string;
  yesterday: string;
  livePrice: number | null;
  livePriceAt: string | null;
  priceSource: 'live' | 'fallback' | 'unavailable';
  debugPriceError?: string | null;
  yourGuess: number | null;
  locked: boolean;
  revealInMs: number;
  yesterdayResult: YesterdayResult | null;
  dailyLeaderboard: LeaderboardEntry[];
  allTimeLeaderboard: LeaderboardEntry[];
  stats: {
    streak: number;
    bestDiff: number | null;
    totalGuesses: number;
    daysPlayed: number;
    totalPoints: number;
    wins: number;
  };
};

export type GuessResponse = {
  type: 'guess';
  guess: number;
  date: string;
  locked: true;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};
