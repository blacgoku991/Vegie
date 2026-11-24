"use client";

import { useEffect, useState } from "react";
import type { AuditEvent, Page, StaffMember } from "@vigie/shared";
import { api } from "@/lib/api";
import { useRequireRole } from "@/components/nav";
import { TargetLink } from "@/components/audit-list";
import { Badge, Icon, Pager, dateFr } from "@/components/ui";
import { auditCategories, auditDetail, auditLabel, auditLook } from "@/lib/labels";

const PAGE_SIZE = 20;

export default function JournalPage() {
  const allowed = useRequireRole("bank_admin");
  const [category, setCategory] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditEvent> | null>(null);
  const [team, setTeam] = useState<StaffMember[]>([]);
  const [error, setError] = useState("");

  useEffect(() => { if (allowed) api.team().then(setTeam).catch(() => undefined); }, [allowed]);
  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    api.audit({ category, actorId, from, to, q: query, page, pageSize: PAGE_SIZE })
      .then((d) => { if (alive) { setData(d); setError(""); } })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [allowed, category, actorId, from, to, query, page]);

  if (!allowed) return null;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const filtered = !!(category || actorId || from || to || query);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Journal d’activité</h1>
          <p className="sub">Les actions de l’équipe sur les clients, les appels, les invitations et les comptes. Aucun numéro de téléphone ni code n’y est enregistré.</p>
        </div>
      </header>

      <section className="section">
        <div className="toolbar">
          <div className="search-wrap grow">
            <Icon name="search" size={16} />
            <input className="input search sm" aria-label="Rechercher" placeholder="Rechercher un nom ou un client" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input select" aria-label="Type d’action" value={category} onChange={(e) => reset(setCategory)(e.target.value)}>
            <option value="">Toutes les actions</option>
            {auditCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="input select" aria-label="Auteur" value={actorId} onChange={(e) => reset(setActorId)(e.target.value)}>
            <option value="">Tous les auteurs</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <label className="date-field"><span>Du</span><input className="input" type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
          <label className="date-field"><span>au</span><input className="input" type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} /></label>
          {filtered ? <button className="btn ghost" onClick={() => { setCategory(""); setActorId(""); setFrom(""); setTo(""); setQ(""); setQuery(""); setPage(1); }}>Effacer</button> : null}
        </div>

        <div className="card flush" aria-live="polite">
          {error ? <p className="error" role="alert" style={{ padding: 20 }}>{error}</p> : !data ? <p className="empty" role="status">Chargement du journal…</p> : data.items.length === 0 ? (
            <p className="empty">{filtered ? "Aucun événement ne correspond à ces critères." : "Aucun événement enregistré."}</p>
          ) : (
            <table>
              <thead><tr><th>Date</th><th>Action</th><th>Auteur</th><th>Cible</th><th>Détail</th></tr></thead>
              <tbody>
                {data.items.map((e) => {
                  const look = auditLook(e.action);
                  return (
                    <tr key={e.id}>
                      <td className="soft" style={{ whiteSpace: "nowrap" }}>{dateFr(e.at)}</td>
                      <td><Badge tone={look.tone} icon={look.icon} label={auditLabel(e.action)} /></td>
                      <td>{e.actor.name}</td>
                      <td><TargetLink event={e} /></td>
                      <td className="soft">{auditDetail(e) || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {data ? <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
        </div>
      </section>
    </div>
  );
}
