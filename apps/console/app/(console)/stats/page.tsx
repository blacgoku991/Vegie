"use client";

import { useEffect, useState } from "react";
import type { ConsoleStats } from "@vigie/shared";
import { api } from "@/lib/api";
import { BarChart } from "@/components/BarChart";

export default function StatsPage() {
  const [stats, setStats] = useState<ConsoleStats | null>(null);
  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
  }, []);
  if (!stats) return null;

  const kpis = [
    { value: stats.certifiedCalls, label: "appels certifiés", hint: "30 derniers jours" },
    { value: `${Math.round(stats.confirmedRate * 100)} %`, label: "confirmés par le client", hint: "le client a validé l'appel" },
    { value: stats.linkedClients, label: "clients protégés", hint: "identité confirmée" },
    { value: stats.fakeCallsReported, label: "faux appels signalés", hint: "30 derniers jours" },
  ];

  return (
    <div className="stack" style={{ gap: 40 }}>
      <header className="stack" style={{ gap: 8 }}>
        <h1>Statistiques</h1>
        <p className="soft" style={{ fontSize: 20 }}>L'activité de votre banque dans Vigie.</p>
      </header>

      <div className="grid-4">
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <strong>{k.value}</strong>
            <span style={{ fontWeight: 600 }}>{k.label}</span>
            <span className="faint">{k.hint}</span>
          </div>
        ))}
      </div>

      {/* Deux mesures d'échelles différentes : deux graphiques, jamais un double axe. */}
      <div className="grid-2">
        <BarChart title="Appels certifiés par jour" units={["appel certifié", "appels certifiés"]} data={stats.daily.map((d) => ({ day: d.day, value: d.certified }))} />
        <BarChart title="Faux appels signalés par jour" units={["faux appel signalé", "faux appels signalés"]} data={stats.daily.map((d) => ({ day: d.day, value: d.fakeReported }))} />
      </div>
    </div>
  );
}
