"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientActivation, InviteListItem, InviteStatus } from "@vigie/shared";
import { api } from "@/lib/api";
import { useAdvisor } from "@/components/advisor";
import { InviteClient } from "@/components/invite";
import { NewClient, PendingActivations } from "@/components/activations";
import { InviteBadge, dateFr } from "@/components/ui";

const filters: Array<{ id: InviteStatus | ""; label: string }> = [
  { id: "", label: "Toutes" },
  { id: "open", label: "Ouvertes" },
  { id: "used", label: "Utilisées" },
  { id: "expired", label: "Expirées" },
  { id: "cancelled", label: "Annulées" },
];

export default function InvitesPage() {
  const advisor = useAdvisor();
  const [invites, setInvites] = useState<InviteListItem[] | null>(null);
  const [filter, setFilter] = useState<InviteStatus | "">("");
  const [error, setError] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [pending, setPending] = useState<ClientActivation[]>([]);
  const loadPending = useCallback(() => api.activations().then(setPending).catch(() => undefined), []);

  const load = useCallback(() => api.invites().then((l) => { setInvites(l); setError(""); }).catch((e: Error) => setError(e.message)), []);
  useEffect(() => {
    setOpenForm(new URLSearchParams(window.location.search).get("new") === "1");
  }, []);
  useEffect(() => {
    if (!advisor || advisor.role === "superadmin") return;
    void load();
    void loadPending();
    const t = setInterval(() => { void load(); void loadPending(); }, 20000);
    return () => clearInterval(t);
  }, [advisor, load, loadPending]);

  const cancel = async (i: InviteListItem) => {
    setError("");
    try { await api.cancelInvite(i.id); await load(); } catch (e) { setError((e as Error).message); }
  };

  if (advisor?.role === "superadmin") return null;
  const shown = (invites ?? []).filter((i) => !filter || i.status === filter);
  const isAdmin = advisor?.role === "bank_admin";

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Invitations</h1>
          <p className="sub">{isAdmin ? "Les codes de liaison créés par l’équipe, sur les 30 derniers jours." : "Vos codes de liaison, sur les 30 derniers jours."} Un code reste valable quinze minutes et ne sert qu’une fois.</p>
        </div>
      </header>

      <section className="card flat stack" style={{ alignItems: "flex-start" }}>
        <NewClient onCreated={() => void loadPending()} />
      </section>

      <PendingActivations items={pending} onChange={() => void loadPending()} />

      <section className="card flat stack" style={{ alignItems: "flex-start" }} key={String(openForm)}>
        <InviteClient defaultOpen={openForm} onCreated={() => void load()} />
      </section>

      <section className="section">
        <div className="chips" role="group" aria-label="Filtrer par statut">
          {filters.map((f) => (
            <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}{invites ? <span className="tab-count">{f.id ? invites.filter((i) => i.status === f.id).length : invites.length}</span> : null}
            </button>
          ))}
        </div>
        <div className="card flush" aria-live="polite">
          {error ? <p className="error" role="alert" style={{ padding: 20 }}>{error}</p> : !invites ? <p className="empty" role="status">Chargement des invitations…</p> : shown.length === 0 ? (
            <p className="empty">{filter ? "Aucune invitation dans cet état." : "Aucune invitation récente."}</p>
          ) : (
            <table>
              <thead>
                <tr><th>Client</th><th>Créée par</th><th>Créée</th><th>Validité</th><th>Statut</th><th className="num"><span className="visually-hidden">Actions</span></th></tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id}>
                    <td><span className="cell-main tabular">{i.clientPhone || "Numéro non renseigné"}</span><div className="cell-sub">{i.customerRef ?? "Sans référence"}</div></td>
                    <td>{i.advisorName}</td>
                    <td className="soft">{dateFr(i.createdAt)}</td>
                    <td className="soft">{i.status === "used" && i.usedAt ? `Utilisée le ${dateFr(i.usedAt)}` : i.status === "open" ? `Jusqu’à ${new Date(i.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "–"}</td>
                    <td><InviteBadge status={i.status} /></td>
                    <td className="num">{i.status === "open" ? <button className="btn secondary" onClick={() => void cancel(i)}>Annuler</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
