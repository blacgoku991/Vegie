// Captures + erreurs console de toutes les pages (app web :8081, console :3000), en clair et en sombre.
// Usage : node scripts/qa-captures.cjs [dossier de sortie]  (serveurs de dev lancés, base de démo chargée)
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(require.resolve("playwright", { paths: [process.cwd()] }));

const OUT = process.argv[2] || path.join(process.env.TEMP || ".", "smartsecure-qa");
fs.mkdirSync(OUT, { recursive: true });
const shell = fs
  .readdirSync(path.join(process.env.LOCALAPPDATA, "ms-playwright"))
  .filter((d) => d.startsWith("chromium_headless_shell-"))
  .sort()
  .pop();
const executablePath = path.join(process.env.LOCALAPPDATA, "ms-playwright", shell, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
const report = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(browser, { name, viewport, scheme }) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e.message).slice(0, 300)));
  const shot = async (label) => {
    await wait(1200);
    const file = path.join(OUT, `${name}-${scheme}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    report.push({ page: `${name}-${scheme}-${label}`, url: page.url(), errors: errors.splice(0), horizontalOverflow: overflow });
  };
  return { ctx, page, shot };
}

/** Annonce un appel de démo à Jeanne depuis le compte conseiller (termine une annonce encore ouverte). */
async function announce() {
  const api = "http://localhost:4000/v1/console";
  const login = await fetch(api + "/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "conseiller@banque-horizon.test", password: "vigie-demo" }) });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const h = { cookie, "content-type": "application/json" };
  const clients = await (await fetch(api + "/clients?q=0639980001", { headers: h })).json();
  const userId = clients[0] && clients[0].userId;
  if (!userId) return false;
  for (let i = 0; i < 2; i++) {
    const r = await fetch(api + "/calls", { method: "POST", headers: h, body: JSON.stringify({ userId, reason: "Point sur votre épargne" }) });
    if (r.ok) return true;
    const log = await (await fetch(api + "/call-log", { headers: h })).json().catch(() => null);
    const open = ((log && (log.items || log)) || []).find((c) => !["ended", "expired", "rejected"].includes(c.status));
    if (!open) return false;
    await fetch(api + "/calls/" + open.id + "/end", { method: "POST", headers: { cookie } });
  }
  return false;
}

async function app(browser, scheme) {
  const { ctx, page, shot } = await session(browser, { name: "app", viewport: { width: 390, height: 844 }, scheme });
  const base = "http://localhost:8081";
  await page.goto(base + "/welcome");
  await shot("01-bienvenue");
  await page.goto(base + "/login");
  await shot("02-numero");
  // Connexion de démo (DEV_FIXED_OTP). L'API n'envoie qu'un SMS par numéro toutes les 45 s : on réessaie après.
  await page.goto(base + "/code?phone=" + encodeURIComponent("06 39 98 00 01"));
  await shot("03-code");
  // Session de démo posée directement (code fixe DEV_FIXED_OTP) : les captures ne dépendent pas du délai entre deux SMS.
  await fetch("http://localhost:4000/v1/auth/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: "0639980001" }) }).catch(() => {});
  const auth = await (await fetch("http://localhost:4000/v1/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: "0639980001", code: "000000" }) })).json();
  if (!auth.token) report.push({ page: `app-${scheme}-connexion`, fatal: "connexion de démo échouée" });
  await page.evaluate(([token, owner, theme]) => { localStorage.setItem("vigie.session", token); localStorage.setItem("smartsecure.owner", owner); localStorage.setItem("theme-preference", theme); }, [auth.token, auth.user && auth.user.id, scheme]);
  for (const [label, route] of [
    ["04-accueil", "/"],
    ["05-historique", "/history"],
    ["06-profil", "/settings"],
    ["07-banques", "/banks"],
    ["08-rejoindre", "/join"],
    ["09-verifier", "/check-message"],
    ["10-proches", "/contacts"],
    ["11-boites", "/mailboxes"],
    ["12-protections", "/protections"],
    ["13-rappel", "/callback"],
    ["14-simulateur", "/dev-call"],
  ]) {
    await page.goto(base + route);
    await shot(label);
  }
  await page.goto(base + "/history");
  await wait(1500);
  const alert = page.locator('[href*="/alert/"], [role="link"]').first();
  if (await alert.count()) {
    await alert.click().catch(() => {});
    await shot("15-alerte");
  }
  await page.goto(base + "/call/check?simulate=" + encodeURIComponent("01 99 00 00 00"));
  await wait(3000);
  await shot("16-non-certifie");
  if (await announce()) {
    await page.goto(base + "/");
    await shot("17-accueil-annonce");
    await page.goto(base + "/call/check");
    await wait(3000);
    await shot("18-appel-annonce");
    await page.goto(base + "/call/check?simulate=" + encodeURIComponent("01 99 00 12 34"));
    await wait(3000);
    await shot("19-certifie");
  }
  await ctx.close();
}

async function consolePages(browser, scheme, who) {
  const { ctx, page, shot } = await session(browser, { name: `console-${who}`, viewport: { width: 1440, height: 900 }, scheme });
  const base = "http://localhost:3000";
  await page.goto(base + "/login");
  if (who === "responsable") await shot("01-login");
  await page.getByLabel(/mail/i).fill(`${who}@banque-horizon.test`);
  await page.getByLabel(/mot de passe/i).fill("vigie-demo");
  await page.keyboard.press("Enter");
  await wait(3000);
  const routes = [["02-tableau", "/"], ["03-clients", "/clients"], ["05-appels", "/calls"], ["06-invitations", "/invites"], ["07-signalements", "/reports"], ["08-activite", "/stats"], ["09-annoncer", "/announce"]];
  if (who === "responsable") routes.push(["10-equipe", "/team"], ["11-agences", "/agencies"], ["12-numeros", "/settings"], ["13-journal", "/journal"]);
  for (const [label, route] of routes) {
    await page.goto(base + route);
    await shot(label);
    if (route === "/clients") {
      const first = page.locator('a[href^="/clients/"]').first();
      if (await first.count()) {
        await first.click();
        await shot("04-fiche");
      }
    }
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath });
  const only = process.env.QA_ONLY;
  for (const scheme of (process.env.QA_SCHEMES || "dark,light").split(",")) {
    if (only !== "console") await app(browser, scheme).catch((e) => report.push({ page: `app-${scheme}`, fatal: String(e.message).slice(0, 300) }));
    if (only !== "app") for (const who of ["responsable", "conseiller"])
      await consolePages(browser, scheme, who).catch((e) => report.push({ page: `console-${who}-${scheme}`, fatal: String(e.message).slice(0, 300) }));
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "rapport.json"), JSON.stringify(report, null, 2));
  const bad = report.filter((r) => r.fatal || (r.errors && r.errors.length) || r.horizontalOverflow);
  console.log(`${report.length} pages, ${bad.length} avec problème -> ${OUT}`);
  for (const r of bad) console.log(r.page, r.fatal ?? "", r.horizontalOverflow ? "[débordement horizontal]" : "", (r.errors || []).slice(0, 2).join(" | "));
})();
