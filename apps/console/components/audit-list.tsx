"use client";

import Link from "next/link";
import type { AuditEvent } from "@vigie/shared";
import { auditDetail, auditLabel, auditLook } from "@/lib/labels";
import { Icon, dateFr } from "@/components/ui";

/** Chronologie d'événements (fiche client) : une ligne par événement, icône + libellé + acteur. */
export function AuditTimeline({ events, showTarget = false }: { events: AuditEvent[]; showTarget?: boolean }) {
  if (!events.length) return <p className="empty">Aucun événement enregistré.</p>;
  return (
    <ol className="feed">
      {events.map((e) => {
        const look = auditLook(e.action);
        const detail = auditDetail(e);
        return (
          <li key={e.id}>
            <span className="feed-icon" style={{ background: `var(--${look.tone}-bg)`, color: `var(--${look.tone}-fg)` }}><Icon name={look.icon} size={14} strokeWidth={2.2} /></span>
            <div className="grow">
              <div className="cell-main">{auditLabel(e.action)}{showTarget && e.target?.label ? <span className="soft"> · {e.target.label}</span> : null}</div>
              <div className="cell-sub">{e.actor.name}{detail ? ` · ${detail}` : ""}</div>
            </div>
            <time className="faint" dateTime={e.at}>{dateFr(e.at)}</time>
          </li>
        );
      })}
    </ol>
  );
}

export function TargetLink({ event }: { event: AuditEvent }) {
  const t = event.target;
  if (!t?.label) return <span className="faint">–</span>;
  if (t.type === "client" && t.id) return <Link href={`/clients/${t.id}`}>{t.label}</Link>;
  return <>{t.label}</>;
}
