"use client";

import type {
  ActivationInfo,
  ActivationLink,
  AuditEvent,
  CallListItem,
  ClientDetail,
  ClientListItem,
  ClientNote,
  DashboardData,
  InviteListItem,
  Page,
  AdminBank,
  Advisor,
  Agency,
  BankSettings,
  ClientInvite,
  ClientSearchResult,
  ConsoleCall,
  ConsoleStats,
  CreateBankRequest,
  CreateInviteRequest,
  CreateStaffRequest,
  FakeCallReport,
  StaffMember,
} from "@vigie/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Appels vers l'API Vigie via le même domaine (réécriture Next → cookie httpOnly). */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (res.status === 401 && !path.startsWith("/console/login") && !path.startsWith("/console/activate")) {
    window.location.href = "/login";
  }
  if (!res.ok) throw new ApiError(res.status, json.message ?? "Une erreur est survenue.");
  return json as T;
}

function qs(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const out = q.toString();
  return out ? `?${out}` : "";
}

export const api = {
  login: (email: string, password: string) => call<Advisor>("POST", "/console/login", { email, password }),
  logout: () => call("POST", "/console/logout"),
  me: () => call<Advisor>("GET", "/console/me"),
  search: (q: string) => call<ClientSearchResult[]>("GET", `/console/clients?q=${encodeURIComponent(q)}`),
  link: (userId: string, customerRef: string) => call("POST", `/console/clients/${userId}/link`, { customerRef }),
  startCall: (userId: string, reason: string, callerNumber?: string) => call<ConsoleCall>("POST", "/console/calls", { userId, reason, callerNumber }),
  calls: () => call<ConsoleCall[]>("GET", "/console/calls"),
  callDetail: (id: string) => call<ConsoleCall>("GET", `/console/calls/${id}`),
  endCall: (id: string) => call<ConsoleCall>("POST", `/console/calls/${id}/end`),
  stats: () => call<ConsoleStats>("GET", "/console/stats"),
  reports: () => call<FakeCallReport[]>("GET", "/console/reports"),

  invite: (clientPhone: string, customerRef?: string) =>
    call<ClientInvite>("POST", "/console/invites", { clientPhone, customerRef: customerRef || undefined } satisfies CreateInviteRequest),

  dashboard: () => call<DashboardData>("GET", "/console/dashboard"),
  customers: (params: Record<string, string | number | undefined>) => call<Page<ClientListItem>>("GET", `/console/customers${qs(params)}`),
  customer: (id: string) => call<ClientDetail>("GET", `/console/customers/${id}`),
  customerCalls: (id: string) => call<CallListItem[]>("GET", `/console/customers/${id}/calls`),
  customerReports: (id: string) => call<FakeCallReport[]>("GET", `/console/customers/${id}/reports`),
  customerJournal: (id: string) => call<AuditEvent[]>("GET", `/console/customers/${id}/journal`),
  customerNotes: (id: string) => call<ClientNote[]>("GET", `/console/customers/${id}/notes`),
  addNote: (id: string, text: string) => call<ClientNote>("POST", `/console/customers/${id}/notes`, { text }),
  deleteNote: (id: string, noteId: string) => call("DELETE", `/console/customers/${id}/notes/${noteId}`),
  reinvite: (id: string) => call<ClientInvite>("POST", `/console/customers/${id}/invite`),
  unlink: (id: string) => call("POST", `/console/customers/${id}/unlink`),
  callLog: (params: Record<string, string | number | undefined>) => call<Page<CallListItem>>("GET", `/console/call-log${qs(params)}`),
  invites: () => call<InviteListItem[]>("GET", "/console/invites"),
  cancelInvite: (id: string) => call("DELETE", `/console/invites/${id}`),
  audit: (params: Record<string, string | number | undefined>) => call<Page<AuditEvent>>("GET", `/console/audit${qs(params)}`),

  activationInfo: (token: string) => call<ActivationInfo>("GET", `/console/activate?token=${encodeURIComponent(token)}`),
  activate: (token: string, password: string) => call<Advisor>("POST", "/console/activate", { token, password }),

  team: () => call<StaffMember[]>("GET", "/console/team"),
  createStaff: (body: CreateStaffRequest) => call<{ member: StaffMember; activation: ActivationLink }>("POST", "/console/team", body),
  updateStaff: (id: string, body: { name?: string; role?: "advisor" | "bank_admin"; agencyId?: string | null; outboundNumber?: string | null }) =>
    call<StaffMember>("PATCH", `/console/team/${id}`, body),
  deactivateStaff: (id: string) => call<StaffMember>("POST", `/console/team/${id}/deactivate`),
  reactivateStaff: (id: string) => call<StaffMember>("POST", `/console/team/${id}/reactivate`),
  activationLink: (id: string) => call<ActivationLink>("POST", `/console/team/${id}/activation-link`),

  agencies: () => call<Agency[]>("GET", "/console/agencies"),
  createAgency: (name: string) => call<Agency>("POST", "/console/agencies", { name }),
  renameAgency: (id: string, name: string) => call<Agency>("PATCH", `/console/agencies/${id}`, { name }),
  deleteAgency: (id: string) => call("DELETE", `/console/agencies/${id}`),

  bank: () => call<BankSettings>("GET", "/console/bank"),
  updateBank: (body: { officialPhone?: string | null; officialNumbers?: string[] }) => call<BankSettings>("PATCH", "/console/bank", body),

  adminBanks: () => call<AdminBank[]>("GET", "/console/admin/banks"),
  createBank: (body: CreateBankRequest) => call<{ bank: AdminBank; admin: StaffMember; activation: ActivationLink }>("POST", "/console/admin/banks", body),
  addBankAdmin: (bankId: string, body: { name: string; email: string }) =>
    call<{ admin: StaffMember; activation: ActivationLink }>("POST", `/console/admin/banks/${bankId}/admins`, body),
};
