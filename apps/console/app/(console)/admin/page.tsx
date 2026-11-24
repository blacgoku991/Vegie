"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivationLink, AdminBank } from "@vigie/shared";
import { formatPhone } from "@vigie/shared";
import { api } from "@/lib/api";
import { ActivationBox } from "@/components/activation";
import { useRequireRole } from "@/components/nav";
import { Badge, Icon } from "@/components/ui";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Équipe SmartSecure : création des banques et de leur premier responsable. */
export default function AdminBanksPage() {
  const allowed = useRequireRole("superadmin");
  const [banks, setBanks] = useState<AdminBank[]>([]);
  const [form, setForm] = useState({ name: "", slug: "", numbers: "", adminName: "", adminEmail: "" });
  const [manager, setManager] = useState<{ bank: AdminBank; name: string; email: string } | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [link, setLink] = useState<{ who: string; activation: ActivationLink } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.adminBanks().then(setBanks).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.createBank({
        name: form.name.trim(),
        slug: form.slug.trim(),
        officialNumbers: form.numbers.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean),
        admin: { name: form.adminName.trim(), email: form.adminEmail.trim() },
      });
      setLink({ who: res.admin.name, activation: res.activation });
      setForm({ name: "", slug: "", numbers: "", adminName: "", adminEmail: "" });
      setSlugTouched(false);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) return null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Banques</h1>
          <p className="sub">Ajoutez une banque partenaire et son premier responsable : c'est lui qui crée ensuite les comptes de ses conseillers.</p>
        </div>
      </header>

      {error ? <p className="error" role="alert"><Icon name="alert" size={16} />{error}</p> : null}
      {link ? <ActivationBox who={link.who} activation={link.activation} onClose={() => setLink(null)} /> : null}

      <details className="disclosure"><summary><Icon name="plus" size={16} />Ajouter une banque partenaire</summary>
      <form className="card stack" onSubmit={create} aria-label="Nouvelle banque">
        <h2>Nouvelle banque</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="n-name">Nom de la banque</label>
            <input
              id="n-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })}
              required
              minLength={2}
            />
          </div>
          <div className="field">
            <label htmlFor="n-slug">Identifiant</label>
            <input
              id="n-slug"
              className="input"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm({ ...form, slug: e.target.value });
              }}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
          </div>
          <div className="field">
            <label htmlFor="n-admin">Nom du premier responsable</label>
            <input id="n-admin" className="input" value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required minLength={2} />
          </div>
          <div className="field">
            <label htmlFor="n-email">E-mail du responsable</label>
            <input id="n-email" className="input" type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="n-numbers">Numéros officiels publics (un par ligne, fournis par la banque)</label>
          <textarea id="n-numbers" className="input" rows={3} value={form.numbers} onChange={(e) => setForm({ ...form, numbers: e.target.value })} />
        </div>
        <div>
          <button className="btn big" disabled={busy}>
            Créer la banque
          </button>
        </div>
      </form></details>

      {manager ? <form className="card stack" aria-label="Ajouter un responsable" onSubmit={async event => {
        event.preventDefault();
        setBusy(true); setError(null);
        try {
          const result = await api.addBankAdmin(manager.bank.id, { name: manager.name, email: manager.email });
          setLink({ who: result.admin.name, activation: result.activation }); setManager(null); load();
        } catch (err) { setError((err as Error).message); }
        finally { setBusy(false); }
      }}>
        <h2>Responsable · {manager.bank.name}</h2>
        <div className="grid-2">
          <label className="field">Nom<input className="input" autoFocus required minLength={2} value={manager.name} onChange={e => setManager({ ...manager, name: e.target.value })} /></label>
          <label className="field">E-mail professionnel<input className="input" type="email" required value={manager.email} onChange={e => setManager({ ...manager, email: e.target.value })} /></label>
        </div>
        <div className="actions"><button className="btn" disabled={busy}>Créer le compte</button><button className="btn secondary" disabled={busy} type="button" onClick={() => setManager(null)}>Annuler</button></div>
      </form> : null}
      <section className="card flush" aria-label="Banques">
        <h2 className="table-title">Annuaire des banques</h2>
        <table>
          <thead>
            <tr>
              <th>Banque</th>
              <th>Numéros officiels</th>
              <th className="num">Comptes</th>
              <th className="num">Clients liés</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {banks.map((b) => (
              <tr key={b.id}>
                <td>
                  <span className="cell-main">{b.name}</span>
                  <div className="cell-sub">{b.slug}</div>
                  {b.partner ? <button className="btn ghost" style={{ height: 24, padding: 0, color: "var(--accent)" }} onClick={() => { setError(null); setManager({ bank: b, name: "", email: "" }); }}>Ajouter un responsable</button> : null}
                </td>
                <td className="soft">{b.officialNumbers.length ? b.officialNumbers.map(formatPhone).join(", ") : "Non renseignés"}</td>
                <td className="num">{b.staff}</td>
                <td className="num">{b.linkedClients}</td>
                <td>{b.partner ? <Badge tone="positive" icon="check" label="Partenaire" /> : <Badge tone="neutral" icon="shield" label="Protection de base" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
