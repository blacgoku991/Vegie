"use client";

import qrcode from "qrcode-generator";

/** QR code généré côté client (aucun appel réseau). Rendu en SVG, contraste maximal, zone calme de 4 modules. */
export function QrCode({ value, size = 240, label }: { value: string; size?: number; label: string }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) cells.push(<rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1.02} height={1.02} />);
    }
  }
  const total = n + quiet * 2;
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges" style={{ background: "#fff", borderRadius: 8, border: "1px solid #E8E8ED" }}>
      <g fill="#000">{cells}</g>
    </svg>
  );
}
