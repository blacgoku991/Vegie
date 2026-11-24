"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Advisor, IconName } from "@vigie/shared";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui";
import { AdvisorContext } from "@/components/advisor";

const nav: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Appeler un client", icon: "phone" },
  { href: "/stats", label: "Statistiques", icon: "chart" },
  { href: "/reports", label: "Faux appels signalés", icon: "alert" },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [advisor, setAdvisor] = useState<Advisor | null>(null);

  useEffect(() => {
    api.me().then(setAdvisor).catch(() => router.replace("/login"));
  }, [router]);

  if (!advisor) return null;

  const active = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/calls") : pathname.startsWith(href));

  return (
    <AdvisorContext.Provider value={advisor}>
      <div className="shell">
        <aside className="side">
          <div className="brand">
            <div className="brand-mark">
              <Icon name="shield" color="#fff" />
            </div>
            <div>
              <strong style={{ fontSize: 20 }}>Vigie</strong>
              <div className="faint">{advisor.bankName}</div>
            </div>
          </div>
          <nav className="nav" aria-label="Navigation principale">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}>
                <Icon name={n.icon} />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="side-foot">
            <div>
              <strong>{advisor.name}</strong>
              <div className="faint">{advisor.agency}</div>
            </div>
            <button
              className="btn secondary"
              onClick={async () => {
                await api.logout().catch(() => {});
                router.replace("/login");
              }}
            >
              <Icon name="logout" size={20} /> Se déconnecter
            </button>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </AdvisorContext.Provider>
  );
}
