"use client";

import { useEffect, useState } from "react";
import type { ConsoleStats } from "@vigie/shared";
import { api } from "@/lib/api";
import { BarChart } from "@/components/BarChart";

export default function StatsPage() {
  const [stats, setStats] = useState<ConsoleStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.stats().then(setStats).catch((e: Error) => setError(e.message));
  }, []);
  if (!stats) return <p className="soft" role="status">{error || "Chargement de l’activité…"}</p>;

  const kpis = [
    { value: stats.certifiedCalls, label: "appels annoncés", hint: "30 derniers jours" },
    { value: `${Math.round(stats.confirmedRate * 100)} %`, label: "accusés de réception", hint: "sur les annonces de la période" },
    { value: stats.linkedClients, label: "clients reliés", hint: "identité confirmée" },
    { value: stats.fakeCallsReported, label: "appels signalés", hint: "30 derniers jours" },
    { value: stats.callbacksStarted, label: "rappels engagés", hint: "ouvertures du composeur, sur 30 jours" },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Activité de la banque</h1>
          <p className="sub">L'activité de votre banque dans SmartSecure.</p>
        </div>
      </header>

      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <span className="kpi-label">{k.label}</span>
            <strong>{k.value}</strong>
            <span className="kpi-hint">{k.hint}</span>
          </div>
        ))}
      </div>

      {/* Deux mesures d'échelles différentes : deux graphiques, jamais un double axe. */}
      <div className="grid-2">
        <BarChart title="Appels annoncés par jour" units={["appel annoncé", "appels annoncés"]} data={stats.daily.map((d) => ({ day: d.day, value: d.certified }))} />
        <BarChart title="Appels signalés par jour" units={["appel signalé", "faux appels signalés"]} data={stats.daily.map((d) => ({ day: d.day, value: d.fakeReported }))} />
      </div>
    </div>
  );
}
