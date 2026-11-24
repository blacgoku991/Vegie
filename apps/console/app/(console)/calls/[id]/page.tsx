"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { formatPhone, type CallStatus, type ConsoleCall } from "@vigie/shared";
import { api } from "@/lib/api";
import { CallBadge, Icon, timeFr } from "@/components/ui";

const steps: Array<{ status: CallStatus; label: string }> = [
  { status: "announced", label: "Annonce envoyée sur le téléphone du client" },
  { status: "seen", label: "Le client a vu l'annonce" },
  { status: "confirmed", label: "Le client a confirmé que c'est bien vous" },
];

/** Appel en cours : suivi en direct (rafraîchi toutes les 2 secondes). */
export default function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [call, setCall] = useState<ConsoleCall | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .callDetail(id)
        .then((c) => alive && setCall(c))
        .catch((e: Error) => alive && setError(e.message));
    void load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  if (!call) return error ? <p className="error">{error}</p> : null;

  const finished = ["ended", "expired", "rejected"].includes(call.status);
  const reached = (s: CallStatus) => call.timeline.some((t) => t.status === s);
  const at = (s: CallStatus) => call.timeline.find((t) => t.status === s)?.at;
  const current = steps.find((s) => !reached(s.status))?.status;

  return (
    <div className="stack" style={{ gap: 32 }}>
      <Link href="/" className="row" style={{ gap: 6, textDecoration: "none", fontWeight: 600, minHeight: 48 }}>
        <Icon name="back" size={22} /> Retour
      </Link>

      <header className="row between" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 8 }}>
          <span className="faint">Appel certifié · {call.reason}</span>
          <h1>{call.client.firstName ?? "Client"}</h1>
          <p className="soft" style={{ fontSize: 20 }}>{call.client.phone}</p>
        </div>
        <CallBadge status={call.status} />
      </header>

      {call.status === "rejected" ? (
        <div className="card" style={{ background: "var(--danger-bg)", color: "var(--danger-fg)", boxShadow: "none" }}>
          <strong>Le client a indiqué que ce n'est pas la personne annoncée.</strong> Il est invité à raccrocher et à rappeler le numéro officiel.
        </div>
      ) : !finished ? (
        <div className="card row" style={{ gap: 20, background: "var(--accent-soft)", boxShadow: "none" }}>
          <Icon name="phone" color="var(--accent)" size={32} />
          <div>
            <strong style={{ fontSize: 20 }}>Composez maintenant le {call.client.phone}</strong>
            <p className="soft">
              depuis le {call.callerNumber ? formatPhone(call.callerNumber) : "numéro de votre agence"}. Seul un appel venant de ce numéro est validé. L'annonce reste valable jusqu'à {timeFr(call.expiresAt)}.
            </p>
          </div>
        </div>
      ) : null}

      <section className="card">
        <ol className="timeline">
          {steps.map((s) => {
            const done = reached(s.status);
            return (
              <li key={s.status}>
                <span className={`dot ${done ? "done" : !finished && current === s.status ? "live" : ""}`}>
                  {done ? <Icon name="check" color="#fff" size={20} strokeWidth={2.6} /> : null}
                </span>
                <span style={{ fontWeight: done ? 700 : 400, color: done ? "var(--ink)" : "var(--ink-soft)" }}>
                  {s.label}
                  {!done && !finished && current === s.status ? <span className="faint"> · en attente…</span> : null}
                </span>
                <span className="faint">{done ? timeFr(at(s.status)!) : ""}</span>
              </li>
            );
          })}
          {finished ? (
            <li>
              <span className="dot done" style={{ background: "var(--ink-soft)", borderColor: "var(--ink-soft)" }}>
                <Icon name="phoneOff" color="#fff" size={20} />
              </span>
              <strong>{call.timeline.at(-1)?.label}</strong>
              <span className="faint">{timeFr(call.timeline.at(-1)!.at)}</span>
            </li>
          ) : null}
        </ol>
      </section>

      {!finished ? (
        <div>
          <button className="btn secondary big" onClick={() => api.endCall(call.id).then(setCall)}>
            <Icon name="phoneOff" /> Terminer l'appel
          </button>
        </div>
      ) : null}
    </div>
  );
}
