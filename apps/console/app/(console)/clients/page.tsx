"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Agency, ClientListItem, Page } from "@vigie/shared";
import { api } from "@/lib/api";
import { useAdvisor } from "@/components/advisor";
import { Avatar, Icon, LinkBadge, Pager, ago, shortDateFr } from "@/components/ui";

const PAGE_SIZE = 15;

export default function ClientsPage() {
  const advisor = useAdvisor();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [sort, setSort] = useState("name:asc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<ClientListItem> | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (advisor && advisor.role !== "superadmin") api.agencies().then(setAgencies).catch(() => undefined);
  }, [advisor]);
  useEffect(() => {
    const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!advisor || advisor.role === "superadmin") return;
    let alive = true;
    const [key, dir] = sort.split(":");
    api.customers({ q: query, status, agencyId, sort: key, dir, page, pageSize: PAGE_SIZE })
      .then((d) => { if (alive) { setData(d); setError(""); } })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [advisor, query, status, agencyId, sort, page]);

  if (advisor?.role === "superadmin") return null;
  const filtered = !!(query || status || agencyId);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Clients</h1>
          <p className="sub">Les clients qui ont relié leur compte SmartSecure à {advisor?.bankName ?? "votre banque"}.</p>
        </div>
        <Link href="/invites?new=1" className="btn big"><Icon name="plus" size={16} /> Inviter un client</Link>
      </header>

      <section className="section">
        <div className="toolbar" role="search">
          <div className="search-wrap grow">
            <Icon name="search" size={16} />
            <input className="input search sm" aria-label="Rechercher un client" placeholder="Prénom, référence ou téléphone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input select" aria-label="Statut du lien" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Tous les statuts</option>
            <option value="certified">Identité confirmée</option>
            <option value="pending">À confirmer</option>
          </select>
          <select className="input select" aria-label="Agence du conseiller" value={agencyId} onChange={(e) => { setAgencyId(e.target.value); setPage(1); }}>
            <option value="">Toutes les agences</option>
            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="input select" aria-label="Trier par" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="name:asc">Prénom (A à Z)</option>
            <option value="last_call:desc">Dernier appel (récent)</option>
            <option value="linked:desc">Liaison (récente)</option>
            <option value="linked:asc">Liaison (ancienne)</option>
          </select>
        </div>

        <div className="card flush" aria-live="polite">
          {error ? <p className="error" role="alert" style={{ padding: 20 }}>{error}</p> : !data ? <p className="empty" role="status">Chargement des clients…</p> : data.items.length === 0 ? (
            <p className="empty">{filtered ? "Aucun client ne correspond à ces critères." : "Aucun client relié pour le moment. Invitez un premier client avec un code personnel."}</p>
          ) : (
            <table>
              <thead>
                <tr><th>Client</th><th>Téléphone</th><th>Lien</th><th>Conseiller référent</th><th>Dernier appel</th><th aria-hidden="true" /></tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.userId} className="click" onClick={() => router.push(`/clients/${c.userId}`)}>
                    <td>
                      <div className="row" style={{ gap: 12 }}>
                        <Avatar name={c.firstName} />
                        <div>
                          <Link className="table-action" href={`/clients/${c.userId}`} onClick={(e) => e.stopPropagation()}>{c.firstName ?? "Client"}</Link>
                          <div className="cell-sub">{c.customerRef ?? "Sans référence"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular">{c.phone}</td>
                    <td><LinkBadge status={c.linkStatus} />{c.linkedAt ? <div className="cell-sub" style={{ marginTop: 2 }}>depuis le {shortDateFr(c.linkedAt)}</div> : null}</td>
                    <td>{c.referent ? <><div>{c.referent.name}</div><div className="cell-sub">{c.referent.agency || "Sans agence"}</div></> : <span className="faint">Non attribué</span>}</td>
                    <td className="soft">{c.lastCallAt ? ago(c.lastCallAt) : "Aucun"}</td>
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
