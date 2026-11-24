"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Advisor } from "@vigie/shared";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui";
import { AdvisorContext } from "@/components/advisor";
import { navItems } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";

const roles = { advisor: "Conseiller", bank_admin: "Responsable", superadmin: "Administration" };

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [advisor, setAdvisor] = useState<Advisor | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api.me().then(setAdvisor).catch((e: Error) => setError(e.message));
  }, []);

  if (!advisor) return <main className="main" role="status"><p className="soft">{error || "Ouverture de votre espace…"}</p></main>;
  const nav = navItems(advisor.role);
  const active = (href: string) => href === "/" ? pathname === "/" || pathname.startsWith("/announce") : pathname === href || pathname.startsWith(`${href}/`);
  const logout = async () => {
    try { await api.logout(); router.replace("/login"); }
    catch (err) { setError((err as Error).message); }
  };
  const bankName = advisor.bankId ? advisor.bankName : "Administration";

  return (
    <AdvisorContext.Provider value={advisor}>
      <a className="skip" href="#contenu">Aller au contenu</a>
      <div className="app">
        <div className="topbar">
          <div className="brand"><img src="/smartsecure-icon.svg" alt="" width={28} height={28} className="brand-logo" /><strong>SmartSecure</strong></div>
          <button className="btn secondary" aria-expanded={menuOpen} aria-controls="navigation" onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
        </div>
        <aside id="navigation" className={`side ${menuOpen ? "open" : ""}`}>
          <div className="brand">
            <img src="/smartsecure-icon.svg" alt="" width={28} height={28} className="brand-logo" />
            <div><strong>SmartSecure</strong><small>{bankName}</small></div>
          </div>
          <nav className="nav" aria-label="Navigation principale">
            {nav.map((n, i) => (
              <span key={n.href} style={{ display: "contents" }}>
                {n.admin && !nav[i - 1]?.admin ? <span className="nav-label">Administration</span> : null}
                <Link href={n.href} onClick={() => setMenuOpen(false)} aria-current={active(n.href) ? "page" : undefined}>
                  <Icon name={n.icon} size={18} strokeWidth={1.8} />{n.label}
                </Link>
              </span>
            ))}
          </nav>
          <div className="side-foot">
            <ThemeToggle />
            <div className="user">
              <span className="avatar" aria-hidden="true">{advisor.name.split(/\s+/).slice(0, 2).map((n) => n[0]).join("")}</span>
              <div className="user-text"><strong>{advisor.name}</strong><span>{roles[advisor.role]}</span></div>
              <button className="icon-btn" onClick={() => void logout()} aria-label="Se déconnecter" title="Se déconnecter"><Icon name="logout" size={18} strokeWidth={1.8} /></button>
            </div>
          </div>
        </aside>
        <main id="contenu" tabIndex={-1} className="main">
          {error ? <p className="error" role="alert" style={{ marginBottom: 16 }}>{error}</p> : null}
          {children}
        </main>
      </div>
    </AdvisorContext.Provider>
  );
}
