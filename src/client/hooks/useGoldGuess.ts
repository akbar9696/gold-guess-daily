import { useCallback, useEffect, useState } from 'react';
import type { GameState, GuessResponse } from '../../shared/api';

const fetchState = async (): Promise<GameState> => {
  const res = await fetch('/api/state');
  const data = (await res.json()) as GameState & { status?: string; message?: string };
  if (!res.ok || data.status === 'error') {
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
  return data;
};

export const useGoldGuess = () => {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await fetchState());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the game');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchState();
        if (!cancelled) {
          setState(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load the game');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitGuess = useCallback(
    async (guess: number): Promise<boolean> => {
      setSubmitting(true);
      try {
        const res = await fetch('/api/guess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guess }),
        });
        const data = (await res.json()) as GuessResponse & { status?: string; message?: string };
        if (!res.ok || data.status === 'error') {
          setError(data.message ?? `HTTP ${res.status}`);
          return false;
        }
        await load();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save guess');
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [load]
  );

  return { state, loading, error, submitting, submitGuess, reload: load };
};
