import type { CallCheckResponse } from "@vigie/shared";

/** Dernier résultat de vérification d'appel, partagé entre les écrans du parcours. */
let last: (CallCheckResponse & { offline?: boolean }) | null = null;

export const callState = {
  get: () => last,
  set: (v: (CallCheckResponse & { offline?: boolean }) | null) => {
    last = v;
  },
};
