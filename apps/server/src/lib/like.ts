/** Échappe `%`, `_` et `\` saisis par l'utilisateur avant un `like`/`ilike` (échappement par défaut de Postgres : `\`). */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, "\\$&");
