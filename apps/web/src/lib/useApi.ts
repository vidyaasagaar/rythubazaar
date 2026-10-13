import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal data-loading hook with explicit loading/error states and reload. */
export function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadRef
      .current(controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) setData(d);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted && (err as Error)?.name !== 'AbortError') setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
