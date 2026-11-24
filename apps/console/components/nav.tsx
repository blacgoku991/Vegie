"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { IconName, StaffRole } from "@vigie/shared";
import { useAdvisor } from "@/components/advisor";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Section « Administration » de la barre latérale. */
  admin?: boolean;
}

/** Entrées de navigation selon le rôle (barre latérale du layout). */
export function navItems(role: StaffRole): NavItem[] {
  if (role === "superadmin") return [{ href: "/admin", label: "Banques", icon: "bank" }];
  const items: NavItem[] = [
    { href: "/", label: "Tableau de bord", icon: "shield" },
    { href: "/clients", label: "Clients", icon: "user" },
    { href: "/calls", label: "Appels", icon: "phone" },
    { href: "/invites", label: "Invitations", icon: "mail" },
    { href: "/reports", label: "Signalements", icon: "alert" },
    { href: "/stats", label: "Activité", icon: "chart" },
  ];
  if (role === "bank_admin") {
    items.push(
      { href: "/team", label: "Équipe", icon: "user", admin: true },
      { href: "/agencies", label: "Agences", icon: "bank", admin: true },
      { href: "/settings", label: "Numéros officiels", icon: "link", admin: true },
      { href: "/journal", label: "Journal d’activité", icon: "text", admin: true },
    );
  }
  return items;
}

/** Page réservée à certains rôles : les autres sont renvoyés à leur page d'accueil (le serveur refuse de toute façon en 403). */
export function useRequireRole(...roles: StaffRole[]): boolean {
  const advisor = useAdvisor();
  const router = useRouter();
  const allowed = !!advisor && roles.includes(advisor.role);
  useEffect(() => {
    if (advisor && !allowed) router.replace(advisor.role === "superadmin" ? "/admin" : "/");
  }, [advisor, allowed, router]);
  return allowed;
}

