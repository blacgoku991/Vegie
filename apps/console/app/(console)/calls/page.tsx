"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Agency, CallListItem, Page, StaffMember } from "@vigie/shared";
import { api } from "@/lib/api";
import { useAdvisor } from "@/components/advisor";
import { CallBadge, Icon, Pager, dateFr } from "@/components/ui";

const PAGE_SIZE = 15;
const statuses = [
  ["announced", "Annoncé"], ["seen", "Annonce consultée"], ["confirmed", "Réception confirmée"], ["ended", "Terminé"], ["rejected", "Refusé par le client"], ["expired", "Expiré"],
] as const;

export default function CallsPage() {
  const advisor = useAdvisor();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [advisorId, setAdvisorId] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<CallListItem> | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [team, setTeam] = useState<StaffMember[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!advisor || advisor.role === "superadmin") return;
    api.agencies().then(setAgencies).catch(() => undefined);
    if (advisor.role === "bank_admin") api.team().then(setTeam).catch(() => undefined);
  }, [advisor]);
  useEffect(() => {
    if (!advisor || advisor.role === "superadmin") return;
    let alive = true;
    api.callLog({ status, advisorId, agencyId, from, to, page, pageSize: PAGE_SIZE })
      .then((d) => { if (alive) { setData(d); setError(""); } })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [advisor, status, advisorId, agencyId, from, to, page]);

  if (advisor?.role === "superadmin") return null;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const filtered = !!(status || advisorId || agencyId || from || to);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Appels</h1>
          <p className="sub">Toutes les annonces d’appel faites au nom de votre banque.</p>
        </div>
        <Link href="/announce" className="btn big"><Icon name="phone" size={16} /> Annoncer un appel</Link>
      </header>

      <section className="section">
        <div className="toolbar">
          <select className="input select" aria-label="Statut" value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
            <option value="">Tous les statuts</option>
            {statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {advisor?.role === "bank_admin" ? (
            <select className="input select" aria-label="Conseiller" value={advisorId} onChange={(e) => reset(setAdvisorId)(e.target.value)}>
              <option value="">Tous les conseillers</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            <button className="btn secondary" aria-pressed={!!advisorId} onClick={() => reset(setAdvisorId)(advisorId ? "" : advisor!.id)}>Mes appels</button>
          )}
          <select className="input select" aria-label="Agence" value={agencyId} onChange={(e) => reset(setAgencyId)(e.target.value)}>
            <option value="">Toutes les agences</option>
            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className="date-field"><span>Du</span><input className="input" type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
          <label className="date-field"><span>au</span><input className="input" type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} /></label>
          {filtered ? <button className="btn ghost" onClick={() => { setStatus(""); setAdvisorId(""); setAgencyId(""); setFrom(""); setTo(""); setPage(1); }}>Effacer</button> : null}
        </div>

        <div className="card flush" aria-live="polite">
          {error ? <p className="error" role="alert" style={{ padding: 20 }}>{error}</p> : !data ? <p className="empty" role="status">Chargement des appels…</p> : data.items.length === 0 ? (
            <p className="empty">{filtered ? "Aucun appel ne correspond à ces critères." : "Aucun appel annoncé pour le moment."}</p>
          ) : (
            <table>
              <thead>
                <tr><th>Client</th><th>Motif</th><th>Conseiller</th><th>Quand</th><th>Statut</th><th aria-hidden="true" /></tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="click" onClick={() => router.push(`/calls/${c.id}`)}>
                    <td>
                      <Link className="table-action" href={`/calls/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.client.firstName ?? "Client"}</Link>
                      <div className="cell-sub tabular">{c.client.phone}</div>
                    </td>
                    <td>{c.reason}</td>
                    <td>{c.advisor.name}<div className="cell-sub">{c.advisor.agency || "Sans agence"}</div></td>
                    <td className="soft">{dateFr(c.createdAt)}</td>
                    <td><CallBadge status={c.status} /></td>
                    <td className="chev"><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon name="back" size={16} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data ? <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
        </div>
      </section>
    </div>
  );
}
