"use client";

import { useEffect, useState } from "react";
import type { BankSettings } from "@vigie/shared";
import { formatPhone } from "@vigie/shared";
import { api } from "@/lib/api";
import { useRequireRole } from "@/components/nav";
import { Icon } from "@/components/ui";

export default function BankSettingsPage() {
  const allowed = useRequireRole("bank_admin");
  const [bank, setBank] = useState<BankSettings | null>(null);
  const [phone, setPhone] = useState("");
  const [numbers, setNumbers] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fill = (b: BankSettings) => {
    setBank(b);
    setPhone(b.officialPhone ? formatPhone(b.officialPhone) : "");
    setNumbers(b.officialNumbers.map(formatPhone).join("\n"));
  };
  useEffect(() => {
    if (allowed) api.bank().then(fill).catch((e) => setError((e as Error).message));
  }, [allowed]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      fill(await api.updateBank({ officialPhone: phone.trim() || null, officialNumbers: numbers.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean) }));
      setSaved(true);
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
          <h1>Numéros officiels</h1>
          <p className="sub">{bank?.name}</p>
        </div>
      </header>

      <form className="card stack" style={{ gap: 20, maxWidth: 720 }} onSubmit={save} aria-label="Numéros officiels">
        <h2>Numéros publics de la banque</h2>
        <p className="soft" style={{ fontSize: 15 }}>
          Ce sont les numéros publics de la banque (standard, service client). Les escrocs peuvent les usurper : un appel qui en vient sans annonce est signalé comme non certifié.
          Vos conseillers appellent depuis leur ligne directe, déclarée dans « Équipe ».
        </p>
        <div className="field">
          <label htmlFor="b-phone">Numéro officiel à rappeler</label>
          <input id="b-phone" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01 99 00 00 00" />
          <p className="faint">Ce numéro apparaît dans « Rappeler ma banque » sur le téléphone du client.</p>
        </div>
        <div className="field">
          <label htmlFor="b-numbers">Tous les numéros officiels (un par ligne)</label>
          <textarea id="b-numbers" className="input" rows={5} value={numbers} onChange={(e) => setNumbers(e.target.value)} />
        </div>
        {error ? (
          <p className="error" role="alert">
            <Icon name="alert" size={16} /> {error}
          </p>
        ) : null}
        {saved ? <p className="row" style={{ gap: 6, color: "var(--positive-fg)" }} role="status"><Icon name="check" size={16} /> Réglages enregistrés.</p> : null}
        <div>
          <button className="btn big" disabled={busy || !bank}>
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
