"use client";

import { useEffect, useState } from "react";
import type { CallAction, FakeCallReport } from "@vigie/shared";
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
  useEffect(() => {
    api.reports().then(setReports).catch(() => setReports([]));
  }, []);
  if (!reports) return null;

  // Numéros les plus usurpés : ce sont souvent les vrais numéros de la banque.
  const byNumber = new Map<string, { count: number; spoofed: boolean }>();
  for (const r of reports) {
    if (!r.number) continue;
    const prev = byNumber.get(r.number);
    byNumber.set(r.number, { count: (prev?.count ?? 0) + 1, spoofed: r.spoofedOfficial });
  }
  const top = [...byNumber.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 3);

  return (
    <div className="stack" style={{ gap: 40 }}>
      <header className="stack" style={{ gap: 8 }}>
        <h1>Faux appels signalés</h1>
        <p className="soft" style={{ fontSize: 20 }}>
          Appels reçus par vos clients au nom de votre banque, sans annonce dans Vigie. Partagez-les avec votre service fraude.
        </p>
      </header>

      {top.length ? (
        <section className="stack">
          <h2>Numéros les plus utilisés</h2>
          <div className="grid-3">
            {top.map(([n, { count, spoofed }]) => (
              <div key={n} className="card kpi" style={{ gap: 10 }}>
                <strong style={{ fontSize: 28, whiteSpace: "nowrap" }}>{n}</strong>
                <span className="soft">
                  {count} signalement{count > 1 ? "s" : ""}
                </span>
                {spoofed ? <Badge tone="danger" icon="stop" label="Votre numéro officiel, usurpé" /> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card" style={{ padding: 8 }}>
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
                    <strong>{r.number ?? "Numéro masqué"}</strong>
                    {r.spoofedOfficial ? <div className="faint">numéro officiel usurpé</div> : null}
                  </td>
                  <td>
                    {r.client.firstName ?? "Client"} <span className="faint">{r.client.phoneMasked}</span>
                  </td>
                  <td>
                    <Badge tone={r.action === "hung_up" ? "positive" : "neutral"} icon={r.action === "hung_up" ? "check" : "phone"} label={actionLabel[r.action]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="soft" style={{ padding: 24 }}>Aucun faux appel signalé pour le moment.</p>
        )}
      </section>
    </div>
  );
}
