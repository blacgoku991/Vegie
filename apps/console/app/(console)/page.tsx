"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CallListItem, DashboardData, DashboardPeriod } from "@vigie/shared";
import { api } from "@/lib/api";
import { useAdvisor } from "@/components/advisor";
import { Avatar, Badge, CallBadge, Icon, ago } from "@/components/ui";

const kpis: Array<{ key: keyof DashboardPeriod; label: string }> = [
  { key: "announced", label: "Appels annoncés" },
  { key: "confirmed", label: "Réceptions confirmées" },
  { key: "linked", label: "Clients reliés" },
  { key: "reports", label: "Signalements" },
];

function CallRows({ calls, empty }: { calls: CallListItem[]; empty: string }) {
  if (!calls.length) return <p className="empty compact">{empty}</p>;
  return (
    <div className="rows">
      {calls.map((c) => (
        <Link key={c.id} href={`/calls/${c.id}`} className="row-link">
          <Avatar name={c.client.firstName} />
          <div className="grow">
            <div className="cell-main">{c.client.firstName ?? "Client"}</div>
            <div className="cell-sub">{c.reason} · {c.advisor.name}</div>
          </div>
          <div className="row-end"><CallBadge status={c.status} /><span className="faint">{ago(c.createdAt)}</span></div>
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const advisor = useAdvisor();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState<"today" | "week">("today");

  useEffect(() => {
    if (advisor?.role === "superadmin") router.replace("/admin");
  }, [advisor?.role, router]);
  useEffect(() => {
    if (!advisor || advisor.role === "superadmin") return;
    const load = () => api.dashboard().then(setData).catch((e: Error) => setError(e.message));
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [advisor]);

  if (advisor?.role === "superadmin") return null;
  const first = advisor?.name.split(" ")[0] ?? "";
  const period = data?.[range];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Bonjour {first}</h1>
          <p className="sub">{advisor?.bankName}{advisor?.agency ? ` · ${advisor.agency}` : ""}. Voici l’activité de votre banque.</p>
        </div>
        <div className="actions">
          <Link href="/clients" className="btn secondary"><Icon name="search" size={16} /> Rechercher un client</Link>
          <Link href="/invites?new=1" className="btn secondary"><Icon name="plus" size={16} /> Inviter</Link>
          <Link href="/announce" className="btn big"><Icon name="phone" size={16} /> Annoncer un appel</Link>
        </div>
      </header>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <section className="section" aria-label="Indicateurs">
        <div className="section-head">
          <h2>Indicateurs</h2>
          <div className="seg two" role="group" aria-label="Période">
            <button aria-pressed={range === "today"} onClick={() => setRange("today")}>Aujourd’hui</button>
            <button aria-pressed={range === "week"} onClick={() => setRange("week")}>7 jours</button>
          </div>
        </div>
        <div className="kpis">
          {kpis.map((k) => (
            <div key={k.key} className="card kpi">
              <span className="kpi-label">{k.label}</span>
              <strong>{period ? period[k.key] : "–"}</strong>
              <span className="kpi-hint">{range === "today" ? "depuis minuit" : "sur les 7 derniers jours"}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="split even">
        <div className="page" style={{ gap: 24 }}>
        <section className="section">
          <div className="section-head">
            <h2>{advisor?.role === "bank_admin" ? "Annonces en cours" : "Mes annonces en cours"}</h2>
            {data?.activeCalls.length ? <Badge tone="warning" icon="clock" label={`${data.activeCalls.length} ouverte${data.activeCalls.length > 1 ? "s" : ""}`} /> : null}
          </div>
          <div className="card flush"><CallRows calls={data?.activeCalls ?? []} empty={data ? "Aucune annonce en cours. Une annonce reste ouverte dix minutes." : "Chargement…"} /></div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Dernières annonces</h2>
            <Link href="/calls" className="table-action">Tous les appels</Link>
          </div>
          <div className="card flush"><CallRows calls={data?.latestCalls ?? []} empty={data ? "Aucun appel annoncé pour le moment." : "Chargement…"} /></div>
        </section>
        </div>

        <section className="section">
          <div className="section-head">
            <h2>Derniers signalements</h2>
            <Link href="/reports" className="table-action">Tout voir</Link>
          </div>
          <div className="card flush">
            {data?.latestReports.length ? (
              <div className="rows">
                {data.latestReports.map((r) => (
                  <Link key={r.id} href={r.client.userId ? `/clients/${r.client.userId}#reports` : "/reports"} className="row-link">
                    <Avatar name={r.client.firstName} />
                    <div className="grow">
                      <div className="cell-main">{r.client.firstName ?? "Client"} <span className="soft">{r.client.phoneMasked}</span></div>
                      <div className="cell-sub">Appel depuis {r.number ?? "un numéro inconnu"}{r.spoofedOfficial ? ". Ce numéro peut être usurpé." : ""}</div>
                    </div>
                    <div className="row-end">
                      {r.spoofedOfficial ? <Badge tone="danger" icon="alert" label="Numéro officiel affiché" /> : null}
                      <span className="faint">{ago(r.reportedAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <p className="empty compact">{data ? "Aucun signalement récent." : "Chargement…"}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
