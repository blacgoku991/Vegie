import { iconPaths, type BankLinkStatus, type CallStatus, type IconName, type Tone } from "@vigie/shared";

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
      <Icon name={icon} size={18} strokeWidth={2.4} />
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
  seen: { tone: "neutral", icon: "check", label: "Vu par le client" },
  confirmed: { tone: "positive", icon: "check", label: "Confirmé par le client" },
  ended: { tone: "neutral", icon: "phoneOff", label: "Terminé" },
  expired: { tone: "neutral", icon: "clock", label: "Expiré" },
  rejected: { tone: "danger", icon: "stop", label: "Refusé par le client" },
};

export const CallBadge = ({ status }: { status: CallStatus }) => <Badge {...callLook[status]} />;

export const timeFr = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + " · " + timeFr(iso);
