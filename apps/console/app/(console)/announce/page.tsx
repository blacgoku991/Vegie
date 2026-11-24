"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientSearchResult, ConsoleCall } from "@vigie/shared";
import { api } from "@/lib/api";
import { useAdvisor } from "@/components/advisor";
import { CallBadge, Icon, LinkBadge, dateFr } from "@/components/ui";
import { InviteClient } from "@/components/invite";

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
  const callerNumber = advisor?.outboundNumber ?? "";
  // L'équipe SmartSecure n'appelle personne : elle gère les banques.
  useEffect(() => {
    if (advisor?.role === "superadmin") router.replace("/admin");
  }, [advisor?.role, router]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<ConsoleCall[] | null>(null);
  const [searchError, setSearchError] = useState("");
  const [recentError, setRecentError] = useState("");

  useEffect(() => {
    if (advisor && advisor.role !== "superadmin") api.calls().then(setRecent).catch((e: Error) => setRecentError(e.message));
  }, [advisor]);

  // Arrivée depuis une fiche client (?client=…) : le client est déjà sélectionné.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("client");
    if (!id || advisor?.role === "superadmin") return;
    api.customer(id).then((c) => setSelected({ userId: c.userId, firstName: c.firstName, phone: c.phone, customerRef: c.customerRef, linkStatus: c.linkStatus, reachable: c.reachable }))
      .catch((e: Error) => setError(e.message));
  }, [advisor?.role]);

  // Recherche au fil de la frappe, avec un léger délai.
  useEffect(() => {
    let active = true;
    setResults(null);
    setSearchError("");
    if (q.trim().length < 2 || advisor?.role === "superadmin") return;
    const t = setTimeout(() => {
      api.search(q.trim()).then(rows => { if (active) setResults(rows); })
        .catch((e: Error) => { if (active) setSearchError(e.message); });
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [q, advisor?.role]);

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

  if (advisor?.role === "superadmin") return null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Annoncer un appel</h1>
          <p className="sub">Retrouvez votre client pour lui annoncer un appel depuis votre ligne directe.</p>
        </div>
      </header>

      <div className="search-wrap" style={{ marginTop: -8 }}>
        <Icon name="search" size={18} />
        <input
          className="input search"
          placeholder="Téléphone, prénom ou référence client"
          aria-label="Rechercher un client"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSelected(null); setError(null); setCustomerRef(""); }}
        />
      </div>

      <div className="split">
        <section className="card stack" style={{ gap: 14 }} aria-label="Résultats" aria-live="polite">
          <h2>{q.trim().length < 2 ? "Votre ligne directe" : "Résultats de recherche"}</h2>
          {searchError ? <p className="error" role="alert">{searchError}</p> : results === null ? (
            q.trim().length < 2 ? <div className="stack" style={{ gap: 4 }}>
              <strong className="line-number">{callerNumber || "Ligne à déclarer"}</strong>
              <span className="soft">{callerNumber ? [advisor?.name, advisor?.agency].filter(Boolean).join(" · ") : "Votre responsable peut renseigner votre numéro dans Équipe."}</span>
            </div> : <p className="faint">Recherche en cours…</p>
          ) : results.length === 0 ? (
            <p className="soft">Aucun client trouvé. Le client doit d'abord ajouter votre banque dans l'application SmartSecure.</p>
          ) : (
            <div className="list">
              {results.map((r) => (
                <button key={r.userId} className="list-item" aria-pressed={selected?.userId === r.userId} onClick={() => { setSelected(r); setError(null); setCustomerRef(""); }}>
                  <div style={{ flex: 1 }}>
                    <div className="cell-main">{r.firstName ?? "Client"}</div>
                    <div className="cell-sub">
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
            <div className="card stack" style={{ gap: 20 }}>
              <div className="card-head">
                <div>
                  <h2>{selected.firstName ?? "Client"}</h2>
                  <p className="soft">{selected.phone}</p>
                </div>
                <LinkBadge status={selected.linkStatus} />
              </div>

              {selected.linkStatus !== "certified" ? (
                <div className="stack">
                  <p className="soft" style={{ fontSize: 15 }}>
                    Ce client a ajouté votre banque dans SmartSecure. Vérifiez son identité selon vos procédures habituelles, puis associez son compte.
                  </p>
                  <div className="field">
                    <label htmlFor="ref">Référence client</label>
                    <input id="ref" className="input" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder="HZ-000000" />
                  </div>
                  <div>
                    <button className="btn big" disabled={busy || !customerRef.trim()} onClick={confirmIdentity}>
                      <Icon name="check" size={16} /> Confirmer l'identité
                    </button>
                  </div>
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
                      readOnly
                      placeholder="Ligne à déclarer"
                    />
                    <p className="faint">
                      Le client peut lire l’annonce pendant dix minutes. Le téléphone compare le numéro entrant à votre ligne directe lorsque cette information est disponible.
                      {!callerNumber.trim() ? " Demandez à votre responsable de déclarer votre ligne directe dans Équipe." : ""}
                    </p>
                  </div>
                  {!selected.reachable ? (
                    <p className="notice warn">
                      <Icon name="alert" size={18} /> Aucun téléphone enregistré pour les notifications : il devra appuyer sur « On m'appelle de ma banque ».
                    </p>
                  ) : null}
                  <div>
                    <button className="btn big" disabled={busy || !callerNumber.trim() || (reason === "autre" && customReason.trim().length < 3)} onClick={launch}>
                      <Icon name="phone" size={16} /> Envoyer l’annonce
                    </button>
                  </div>
                </div>
              )}
              {error ? (
                <p className="error" role="alert">
                  <Icon name="alert" size={16} /> {error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="card flat stack" style={{ gap: 12, alignItems: "flex-start" }}>
              <h2>Premier rendez-vous</h2>
              <p className="soft" style={{ fontSize: 15 }}>En agence, reliez le compte SmartSecure de votre client à sa banque avec un code personnel.</p>
              <InviteClient />
            </div>
          )}
        </section>
      </div>

      <section className="section">
        <h2>Dernières annonces</h2>
        {recent?.length ? (
          <div className="card flush">
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
                  <tr key={c.id}>
                    <td>
                      <Link className="table-action" href={`/calls/${c.id}`}>{c.client.firstName ?? "Client"}</Link>
                      <div className="cell-sub">{c.client.phone}</div>
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
        ) : (
          <div className="card flush"><p className="empty" role="status">{recentError || (recent ? "Aucun appel annoncé pour le moment." : "Chargement des annonces…")}</p></div>
        )}
      </section>
    </div>
  );
}
