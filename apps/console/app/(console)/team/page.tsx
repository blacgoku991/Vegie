"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivationLink, Agency, StaffMember } from "@vigie/shared";
import { api } from "@/lib/api";
import { useAdvisor } from "@/components/advisor";
import { ActivationBox } from "@/components/activation";
import { useRequireRole } from "@/components/nav";
import { Badge, Icon } from "@/components/ui";

const roleLabel = { advisor: "Conseiller", bank_admin: "Responsable" } as const;

export default function TeamPage() {
  const allowed = useRequireRole("bank_admin");
  const me = useAdvisor();
  const [team, setTeam] = useState<StaffMember[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "advisor" as "advisor" | "bank_admin", agencyId: "", outboundNumber: "" });
  const [link, setLink] = useState<{ who: string; activation: ActivationLink } | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.team().then(setTeam).catch((e) => setError((e as Error).message));
    api.agencies().then(setAgencies).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api.createStaff({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        agencyId: form.agencyId || null,
        outboundNumber: form.outboundNumber.trim() || null,
      });
      setLink({ who: res.member.name, activation: res.activation });
      setForm({ name: "", email: "", role: "advisor", agencyId: "", outboundNumber: "" });
    });
  };

  if (!allowed) return null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Équipe</h1>
          <p className="sub">Gérez les accès de vos collaborateurs, leur agence et la ligne directe utilisée pour annoncer leurs appels.</p>
        </div>
      </header>

      {link ? <ActivationBox who={link.who} activation={link.activation} onClose={() => setLink(null)} /> : null}
      {error ? (
        <p className="error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      ) : null}

      <details className="disclosure"><summary><Icon name="plus" size={16} />Ajouter un membre</summary>
      <form className="card stack" onSubmit={create} aria-label="Nouveau compte">
        <h2>Nouveau compte</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="t-name">Nom</label>
            <input id="t-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
          </div>
          <div className="field">
            <label htmlFor="t-email">E-mail professionnel</label>
            <input id="t-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="t-role">Rôle</label>
            <select id="t-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "advisor" | "bank_admin" })}>
              <option value="advisor">Conseiller</option>
              <option value="bank_admin">Responsable de la banque</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-agency">Agence</label>
            <select id="t-agency" className="input" value={form.agencyId} onChange={(e) => setForm({ ...form, agencyId: e.target.value })}>
              <option value="">Sans agence</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-line">Ligne directe</label>
            <input id="t-line" className="input" inputMode="tel" value={form.outboundNumber} onChange={(e) => setForm({ ...form, outboundNumber: e.target.value })} placeholder="01 99 00 12 34" />
            <p className="faint">Le numéro depuis lequel il appellera ses clients. Jamais un numéro public de la banque.</p>
          </div>
        </div>
        <div>
          <button className="btn big" disabled={busy}>
            Créer le compte
          </button>
        </div>
      </form></details>

      <section className="section" aria-label="Comptes">
        <h2>Membres de l’équipe</h2>
        <div className="roster">
          {team.map(m => <article key={m.id} className="member">
            <header className="row between">
              <div><h3>{m.name}</h3><span className="faint">{m.email}</span></div>
              {!m.active ? <Badge tone="danger" icon="stop" label="Désactivé" /> :
                m.activated ? <Badge tone="positive" icon="check" label="Actif" /> : <Badge tone="warning" icon="clock" label="Activation en attente" />}
            </header>
            {editing?.id === m.id ? (
              <form className="stack" onSubmit={event => {
                event.preventDefault();
                void run(async () => {
                  await api.updateStaff(m.id, { role: editing.role, agencyId: editing.agencyId, outboundNumber: editing.outboundNumber });
                  setEditing(null);
                });
              }}>
                <div className="grid-3">
                  <label className="field">Rôle
                    <select className="input" value={editing.role} disabled={m.id === me?.id} onChange={e => setEditing({ ...editing, role: e.target.value as StaffMember["role"] })}>
                      <option value="advisor">Conseiller</option><option value="bank_admin">Responsable</option>
                    </select>
                  </label>
                  <label className="field">Agence
                    <select className="input" value={editing.agencyId ?? ""} onChange={e => setEditing({ ...editing, agencyId: e.target.value || null })}>
                      <option value="">Sans agence</option>{agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                  <label className="field">Ligne directe
                    <input className="input" type="tel" value={editing.outboundNumber ?? ""} onChange={e => setEditing({ ...editing, outboundNumber: e.target.value || null })} />
                  </label>
                </div>
                <div className="actions"><button disabled={busy} className="btn">Enregistrer</button>
                  <button disabled={busy} className="btn secondary" type="button" onClick={() => setEditing(null)}>Annuler</button></div>
              </form>
            ) : (
              <>
                <dl className="member-data">
                  <div><dt>Rôle</dt><dd>{roleLabel[m.role]}</dd></div>
                  <div><dt>Agence</dt><dd>{m.agency || "Sans agence"}</dd></div>
                  <div><dt>Ligne directe</dt><dd>{m.outboundNumber || "À déclarer"}</dd></div>
                </dl>
                <div className="actions">
                  <button className="btn secondary" disabled={busy} onClick={() => setEditing(m)}>Modifier</button>
                  {m.active ? <button className="btn ghost" disabled={busy} onClick={() => void run(async () => setLink({ who: m.name, activation: await api.activationLink(m.id) }))}>Nouveau lien</button> : null}
                  {m.id !== me?.id ? <button className="btn ghost" disabled={busy}
                    onClick={() => {
                      if (m.active && !window.confirm(`Désactiver le compte de ${m.name} ? Ses sessions et invitations en cours seront fermées.`)) return;
                      void run(() => m.active ? api.deactivateStaff(m.id) : api.reactivateStaff(m.id));
                    }}>{m.active ? "Désactiver" : "Réactiver"}</button> : null}
                </div>
              </>
            )}
          </article>)}
        </div>
      </section>
    </div>
  );
}
