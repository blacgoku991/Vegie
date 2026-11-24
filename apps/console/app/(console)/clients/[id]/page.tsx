"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuditEvent, CallListItem, ClientDetail, ClientInvite, ClientNote, FakeCallReport } from "@vigie/shared";
import { api } from "@/lib/api";
import { useAdvisor } from "@/components/advisor";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AuditTimeline } from "@/components/audit-list";
import { InviteCard } from "@/components/invite";
import { Avatar, Badge, CallBadge, Icon, LinkBadge, Tabs, ago, dateFr, shortDateFr } from "@/components/ui";

type Tab = "overview" | "calls" | "reports" | "notes" | "journal";

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const advisor = useAdvisor();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [calls, setCalls] = useState<CallListItem[] | null>(null);
  const [reports, setReports] = useState<FakeCallReport[] | null>(null);
  const [notes, setNotes] = useState<ClientNote[] | null>(null);
  const [journal, setJournal] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const loadClient = useCallback(() => api.customer(id).then(setClient).catch((e: Error & { status?: number }) => {
    if (e.status === 404) setNotFound(true); else setError(e.message);
  }), [id]);
  useEffect(() => { void loadClient(); }, [loadClient]);

  // Onglet gardé dans l'adresse (#calls) : lien partageable, retour du navigateur cohérent.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as Tab;
      setTab(["calls", "reports", "notes", "journal"].includes(h) ? h : "overview");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const choose = (t: Tab) => { setTab(t); window.history.replaceState(null, "", t === "overview" ? window.location.pathname : `#${t}`); };

  useEffect(() => {
    if (!client) return;
    const fail = (e: Error) => setError(e.message);
    if (tab === "overview" || tab === "calls") api.customerCalls(id).then(setCalls).catch(fail);
    if (tab === "reports") api.customerReports(id).then(setReports).catch(fail);
    if (tab === "notes") api.customerNotes(id).then(setNotes).catch(fail);
    if (tab === "journal") api.customerJournal(id).then(setJournal).catch(fail);
  }, [tab, client, id]);

  if (notFound) {
    return (
      <div className="page">
        <Link href="/clients" className="back"><Icon name="back" size={16} /> Clients</Link>
        <div className="card"><p className="empty">Ce client n’est pas relié à votre banque, ou le lien a été supprimé.</p></div>
      </div>
    );
  }
  if (!client) return <p className="soft" role="status">{error || "Chargement de la fiche…"}</p>;
  const isAdmin = advisor?.role === "bank_admin";

  return (
    <div className="page">
      <Link href="/clients" className="back"><Icon name="back" size={16} /> Clients</Link>

      <header className="client-head">
        <Avatar name={client.firstName} size={52} />
        <div className="grow">
          <h1>{client.firstName ?? "Client"}</h1>
          <p className="sub tabular">{[client.customerRef, client.phone].filter(Boolean).join(" · ")}</p>
        </div>
        <LinkBadge status={client.linkStatus} />
      </header>

      {error ? <p className="error" role="alert">{error}</p> : null}

      <Tabs
        label="Sections de la fiche client"
        value={tab}
        onChange={choose}
        tabs={[
          { id: "overview", label: "Aperçu" },
          { id: "calls", label: "Appels", count: client.counts.calls },
          { id: "reports", label: "Signalements", count: client.counts.reports },
          { id: "notes", label: "Notes", count: client.counts.notes },
          { id: "journal", label: "Journal" },
        ]}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="stack" style={{ gap: 24 }}>
        {tab === "overview" ? <Overview client={client} calls={calls} isAdmin={isAdmin} onUnlinked={() => router.replace("/clients")} /> : null}

        {tab === "calls" ? (
          <div className="card flush">
            {!calls ? <p className="empty">Chargement…</p> : calls.length === 0 ? <p className="empty">Aucun appel annoncé à ce client.</p> : (
              <table>
                <thead><tr><th>Motif</th><th>Conseiller</th><th>Quand</th><th>Statut</th><th>Accusé de réception</th></tr></thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id} className="click" onClick={() => router.push(`/calls/${c.id}`)}>
                      <td><Link className="table-action" href={`/calls/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.reason}</Link></td>
                      <td>{c.advisor.name}<div className="cell-sub">{c.advisor.agency || "Sans agence"}</div></td>
                      <td className="soft">{dateFr(c.createdAt)}</td>
                      <td><CallBadge status={c.status} /></td>
                      <td className="soft">{c.confirmedAt ? dateFr(c.confirmedAt) : "Non"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {tab === "reports" ? (
          <div className="stack">
            <p className="faint">Appels suspects que ce client a signalés au nom de {advisor?.bankName}. Un numéro officiel affiché ne prouve pas à lui seul une usurpation.</p>
            <div className="card flush">
              {!reports ? <p className="empty">Chargement…</p> : reports.length === 0 ? <p className="empty">Aucun signalement de ce client.</p> : (
                <table>
                  <thead><tr><th>Signalé le</th><th>Numéro affiché</th><th>Réaction</th></tr></thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id}>
                        <td className="soft">{dateFr(r.reportedAt)}</td>
                        <td><span className="cell-main tabular">{r.number ?? "Numéro inconnu"}</span>{r.spoofedOfficial ? <div className="cell-sub">numéro officiel affiché</div> : null}</td>
                        <td><Badge tone="positive" icon="check" label="A raccroché" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : null}

        {tab === "notes" ? <Notes clientId={id} notes={notes} setNotes={setNotes} onChange={loadClient} /> : null}

        {tab === "journal" ? (
          <div className="stack">
            <p className="faint">Événements de ce client côté banque : liaison, annonces, notes.</p>
            <div className="card flush">{journal ? <AuditTimeline events={journal} /> : <p className="empty">Chargement…</p>}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Overview({ client, calls, isAdmin, onUnlinked }: { client: ClientDetail; calls: CallListItem[] | null; isAdmin: boolean; onUnlinked: () => void }) {
  const [invite, setInvite] = useState<ClientInvite | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const rows: Array<[string, React.ReactNode]> = [
    ["Référence client", client.customerRef ?? "Non renseignée"],
    ["Statut du lien", <LinkBadge key="l" status={client.linkStatus} />],
    ["Liaison", client.linkedAt ? shortDateFr(client.linkedAt) : "En attente de confirmation"],
    ["Conseiller référent", client.referent ? `${client.referent.name}${client.referent.agency ? ` · ${client.referent.agency}` : ""}` : "Non attribué"],
    ["Téléphone", <span key="p" className="tabular">{client.phone}</span>],
    ["Notifications", client.reachable ? "Appareil inscrit aux notifications" : "Aucun appareil inscrit aux notifications"],
  ];

  return (
    <>
      <div className="actions">
        {client.linkStatus === "certified" ? <Link className="btn big" href={`/announce?client=${client.userId}`}><Icon name="phone" size={16} /> Annoncer un appel</Link> : null}
        <button className="btn secondary" disabled={busy} onClick={() => run(async () => setInvite(await api.reinvite(client.userId)))}><Icon name="plus" size={16} /> Inviter de nouveau</button>
        {isAdmin ? <button className="btn danger" disabled={busy} onClick={() => setConfirm(true)}>Dissocier</button> : null}
      </div>

      {client.linkStatus === "certified" && !client.reachable ? (
        <p className="soft">Le client pourra consulter l’annonce dans l’application. Il ne recevra pas de notification.</p>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {invite ? (
        <div className="card stack">
          <div className="row between"><h2>Nouveau code de liaison</h2><button className="btn ghost" onClick={() => setInvite(null)}><Icon name="close" size={16} /> Fermer</button></div>
          <InviteCard invite={invite} />
        </div>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={`Dissocier ${client.firstName ?? "ce client"} de votre banque ?`}
          confirmLabel="Oui, dissocier"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => run(async () => { await api.unlink(client.userId); onUnlinked(); })}
        >
          Il ne pourra plus recevoir d’annonce d’appel de votre part et son lien certifié sera retiré. Ses notes sont conservées. Il pourra être invité de nouveau.
        </ConfirmDialog>
      ) : null}

      <div className="split even">
        <section className="card stack" style={{ gap: 4 }}>
          <h2 style={{ marginBottom: 8 }}>Identité côté banque</h2>
          <dl className="kv">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </section>
        <section className="card stack" style={{ gap: 4 }}>
          <h2 style={{ marginBottom: 8 }}>Activité récente</h2>
          {!calls ? <p className="faint">Chargement…</p> : calls.length === 0 ? <p className="soft">Aucun appel annoncé à ce client pour le moment.</p> : (
            <div className="rows tight">
              {calls.slice(0, 4).map((c) => (
                <Link key={c.id} href={`/calls/${c.id}`} className="row-link">
                  <div className="grow"><div className="cell-main">{c.reason}</div><div className="cell-sub">{c.advisor.name} · {ago(c.createdAt)}</div></div>
                  <CallBadge status={c.status} />
                </Link>
              ))}
            </div>
          )}
          <p className="faint" style={{ marginTop: 12 }}>Vous ne voyez que ce qui concerne votre banque : le lien, vos appels, vos signalements et vos notes.</p>
        </section>
      </div>
    </>
  );
}

function Notes({ clientId, notes, setNotes, onChange }: { clientId: string; notes: ClientNote[] | null; setNotes: (n: ClientNote[]) => void; onChange: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      const n = await api.addNote(clientId, text.trim());
      setNotes([n, ...(notes ?? [])]);
      setText("");
      onChange();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (n: ClientNote) => {
    setError("");
    try {
      await api.deleteNote(clientId, n.id);
      setNotes((notes ?? []).filter((x) => x.id !== n.id));
      onChange();
    } catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="stack">
      <form className="card stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <div className="field">
          <label htmlFor="note">Nouvelle note interne</label>
          <textarea id="note" className="input" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Visible uniquement par l’équipe de la banque, jamais par le client." />
        </div>
        <div className="row between">
          <span className="faint">{text.length} / 2000</span>
          <button className="btn" disabled={busy || !text.trim()} type="submit"><Icon name="plus" size={16} /> Ajouter la note</button>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </form>
      <div className="card flush">
        {!notes ? <p className="empty">Chargement…</p> : notes.length === 0 ? <p className="empty">Aucune note pour ce client.</p> : (
          <ul className="notes">
            {notes.map((n) => (
              <li key={n.id}>
                <Avatar name={n.authorName} />
                <div className="grow">
                  <div className="row between"><span className="cell-main">{n.authorName}</span><time className="faint" dateTime={n.createdAt}>{dateFr(n.createdAt)}</time></div>
                  <p className="note-text">{n.text}</p>
                </div>
                {n.canDelete ? <button className="icon-btn" aria-label={`Supprimer la note de ${n.authorName}`} title="Supprimer" onClick={() => void remove(n)}><Icon name="close" size={16} /></button> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
