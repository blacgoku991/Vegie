/**
 * Contrat d'API partagé : serveur ⇄ app mobile ⇄ console banque.
 * Les dates sont des chaînes ISO 8601.
 */
import type { Verdict } from "./verdict.ts";

// ───────────────────────────── Commun ─────────────────────────────

export type AlertSource = "mail" | "sms" | "whatsapp" | "messaging" | "call" | "share";
export type CheckKey = "sender" | "links" | "site" | "text";
export type CheckStatus = "ok" | "warning" | "danger" | "unknown";

/** Une des 4 vérifications d'un mail (ou d'un message). */
export interface AlertCheck {
  key: CheckKey;
  status: CheckStatus;
  /** Titre court, sans jargon : « L'expéditeur ». */
  title: string;
  /** Une phrase simple : « Le mail vient de credit-agricole-securite.com, qui n'est pas le site du Crédit Agricole. » */
  detail: string;
}

export interface AlertSummary {
  id: string;
  source: AlertSource;
  verdict: Verdict;
  /** Ex. « Mail du “Service client Ameli” ». */
  title: string;
  /** La phrase d'explication affichée partout. */
  explanation: string;
  sender: string | null;
  receivedAt: string;
  read: boolean;
}

export interface AlertDetail extends AlertSummary {
  checks: AlertCheck[];
  /** Boîte ou source d'origine (« marie.dupont@orange.fr »). */
  origin: string | null;
  /** Conseil d'action (« Supprimez ce mail. Ne cliquez sur aucun lien. »). */
  advice: string;
  links: Array<{ url: string; finalUrl: string | null; domain: string; domainAgeDays: number | null }>;
}

// ───────────────────────────── App mobile ─────────────────────────────

export interface AuthStartRequest {
  phone: string;
}
export interface AuthVerifyRequest {
  phone: string;
  code: string;
  deviceName?: string;
}
export interface AuthVerifyResponse {
  token: string;
  user: Me;
}

export interface Me {
  id: string;
  phone: string;
  firstName: string | null;
  settings: UserSettings;
}

export interface UserSettings {
  /** Android : raccrocher automatiquement les appels non certifiés se présentant comme une banque. */
  autoHangup: boolean;
  /** Prévenir automatiquement le proche quand une arnaque est détectée. */
  notifyContactOnScam: boolean;
}

export interface RegisterDeviceRequest {
  platform: "ios" | "android" | "web";
  pushToken: string | null;
}

export interface Bank {
  id: string;
  slug: string;
  name: string;
  /** Banque partenaire : ses conseillers peuvent certifier leurs appels. */
  partner: boolean;
  /** Numéro officiel à rappeler en cas de doute. */
  officialPhone: string | null;
}

export type BankLinkStatus = "basic" | "pending" | "certified";

export interface UserBank {
  bank: Bank;
  /**
   * basic : protection de base (numéros et sites officiels connus).
   * pending : la banque doit confirmer le lien.
   * certified : les appels de la banque sont certifiés.
   */
  status: BankLinkStatus;
}

export interface CertifiedCall {
  id: string;
  bankName: string;
  advisorName: string;
  agency: string;
  reason: string;
  /** Numéro depuis lequel le conseiller appelle (E.164). */
  callerNumber: string | null;
  status: CallStatus;
  createdAt: string;
  expiresAt: string;
}

export type CallStatus = "announced" | "seen" | "confirmed" | "ended" | "expired" | "rejected";

/** Réponse au bouton « On m'appelle de ma banque ». */
export interface CallCheckResponse {
  certified: boolean;
  call: CertifiedCall | null;
  /** Banques de l'utilisateur, pour proposer le rappel du numéro officiel. */
  banks: Bank[];
}

export type CallAction = "hung_up" | "called_back" | "alerted_contact" | "confirmed";

export interface CallReportRequest {
  /** Numéro affiché à l'écran, s'il est connu. */
  number?: string | null;
  bankId?: string | null;
  action: CallAction;
  certifiedCallId?: string | null;
}

export type MailProvider = "outlook" | "imap" | "gmail";

export interface Mailbox {
  id: string;
  provider: MailProvider;
  email: string;
  /** « Orange », « Outlook », « Free »… */
  label: string;
  status: "active" | "error" | "paused";
  lastCheckedAt: string | null;
}

export interface ImapPreset {
  id: string;
  label: string;
  host: string;
  port: number;
  /** Domaines d'adresse reconnus automatiquement. */
  domains: string[];
  /** Aide en une phrase si un réglage est nécessaire côté fournisseur. */
  help: string | null;
}

export interface AddImapMailboxRequest {
  presetId: string;
  email: string;
  password: string;
}

export interface MailProviderInfo {
  outlook: boolean;
  gmail: boolean;
  imapPresets: ImapPreset[];
}

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
}

export interface ProtectionSources {
  calls: boolean;
  mails: number;
  messages: boolean;
}

export interface HomeResponse {
  firstName: string | null;
  /** Nombre d'arnaques bloquées depuis l'inscription. */
  blockedCount: number;
  sources: ProtectionSources;
  latestAlerts: AlertSummary[];
  activeCall: CertifiedCall | null;
}

/** Analyse à la demande (Android NotificationListener, extension Partager, message collé). */
export interface ScanMessageRequest {
  source: AlertSource;
  sender?: string | null;
  text: string;
  /** Application d'origine (com.whatsapp…), pour l'historique. */
  app?: string | null;
}

export interface ScanMessageResponse {
  verdict: Verdict;
  explanation: string;
  advice: string;
  alertId: string | null;
}

/** Annuaire téléphonique poussé vers le téléphone (filtrage d'appels hors ligne). */
export interface PhoneDirectory {
  version: string;
  /** Numéros officiels des banques de l'utilisateur. */
  bankNumbers: Array<{ number: string; bankId: string; bankName: string; partner: boolean }>;
  /** Numéros signalés comme frauduleux par la communauté. */
  reportedNumbers: Array<{ number: string; reports: number }>;
}

// ───────────────────────────── Console banque ─────────────────────────────

export interface AdvisorLoginRequest {
  email: string;
  password: string;
}

export interface Advisor {
  id: string;
  name: string;
  email: string;
  agency: string;
  bankId: string;
  bankName: string;
  /** Numéro sortant de l'agence, présenté au client. */
  outboundNumber: string | null;
}

export interface ClientSearchResult {
  userId: string;
  firstName: string | null;
  phone: string;
  customerRef: string | null;
  linkStatus: BankLinkStatus;
  /** Le client a au moins un appareil joignable. */
  reachable: boolean;
}

export interface StartCallRequest {
  userId: string;
  reason: string;
  callerNumber?: string | null;
}

export interface ConsoleCall extends CertifiedCall {
  client: { userId: string; firstName: string | null; phone: string };
  timeline: Array<{ at: string; status: CallStatus; label: string }>;
}

export interface ConsoleStats {
  period: { from: string; to: string };
  certifiedCalls: number;
  confirmedRate: number;
  linkedClients: number;
  fakeCallsReported: number;
  /** Série quotidienne sur 14 jours. */
  daily: Array<{ day: string; certified: number; fakeReported: number }>;
}

export interface FakeCallReport {
  id: string;
  number: string | null;
  /** Le numéro affiché est un numéro officiel de la banque : il a été usurpé. */
  spoofedOfficial: boolean;
  reportedAt: string;
  action: CallAction;
  client: { firstName: string | null; phoneMasked: string };
}

export interface ApiError {
  error: string;
  message: string;
}
