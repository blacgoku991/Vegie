"use client";

import { useCallback, useEffect, useState } from "react";
import type { Agency } from "@vigie/shared";
import { api } from "@/lib/api";
import { useRequireRole } from "@/components/nav";
import { Icon } from "@/components/ui";

export default function AgenciesPage() {
  const allowed = useRequireRole("bank_admin");
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.agencies().then(setAgencies).catch((e) => setError((e as Error).message));
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

  if (!allowed) return null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Agences</h1>
          <p className="sub">Le nom de l'agence s'affiche sur le téléphone du client quand son conseiller l'appelle.</p>
        </div>
      </header>

      <form
        className="card"
        style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: 20 }}
        aria-label="Nouvelle agence"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api.createAgency(name.trim());
            setName("");
          });
        }}
      >
        <div className="field" style={{ flex: 1, maxWidth: 420 }}>
          <label htmlFor="ag-name">Nouvelle agence</label>
          <input id="ag-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agence Lyon Bellecour" required minLength={2} />
        </div>
        <div>
          <button className="btn" disabled={busy}>
            <Icon name="plus" size={16} /> Ajouter l'agence
          </button>
        </div>
      </form>

      {error ? (
        <p className="error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      ) : null}

      <section className="card flush" aria-label="Agences">
        {agencies.length === 0 ? (
          <p className="empty">Aucune agence pour le moment.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Agence</th>
                <th>Comptes</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.id}>
                  <td>
                    {edit?.id === a.id ? (
                      <form
                        className="row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await api.renameAgency(a.id, edit.name.trim());
                            setEdit(null);
                          });
                        }}
                      >
                        <input className="input" aria-label="Nom de l'agence" value={edit.name} onChange={(e) => setEdit({ id: a.id, name: e.target.value })} required minLength={2} />
                        <button className="btn">Enregistrer</button>
                      </form>
                    ) : (
                      <span className="cell-main">{a.name}</span>
                    )}
                  </td>
                  <td className="soft">{a.advisors}</td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                      <button className="btn secondary" disabled={busy} onClick={() => setEdit({ id: a.id, name: a.name })}>
                        Renommer
                      </button>
                      <button
                        className="btn danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Supprimer ${a.name} ? Ses ${a.advisors} compte(s) resteront actifs, sans agence.`)) void run(() => api.deleteAgency(a.id));
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
