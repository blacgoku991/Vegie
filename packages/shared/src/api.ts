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
  /** Un contrôle important n'a pas pu être fait (liste noire, site, IA…) : ne jamais afficher « sûr » en vert. */
  incomplete: boolean;
}

export interface AlertDetail extends AlertSummary {
  checks: AlertCheck[];
  /** Boîte ou source d'origine (« marie.dupont@orange.fr »). */
  origin: string | null;
  /** Conseil d'action (« Supprimez ce mail. Ne cliquez sur aucun lien. »). */
  advice: string;
  /** Les chemins et paramètres des liens restent exclus de l’historique. */
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
  /** Numéro depuis lequel le conseiller appelle (E.164). Seul l'appel venant de ce numéro est validé. */
  callerNumber: string | null;
  status: CallStatus;
  createdAt: string;
  expiresAt: string;
}

export type CallStatus = "announced" | "seen" | "confirmed" | "ended" | "expired" | "rejected";

/** Réponse au bouton « On m'appelle de ma banque ». */
export interface CallCheckResponse {
  /** Vrai seulement si le numéro de l'appelant est connu ET correspond à celui annoncé. */
  certified: boolean;
  /** Rapport entre l'appel entrant et l'annonce : inconnu quand l'appareil ne voit pas le numéro (iPhone). */
  match: CallMatch;
  /** Annonce en cours (même si le numéro ne correspond pas), sinon null. */
  call: CertifiedCall | null;
  /** Banques de l'utilisateur, pour proposer le rappel du numéro officiel. */
  banks: Bank[];
}

export type CallMatch = "number_match" | "number_mismatch" | "number_unknown";

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

/** Ce que le serveur sait. L'état des appels et des SMS dépend du téléphone : c'est l'app qui le lit. */
export interface ProtectionSources {
  /** Banques ajoutées. */
  banks: number;
  /** Boîtes mail connectées et en bon état. */
  mails: number;
  /** Boîtes mail connectées mais en erreur ou en pause. */
  mailsInError: number;
}

export interface HomeResponse {
  firstName: string | null;
  /** Nombre de messages classés « arnaque » depuis l'inscription (signalés, pas forcément évités). */
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
  incomplete: boolean;
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

export type StaffRole = "superadmin" | "bank_admin" | "advisor";

export interface Advisor {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  /** Nom de l'agence (vide pour l'équipe SmartSecure). */
  agency: string;
  agencyId: string | null;
  /** null pour le superadmin (équipe SmartSecure), qui n'appartient à aucune banque. */
  bankId: string | null;
  bankName: string;
  /** Ligne directe du conseiller, annoncée au client. Déclarée par le responsable de la banque. */
  outboundNumber: string | null;
}

/** Membre de l'équipe d'une banque (vue du responsable). */
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: Exclude<StaffRole, "superadmin">;
  agencyId: string | null;
  agency: string;
  outboundNumber: string | null;
  active: boolean;
  /** Le compte a choisi son mot de passe. */
  activated: boolean;
  createdAt: string;
}

/** Lien d'activation à usage unique. En production il est envoyé par e-mail ; en dev il est aussi renvoyé par l'API. */
export interface ActivationLink {
  link: string | null;
  expiresAt: string;
}

export interface CreateStaffRequest {
  name: string;
  email: string;
  role: "advisor" | "bank_admin";
  agencyId?: string | null;
  outboundNumber?: string | null;
}

export interface Agency {
  id: string;
  name: string;
  advisors: number;
}

export interface BankSettings {
  id: string;
  slug: string;
  name: string;
  officialPhone: string | null;
  officialNumbers: string[];
}

export interface AdminBank extends BankSettings {
  partner: boolean;
  staff: number;
  linkedClients: number;
}

export interface CreateBankRequest {
  name: string;
  slug: string;
  officialNumbers: string[];
  admin: { name: string; email: string };
}

export interface ActivationInfo {
  name: string;
  email: string;
  bankName: string;
}

