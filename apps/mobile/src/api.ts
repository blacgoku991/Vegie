import { callbackDirectory, saveCallbacks } from "./callbacks";
import Constants from "expo-constants";
import type {
  AlertDetail,
  AlertSummary,
  AuthVerifyResponse,
  Bank,
  JoinBankResponse,
  CallCheckResponse,
  CallReportRequest,
  HomeResponse,
  Mailbox,
  MailProviderInfo,
  Me,
  PhoneDirectory,
  ScanMessageRequest,
  ScanMessageResponse,
  TrustedContact,
  UserBank,
  UserSettings,
  Verdict,
  AlertSource,
} from "@vigie/shared";

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4000";

let token: string | null = null;
let owner: string | null = null;
let banksVersion = 0;
export const setApiToken = (t: string | null, userId: string | null = null) => {
  token = t;
  owner = userId;
  banksVersion++;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<T> {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, {
      method,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline", "Pas de connexion internet. Vérifiez le Wi-Fi ou les données mobiles.");
  } finally { clearTimeout(timer); }
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? "error", json.message ?? "Une erreur est survenue.");
  return json as T;
}

async function myBanks() {
  const version = ++banksVersion;
  const userId = owner;
  const banks = await call<UserBank[]>("GET", "/me/banks", undefined, 6000);
  if (userId && version === banksVersion) await saveCallbacks(userId, callbackDirectory(banks)).catch(() => {});
  return banks;
}

async function changeBanks<T>(method: string, path: string, body?: unknown) {
  const userId = owner;
  const result = await call<T>(method, path, body);
  if (userId && userId === owner) {
    ++banksVersion;
    await saveCallbacks(userId, null).catch(() => {});
    await myBanks().catch(() => {});
  }
  return result;
}

const qs = (o: Record<string, string | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v);
  return p.length ? "?" + p.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&") : "";
};

export const api = {
  startAuth: (phone: string) => call<{ ok: true }>("POST", "/auth/start", { phone }),
  verify: (phone: string, code: string) => call<AuthVerifyResponse>("POST", "/auth/verify", { phone, code }),
  logout: () => call("POST", "/auth/logout"),
  me: () => call<Me>("GET", "/me", undefined, 6000),
  updateMe: (patch: { firstName?: string; settings?: Partial<UserSettings> }) => call<Me>("PATCH", "/me", patch),
  deleteAccount: () => call("DELETE", "/me"),
  registerDevice: (platform: "ios" | "android" | "web", pushToken: string | null) => call("POST", "/me/devices", { platform, pushToken }),
  home: () => call<HomeResponse>("GET", "/home"),

  alerts: (f: { verdict?: Verdict | "incomplete"; source?: AlertSource; before?: string } = {}) => call<AlertSummary[]>("GET", `/me/alerts${qs(f)}`),
  alert: (id: string) => call<AlertDetail>("GET", `/me/alerts/${id}`),
  scan: (body: ScanMessageRequest) => call<ScanMessageResponse>("POST", "/me/scan", body),

  callCheck: (number?: string | null) => call<CallCheckResponse>("GET", `/me/calls/check${qs({ number })}`, undefined, 8000),
  confirmCall: (id: string, confirmed: boolean) => call("POST", `/me/calls/${id}/confirm`, { confirmed }),
  reportCall: (body: CallReportRequest) => call("POST", "/me/calls/report", body),

  banks: () => call<Bank[]>("GET", "/banks"),
  myBanks,
  addBank: (bankId: string) => changeBanks("POST", "/me/banks", { bankId }),
  joinBank: (code: string) => changeBanks<JoinBankResponse>("POST", "/me/banks/join", { code }),
  removeBank: (bankId: string) => changeBanks("DELETE", `/me/banks/${bankId}`),
  directory: () => call<PhoneDirectory>("GET", "/me/phone-directory"),

  contacts: () => call<TrustedContact[]>("GET", "/me/contacts"),
  addContact: (name: string, phone: string) => call<TrustedContact>("POST", "/me/contacts", { name, phone }),
  removeContact: (id: string) => call("DELETE", `/me/contacts/${id}`),
  alertContact: (context: "call" | "message", number?: string | null) =>
    call<{ sent: boolean; contacts: Array<{ name: string; phone: string }> }>("POST", "/me/contacts/alert", { context, number }),

  providers: () => call<MailProviderInfo>("GET", "/mail/providers"),
  mailboxes: () => call<Mailbox[]>("GET", "/me/mailboxes"),
  addImap: (presetId: string, email: string, password: string) => call("POST", "/me/mailboxes/imap", { presetId, email, password }),
  startOAuth: (provider: "outlook" | "gmail") => call<{ url: string }>("GET", `/me/mailboxes/${provider}/start`),
  removeMailbox: (id: string) => call("DELETE", `/me/mailboxes/${id}`),
};
