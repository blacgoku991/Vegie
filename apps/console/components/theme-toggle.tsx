"use client";

import { useEffect, useState } from "react";

type Pref = "system" | "light" | "dark";
const choices: { value: Pref; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
];

/** Bascule de thème : sombre par défaut, mémorisée en localStorage, appliquée via data-theme sur <html>. */
export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("dark");
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "system") setPref(t);
    } catch {}
  }, []);

  const choose = (p: Pref) => {
    setPref(p);
    const root = document.documentElement;
    try {
      localStorage.setItem("theme", p);
      if (p === "system") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", p);
    } catch {}
  };

  return (
    <div className="seg" role="group" aria-label="Apparence">
      {choices.map((c) => (
        <button key={c.value} type="button" aria-pressed={pref === c.value} onClick={() => choose(c.value)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
