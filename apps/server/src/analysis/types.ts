import type { AlertSource, CheckKey, Verdict } from "@vigie/shared";

/** Message à analyser, quelle que soit sa provenance (mail, SMS, WhatsApp, partage). */
export interface MessageInput {
  source: AlertSource;
  /** Nom affiché de l'expéditeur (« Service Client Ameli »). */
  fromName?: string | null;
  /** Adresse mail de l'expéditeur. */
  fromAddress?: string | null;
  /** Numéro ou identifiant SMS de l'expéditeur. */
  senderId?: string | null;
  subject?: string | null;
  text: string;
  html?: string | null;
  /** En-têtes utiles des mails. */
  headers?: {
    authenticationResults?: string[];
    replyTo?: string | null;
  };
  receivedAt: Date;
}

export type FindingLevel = "ok" | "warning" | "danger";

/** Un constat factuel, rédigé pour être lu par l'utilisateur. */
export interface Finding {
  check: CheckKey;
  level: FindingLevel;
  /** 0–100 : contribution au score de risque. */
  weight: number;
  reason: string;
}

export interface LinkInfo {
  url: string;
  host: string;
  /** Texte visible du lien (mails HTML). */
  label: string | null;
  finalUrl: string | null;
  finalHost: string | null;
  domainAgeDays: number | null;
}

export interface SiteScan {
  url: string;
  finalUrl: string;
  chain: string[];
  title: string;
  hasPasswordField: boolean;
  hasCardField: boolean;
  /** Capture JPEG en base64 (jamais stockée). */
  screenshot: string | null;
  /** Faux si le site n'a pas répondu (hors ligne, supprimé, bloqué). */
  reachable: boolean;
}

export interface AnalysisResult {
  verdict: Verdict;
  explanation: string;
  advice: string;
  title: string;
  findings: Finding[];
  links: LinkInfo[];
  /** Marque imitée, si identifiée. */
  brand: string | null;
  aiUsed: boolean;
}
