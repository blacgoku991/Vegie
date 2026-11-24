"use client";

import { useEffect, useState } from "react";
import type { CallAction, FakeCallReport } from "@vigie/shared";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, dateFr } from "@/components/ui";

const actionLabel: Record<CallAction, string> = {
  hung_up: "A raccroché",
  called_back: "A rappelé l'agence",
  alerted_contact: "A prévenu un proche",
  confirmed: "Appel confirmé",
};

export default function ReportsPage() {
  const [reports, setReports] = useState<FakeCallReport[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.reports().then(setReports).catch((e: Error) => setError(e.message));
  }, []);
  if (!reports) return <p className="soft" role="status">{error || "Chargement des signalements…"}</p>;

  // Numéros les plus usurpés : ce sont souvent les vrais numéros de la banque.
  const byNumber = new Map<string, { count: number; spoofed: boolean }>();
  for (const r of reports) {
    if (!r.number) continue;
    const prev = byNumber.get(r.number);
    byNumber.set(r.number, { count: (prev?.count ?? 0) + 1, spoofed: r.spoofedOfficial });
  }
  const top = [...byNumber.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 3);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Appels signalés</h1>
          <p className="sub">Vos clients ont indiqué avoir raccroché lors d’un appel suspect. Le service fraude peut examiner ces signalements.</p>
          <p className="sub">« Numéro officiel affiché » : l’appel montrait un numéro de votre banque. Ce numéro peut être usurpé, il ne prouve pas que l’appel venait de vous.</p>
        </div>
      </header>

      {top.length ? (
        <section className="section">
          <h2>Numéros les plus utilisés</h2>
          <div className="grid-3">
            {top.map(([n, { count, spoofed }]) => (
              <div key={n} className="card kpi">
                <span className="kpi-label">
                  {count} signalement{count > 1 ? "s" : ""}
                </span>
                <strong style={{ fontSize: 24, whiteSpace: "nowrap" }}>{n}</strong>
                {spoofed ? <div style={{ marginTop: 8 }}><Badge tone="danger" icon="alert" label="Numéro officiel affiché" /></div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card flush">
        {reports.length ? (
          <table>
            <thead>
              <tr>
                <th>Reçu le</th>
                <th>Numéro affiché</th>
                <th>Client</th>
                <th>Réaction</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="soft">{dateFr(r.reportedAt)}</td>
                  <td>
                    <span className="cell-main">{r.number ?? "Numéro inconnu"}</span>
                    {r.spoofedOfficial ? <div style={{ marginTop: 4 }}><Badge tone="danger" icon="alert" label="Numéro officiel affiché" /></div> : null}
                  </td>
                  <td>
                    {r.client.userId ? <Link className="table-action" href={`/clients/${r.client.userId}#reports`}>{r.client.firstName ?? "Client"}</Link> : (r.client.firstName ?? "Client")} <span className="soft">{r.client.phoneMasked}</span>
                  </td>
                  <td>
                    <Badge tone={r.action === "hung_up" ? "positive" : "neutral"} icon={r.action === "hung_up" ? "check" : "phone"} label={actionLabel[r.action]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">Aucun appel signalé pour le moment.</p>
        )}
      </section>
    </div>
  );
}
