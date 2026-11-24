"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { formatPhone, type CallStatus, type ConsoleCall } from "@vigie/shared";
import { api } from "@/lib/api";
import { CallBadge, Icon, timeFr } from "@/components/ui";

const steps: Array<{ status: CallStatus; label: string }> = [
  { status: "announced", label: "Annonce disponible dans l’application" },
  { status: "seen", label: "Annonce consultée" },
  { status: "confirmed", label: "Le client a accusé réception" },
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
        .then((c) => { if (alive) { setCall(c); setError(null); } })
        .catch((e: Error) => alive && setError(e.message));
    void load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  if (!call) return <p className="soft" role="status">{error || "Chargement de l’annonce…"}</p>;

  const finished = ["ended", "expired", "rejected"].includes(call.status);
  const reached = (s: CallStatus) => call.timeline.some((t) => t.status === s);
  const at = (s: CallStatus) => call.timeline.find((t) => t.status === s)?.at;
  const current = steps.find((s) => !reached(s.status))?.status;

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Link href="/calls" className="back">
        <Icon name="back" size={16} /> Appels
      </Link>

      <header className="page-head">
        <div>
          <span className="faint">Annonce · {call.reason}</span>
          <h1><Link href={`/clients/${call.client.userId}`} style={{ color: "inherit" }}>{call.client.firstName ?? "Client"}</Link></h1>
          <p className="sub">{call.client.phone}</p>
        </div>
        <CallBadge status={call.status} />
      </header>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {call.status === "rejected" ? (
        <div className="notice bad">
          <Icon name="stop" size={18} />
          <p><strong>Le client a indiqué que ce n'est pas la personne annoncée.</strong> Il est invité à raccrocher et à rappeler le numéro officiel.</p>
        </div>
      ) : !finished ? (
        <div className="notice info">
          <Icon name="phone" size={18} />
          <div>
            <strong style={{ fontSize: 15 }}>Composez maintenant le {call.client.phone}</strong>
            <p className="soft" style={{ marginTop: 2 }}>
              depuis le {call.callerNumber ? formatPhone(call.callerNumber) : "numéro de votre agence"}. Seul un appel venant de ce numéro est validé. L'annonce reste valable jusqu'à {timeFr(call.expiresAt)}.
            </p>
          </div>
        </div>
      ) : null}

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Déroulé de l'appel</h2>
        <ol className="timeline">
          {steps.map((s) => {
            const done = reached(s.status);
            return (
              <li key={s.status}>
                <span className={`dot ${done ? "done" : !finished && current === s.status ? "live" : ""}`}>
                  {done ? <Icon name="check" size={14} strokeWidth={3} /> : null}
                </span>
                <span style={{ fontWeight: done ? 500 : 400, color: done ? "var(--ink)" : "var(--ink-soft)" }}>
                  {s.label}
                  {!done && !finished && current === s.status ? <span className="faint"> · en attente…</span> : null}
                </span>
                <span className="faint">{done ? timeFr(at(s.status)!) : ""}</span>
              </li>
            );
          })}
          {finished ? (
            <li>
              <span className="dot end">
                <Icon name="phoneOff" size={13} strokeWidth={2.4} />
              </span>
              <strong>{call.timeline.at(-1)?.label}</strong>
              <span className="faint">{timeFr(call.timeline.at(-1)!.at)}</span>
            </li>
          ) : null}
        </ol>
      </section>

      {!finished ? (
        <div>
          <button className="btn secondary big" onClick={() => api.endCall(call.id).then(setCall).catch((e: Error) => setError(e.message))}>
            <Icon name="phoneOff" size={16} /> Terminer l'appel
          </button>
        </div>
      ) : null}
    </div>
  );
}