export interface CreateInviteRequest {
  /** Numéro de téléphone du client (obligatoire) : le code ne fonctionne que depuis le compte de ce numéro. */
  clientPhone: string;
  customerRef?: string | null;
}

export interface ClientInvite {
  id: string;
  /** Code à 6 chiffres que le client saisit dans l'app. */
  code: string;
  /** Lien profond encodé dans le QR code. */
  link: string;
  expiresAt: string;
}

/** Lien d'activation ouvert sans session alors que le numéro a déjà un compte : il faut d'abord se connecter. */
export interface ActivationRequiresLogin {
  requiresLogin: true;
  /** Numéro masqué. */
  phone: string;
}
export type ActivateResponse = AuthVerifyResponse | ActivationRequiresLogin;

export interface CreateActivationRequest {
  firstName: string;
  phone: string;
  customerRef?: string | null;
}

export type ActivationStatus = "pending" | "expired";

/** Activation en attente : le client n'a pas encore appuyé sur le lien reçu par SMS. */
export interface ClientActivation {
  id: string;
  status: ActivationStatus;
  firstName: string;
  /** Partiellement masqué pour un conseiller. */
  phone: string;
  customerRef: string | null;
  advisorName: string;
  createdAt: string;
  expiresAt: string;
}

export interface ActivationSent {
  activation: ClientActivation;
  /** « 06 39 •• •• 12 » : numéro auquel le SMS est parti. */
  maskedPhone: string;
  /** Hors production uniquement : lien profond (QR code) et lien web. Jamais renvoyés en production. */
  link?: string;
  webLink?: string;
}

export interface JoinBankResponse {
  bank: Bank;
  status: BankLinkStatus;
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
  callbacksStarted: number;
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
  client: { firstName: string | null; phoneMasked: string; userId?: string };
}

// ───────────────────────── Console v2 : clients, appels, invitations, journal ─────────────────────────

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StaffRef {
  id: string;
  name: string;
  agency: string;
}

/** Client relié à la banque. Le téléphone est partiellement masqué pour un conseiller (complet pour le responsable). */
export interface ClientListItem {
  userId: string;
  firstName: string | null;
  phone: string;
  customerRef: string | null;
  linkStatus: BankLinkStatus;
  linkedAt: string | null;
  referent: StaffRef | null;
  lastCallAt: string | null;
}

export interface ClientDetail extends ClientListItem {
  /** Le client a au moins un appareil joignable par notification. */
  reachable: boolean;
  counts: { calls: number; reports: number; notes: number };
}

export interface CallListItem {
  id: string;
  client: { userId: string; firstName: string | null; phone: string };
  advisor: { id: string; name: string; agency: string };
  reason: string;
  callerNumber: string | null;
  status: CallStatus;
  createdAt: string;
  confirmedAt: string | null;
  endedAt: string | null;
}

export type InviteStatus = "open" | "used" | "expired" | "cancelled";

export interface InviteListItem {
  id: string;
  status: InviteStatus;
  clientPhone: string;
  customerRef: string | null;
  advisorName: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface ClientNote {
  id: string;
  text: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  /** L'utilisateur courant peut la supprimer (auteur ou responsable). */
  canDelete: boolean;
}

export type AuditCategory = "auth" | "call" | "invite" | "client" | "note" | "staff" | "settings";

export interface AuditEvent {
  id: string;
  at: string;
  actor: { id: string | null; name: string };
  action: string;
  target: { type: string; id: string | null; label: string | null } | null;
  /** Métadonnées non sensibles (jamais de téléphone, code ou secret). */
  meta: Record<string, string | number | boolean | null>;
}

export interface DashboardData {
  today: DashboardPeriod;
  week: DashboardPeriod;
  /** Annonces encore ouvertes (les siennes pour un conseiller, toute la banque pour un responsable). */
  activeCalls: CallListItem[];
  latestCalls: CallListItem[];
  latestReports: FakeCallReport[];
}

export interface DashboardPeriod {
  announced: number;
  confirmed: number;
  linked: number;
  reports: number;
}

export interface ApiError {
  error: string;
  message: string;
}
