"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/ui";

const focusable = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Confirmation modale accessible : dialogue nommé, focus initial sur « Annuler »,
 * Tab contenu dans la boîte, Échap pour annuler, focus restitué au déclencheur.
 */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = "Annuler", busy, onConfirm, onCancel }: {
  title: string; children: React.ReactNode; confirmLabel: string; cancelLabel?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
    return () => opener?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onCancel(); return; }
    if (e.key !== "Tab" || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(focusable));
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={box} className="modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} onKeyDown={onKeyDown}>
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <span style={{ color: "var(--danger-fg)", marginTop: 2 }}><Icon name="alert" size={20} /></span>
          <div className="stack" style={{ gap: 8 }}>
            <h2 id={titleId} style={{ fontSize: 17 }}>{title}</h2>
            <div id={descId} className="soft">{children}</div>
          </div>
        </div>
        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button ref={cancel} className="btn secondary" onClick={onCancel}>{cancelLabel}</button>
          <button className="btn" style={{ background: "var(--danger-solid)", color: "#fff" }} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
