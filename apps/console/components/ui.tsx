import { iconPaths, type BankLinkStatus, type CallStatus, type IconName, type InviteStatus, type Tone } from "@vigie/shared";

export function Icon({ name, size = 24, color = "currentColor", strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const p = iconPaths[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {p.circles?.map(([cx, cy, r], i) => <circle key={`c${i}`} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} />)}
      {p.d.map((d, i) => (
        <path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** Pastille de statut : toujours icône + mot (jamais la couleur seule). */
export function Badge({ tone, icon, label }: { tone: Tone; icon: IconName; label: string }) {
  return (
    <span className="badge" style={{ background: `var(--${tone}-bg)`, color: `var(--${tone}-fg)` }}>
      <Icon name={icon} size={14} strokeWidth={2.2} />
      {label}
    </span>
  );
}

const linkLook: Record<BankLinkStatus, { tone: Tone; icon: IconName; label: string }> = {
  certified: { tone: "positive", icon: "check", label: "Identité confirmée" },
  pending: { tone: "warning", icon: "clock", label: "À confirmer" },
  basic: { tone: "neutral", icon: "shield", label: "Non lié" },
};

export const LinkBadge = ({ status }: { status: BankLinkStatus }) => <Badge {...linkLook[status]} />;

const callLook: Record<CallStatus, { tone: Tone; icon: IconName; label: string }> = {
  announced: { tone: "neutral", icon: "clock", label: "Annoncé" },
  seen: { tone: "neutral", icon: "check", label: "Annonce consultée" },
  confirmed: { tone: "positive", icon: "check", label: "Réception confirmée" },
  ended: { tone: "neutral", icon: "phoneOff", label: "Terminé" },
  expired: { tone: "neutral", icon: "clock", label: "Expiré" },
  rejected: { tone: "danger", icon: "stop", label: "Refusé par le client" },
};

export const CallBadge = ({ status }: { status: CallStatus }) => <Badge {...callLook[status]} />;

export const timeFr = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + " · " + timeFr(iso);

export const shortDateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** « il y a 3 h », « hier », « il y a 2 j » : repère rapide pour les listes. */
export function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "à l’instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "hier";
  if (d < 30) return `il y a ${d} j`;
  return shortDateFr(iso);
}

const inviteLook: Record<InviteStatus, { tone: Tone; icon: IconName; label: string }> = {
  open: { tone: "warning", icon: "clock", label: "Ouverte" },
  used: { tone: "positive", icon: "check", label: "Utilisée" },
  expired: { tone: "neutral", icon: "clock", label: "Expirée" },
  cancelled: { tone: "neutral", icon: "close", label: "Annulée" },
};
export const InviteBadge = ({ status }: { status: InviteStatus }) => <Badge {...inviteLook[status]} />;

export const initials = (name: string | null) => (name ?? "?").split(/\s+/).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? "").join("") || "?";

export const Avatar = ({ name, size = 32 }: { name: string | null; size?: number }) => (
  <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">{initials(name)}</span>
);

/** Pagination simple : « 21 à 40 sur 57 » + précédent / suivant. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  if (total <= pageSize) return total ? <div className="pager"><span className="faint">{total} résultat{total > 1 ? "s" : ""}</span></div> : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span className="faint">{from} à {to} sur {total}</span>
      <div className="actions">
        <button className="btn secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="back" size={14} /> Précédent</button>
        <button className="btn secondary" disabled={to >= total} onClick={() => onPage(page + 1)}>Suivant <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon name="back" size={14} /></span></button>
      </div>
    </div>
  );
}

/** Onglets accessibles (flèches gauche / droite). */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (id: T) => void; label: string }) {
  const move = (i: number, e: React.KeyboardEvent) => {
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next]!.id);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={value === t.id} aria-controls={`panel-${t.id}`} tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)} onKeyDown={(e) => move(i, e)}>
          {t.label}{t.count !== undefined ? <span className="tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
