"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientSearchResult, ConsoleCall } from "@vigie/shared";
import { api } from "@/lib/api";
import { useAdvisor } from "@/components/advisor";
import { CallBadge, Icon, LinkBadge, dateFr } from "@/components/ui";

const reasons = ["Point sur votre épargne", "Renouvellement de votre carte bancaire", "Suivi de votre dossier de prêt", "Rendez-vous annuel"];

export default function CallClientPage() {
  const advisor = useAdvisor();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ClientSearchResult[] | null>(null);
  const [selected, setSelected] = useState<ClientSearchResult | null>(null);
  const [reason, setReason] = useState(reasons[0]!);
  const [customReason, setCustomReason] = useState("");
  const [customerRef, setCustomerRef] = useState("");
  // Numéro depuis lequel le conseiller va appeler : seul l'appel venant de ce numéro sera validé chez le client.
  const [callerNumber, setCallerNumber] = useState("");
  useEffect(() => {
    if (advisor?.outboundNumber) setCallerNumber((n) => n || advisor.outboundNumber!);
  }, [advisor?.outboundNumber]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<ConsoleCall[]>([]);

  useEffect(() => {
    api.calls().then(setRecent).catch(() => {});
  }, []);

  // Recherche au fil de la frappe, avec un léger délai.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => api.search(q.trim()).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  const launch = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const call = await api.startCall(selected.userId, reason === "autre" ? customReason.trim() : reason, callerNumber.trim() || undefined);
      router.push(`/calls/${call.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const confirmIdentity = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.link(selected.userId, customerRef.trim());
      const next = { ...selected, linkStatus: "certified" as const, customerRef: customerRef.trim() };
      setSelected(next);
      setResults((r) => r?.map((x) => (x.userId === next.userId ? next : x)) ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 40 }}>
      <header className="stack" style={{ gap: 8 }}>
        <h1>Appeler un client</h1>
        <p className="soft" style={{ fontSize: 20 }}>
          Annoncez votre appel : votre client verra « Appel certifié » avec votre nom avant même de décrocher.
        </p>
      </header>

      <div className="search-wrap">
        <Icon name="search" color="var(--ink-faint)" size={26} />
        <input
          className="input search"
          placeholder="Téléphone, prénom ou référence client"
          aria-label="Rechercher un client"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="stack" aria-label="Résultats">
          {results === null ? (
            <p className="faint">Les clients qui ont ajouté {advisor?.bankName} dans Vigie apparaissent ici.</p>
          ) : results.length === 0 ? (
            <p className="soft">Aucun client trouvé. Le client doit d'abord ajouter votre banque dans l'application Vigie.</p>
          ) : (
            <div className="list">
              {results.map((r) => (
                <button key={r.userId} className="list-item" aria-pressed={selected?.userId === r.userId} onClick={() => setSelected(r)}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 20 }}>{r.firstName ?? "Client"}</strong>
                    <div className="soft">
                      {r.phone}
                      {r.customerRef ? ` · ${r.customerRef}` : ""}
                    </div>
                  </div>
                  <LinkBadge status={r.linkStatus} />
                </button>
              ))}
            </div>
          )}
        </section>

        <section aria-live="polite">
          {selected ? (
            <div className="card stack" style={{ gap: 24 }}>
              <div className="row between">
                <div>
                  <h2>{selected.firstName ?? "Client"}</h2>
                  <p className="soft">{selected.phone}</p>
                </div>
                <LinkBadge status={selected.linkStatus} />
              </div>

              {selected.linkStatus !== "certified" ? (
                <div className="stack">
                  <p>
                    Ce client a ajouté votre banque dans Vigie. Vérifiez son identité selon vos procédures habituelles, puis associez son compte.
                  </p>
                  <div className="field">
                    <label htmlFor="ref">Référence client</label>
                    <input id="ref" className="input" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder="HZ-000000" />
                  </div>
                  <button className="btn" disabled={busy || !customerRef.trim()} onClick={confirmIdentity}>
                    <Icon name="check" /> Confirmer l'identité
                  </button>
                </div>
              ) : (
                <div className="stack" style={{ gap: 20 }}>
                  <div className="field">
                    <label htmlFor="reason">Motif annoncé au client</label>
                    <select id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                      {reasons.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                      <option value="autre">Autre motif…</option>
                    </select>
                    {reason === "autre" ? (
                      <input className="input" aria-label="Autre motif" value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Motif en quelques mots" />
                    ) : null}
                    <p className="faint">Restez général : le motif s'affiche sur le téléphone du client.</p>
                  </div>
                  <div className="field">
                    <label htmlFor="callerNumber">Numéro depuis lequel vous appelez</label>
                    <input
                      id="callerNumber"
                      className="input"
                      inputMode="tel"
                      value={callerNumber}
                      onChange={(e) => setCallerNumber(e.target.value)}
                      placeholder="01 99 00 12 34"
                    />
                    <p className="faint">
                      Le client ne verra « appel annoncé » que si l'appel vient de ce numéro. Un autre numéro ne sera pas validé. L'annonce reste valable 10 minutes.
                      {!callerNumber.trim() ? " Si vous laissez vide, le numéro officiel de votre banque sera utilisé." : ""}
                    </p>
                  </div>
                  {!selected.reachable ? (
                    <p className="error" style={{ color: "var(--warning-fg)" }}>
                      <Icon name="alert" size={20} /> Notifications désactivées chez ce client : il devra appuyer sur « On m'appelle de ma banque ».
                    </p>
                  ) : null}
                  <button className="btn big" disabled={busy || (reason === "autre" && customReason.trim().length < 3)} onClick={launch}>
                    <Icon name="phone" /> Lancer l'appel certifié
                  </button>
                </div>
              )}
              {error ? (
                <p className="error" role="alert">
                  <Icon name="alert" size={20} /> {error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="card flat stack" style={{ gap: 12, alignItems: "flex-start" }}>
              <Icon name="phone" color="var(--accent)" size={32} />
              <h3>Comment ça marche</h3>
              <ol className="soft" style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 6 }}>
                <li>Cherchez le client et lancez l'appel certifié.</li>
                <li>Son téléphone affiche votre nom, votre agence et le motif.</li>
                <li>Appelez-le depuis le numéro indiqué (sinon l'appel ne sera pas validé).</li>
              </ol>
            </div>
          )}
        </section>
      </div>

      {recent.length ? (
        <section className="stack">
          <h2>Derniers appels certifiés</h2>
          <div className="card" style={{ padding: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Motif</th>
                  <th>Quand</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {recent.slice(0, 8).map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/calls/${c.id}`)} style={{ cursor: "pointer" }}>
                    <td>
                      <strong>{c.client.firstName ?? "Client"}</strong>
                      <div className="faint">{c.client.phone}</div>
                    </td>
                    <td>{c.reason}</td>
                    <td className="soft">{dateFr(c.createdAt)}</td>
                    <td>
                      <CallBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
