import type { Tone } from "./design.ts";

/** Verdict unique utilisé partout : mails, SMS, messageries, partages. */
export type Verdict = "safe" | "suspicious" | "scam";

/** Nom d'icône du jeu d'icônes Vigie (dessiné côté app et console). */
export type IconName =
  | "shield"
  | "check"
  | "alert"
  | "stop"
  | "phone"
  | "phoneOff"
  | "mail"
  | "message"
  | "link"
  | "globe"
  | "text"
  | "user"
  | "bank"
  | "clock"
  | "chevron"
  | "back"
  | "plus"
  | "share"
  | "heart"
  | "search"
  | "close"
  | "chart"
  | "logout";

export interface VerdictMeta {
  tone: Tone;
  /** Le mot affiché à côté de l'icône. */
  label: string;
  icon: IconName;
  /** Rang de gravité, pour trier et agréger. */
  severity: 0 | 1 | 2;
}

export const verdicts: Record<Verdict, VerdictMeta> = {
  safe: { tone: "positive", label: "Sûr", icon: "check", severity: 0 },
  suspicious: { tone: "warning", label: "Douteux", icon: "alert", severity: 1 },
  scam: { tone: "danger", label: "Arnaque", icon: "stop", severity: 2 },
};

/** États d'un appel : même logique visuelle que les verdicts. */
export type CallVerdict = "certified" | "uncertified";

export const callVerdicts: Record<CallVerdict, { tone: Tone; label: string; icon: IconName }> = {
  certified: { tone: "positive", label: "Appel certifié", icon: "check" },
  uncertified: { tone: "danger", label: "Appel non certifié", icon: "stop" },
};

export function worstVerdict(list: Verdict[]): Verdict {
  return list.reduce<Verdict>((acc, v) => (verdicts[v].severity > verdicts[acc].severity ? v : acc), "safe");
}
