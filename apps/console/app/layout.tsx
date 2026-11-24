import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font", display: "swap" });

export const metadata: Metadata = {
  title: "SmartSecure · Espace banque",
  description: "Préparez vos appels clients et suivez les signalements de votre banque.",
  robots: { index: false, follow: false },
};

/** Appliqué avant le premier rendu : sombre par défaut (direction « Noir »), sans flash au chargement. */
const themeScript = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="system")t="dark";if(t!=="system")document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
