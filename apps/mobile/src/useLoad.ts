import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

/** Charge des données à chaque affichage de l'écran (retour compris). */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const version = useRef(0);
  const reload = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (current === version.current) setData(result);
    } catch (err) {
      if (current === version.current) { setData(null); setError((err as Error).message); }
    } finally {
      if (current === version.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => { version.current++; };
    }, [reload]),
  );

  return { data, error, loading, reload, setData };
}
