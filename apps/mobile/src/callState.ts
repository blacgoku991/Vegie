import type { CallCheckResponse } from "@vigie/shared";

/** Résultat d'une vérification d'appel. `number` : le numéro qui appelle, quand l'app le connaît. */
export type CallCheck = CallCheckResponse & { offline?: boolean; number?: string | null };

/** Dernier résultat de vérification d'appel, partagé entre les écrans du parcours. */
let last: CallCheck | null = null;

export const callState = {
  get: () => last,
  set: (v: CallCheck | null) => {
    last = v;
  },
};
