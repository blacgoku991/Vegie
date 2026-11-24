"use client";

import { useState } from "react";

/**
 * Histogramme d'une seule série (pas de légende : le titre la nomme).
 * Barres fines, extrémité arrondie de 4 px posée sur la ligne de base, 2 px d'écart,
 * grille discrète, info-bulle au survol et au clavier, tableau accessible.
 */
export function BarChart({ title, units, data }: { title: string; units: [string, string]; data: Array<{ day: string; value: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const W = 460;
  const H = 200;
  const pad = { l: 28, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / data.length;
  const barW = Math.max(6, Math.min(14, slot - 2));
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const label = (day: string) => new Date(day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const plural = (n: number) => `${n} ${n > 1 ? units[1] : units[0]}`;

  return (
    <figure className="card stack" style={{ margin: 0, gap: 16 }}>
      <figcaption className="row between">
        <h3>{title}</h3>
        <button className="btn ghost" style={{ height: 28 }} onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
          {showTable ? "Voir le graphique" : "Voir le tableau"}
        </button>
      </figcaption>

      {showTable ? (
        <table>
          <thead>
            <tr>
              <th>Jour</th>
              <th>Nombre</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <td>{label(d.day)}</td>
                <td>{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ position: "relative", overflowX: "auto" }}>
          <svg style={{ minWidth: W }} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title} sur 14 jours`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="chart-grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
                <text className="chart-axis" x={pad.l - 8} y={y(t) + 4} textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = pad.l + i * slot + (slot - barW) / 2;
              const h = Math.max(0, y(0) - y(d.value));
              const r = Math.min(4, h);
              // Barre : coins arrondis en haut uniquement, base droite sur l'axe.
              const path = h
                ? `M${x},${y(0)} V${y(d.value) + r} Q${x},${y(d.value)} ${x + r},${y(d.value)} H${x + barW - r} Q${x + barW},${y(d.value)} ${x + barW},${y(d.value) + r} V${y(0)} Z`
                : "";
              return (
                <g key={d.day}>
                  {/* Cible de survol plus large que la barre. */}
                  <rect
                    x={pad.l + i * slot}
                    y={pad.t}
                    width={slot}
                    height={innerH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${label(d.day)} : ${plural(d.value)}`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                  />
                  {path ? <path d={path} className="chart-bar" style={{ opacity: hover === null || hover === i ? 1 : 0.55, pointerEvents: "none" }} /> : null}
                  {(i % 4 === 0 && data.length - 1 - i >= 3) || i === data.length - 1 ? (
                    <text className="chart-axis" x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle">
                      {label(d.day)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
          {hover !== null ? (() => {
            const fx = (pad.l + hover * slot + slot / 2) / W;
            const fy = y(data[hover]!.value) / H;
            const edge = fx < 0.2 ? "start" : fx > 0.8 ? "end" : "mid";
            const below = fy < 0.28;
            const tx = edge === "start" ? "0" : edge === "end" ? "-100%" : "-50%";
            return (
              <div
                className="tooltip"
                style={{
                  left: `clamp(8px, ${fx * 100}%, calc(100% - 8px))`,
                  top: `${fy * 100}%`,
                  transform: `translate(${tx}, ${below ? "10px" : "calc(-100% - 8px)"})`,
                }}
              >
                <strong>{plural(data[hover]!.value)}</strong> · {label(data[hover]!.day)}
              </div>
            );
          })() : null}
        </div>
      )}
    </figure>
  );
}
