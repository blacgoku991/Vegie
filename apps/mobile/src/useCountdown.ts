import { useEffect, useState } from "react";

/** Compte à rebours en secondes : `start(n)` le (re)lance, `left` tombe à 0 à échéance. */
export function useCountdown(initial = 0) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: setLeft };
}

/** Délai minimal entre deux envois de code, côté serveur (45 s par numéro). */
export const RESEND_DELAY = 45;
