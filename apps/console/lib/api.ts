"use client";

import type { Advisor, ClientSearchResult, ConsoleCall, ConsoleStats, FakeCallReport } from "@vigie/shared";

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
  if (res.status === 401 && !path.startsWith("/console/login")) {
    window.location.href = "/login";
  }
  if (!res.ok) throw new ApiError(res.status, json.message ?? "Une erreur est survenue.");
  return json as T;
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
};
