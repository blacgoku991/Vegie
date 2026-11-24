import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { chromium, devices, type Browser } from "playwright";
import { checkUrl, isPublicHost } from "./guard.ts";

/**
 * Service « scanner » : visite un lien suspect dans un Chromium jetable et renvoie
 * la destination finale, les redirections, la présence de champs sensibles et une capture.
 *
 * Isolement : conteneur séparé, sans secret ni accès à la base, utilisateur non root,
 * contexte de navigation neuf à chaque visite, téléchargements et permissions refusés,
 * réseau interne bloqué (voir guard.ts).
 */
const PORT = Number(process.env.PORT ?? 4100);
const SECRET = process.env.SCANNER_SECRET ?? "";
const MAX_CONCURRENT = Number(process.env.SCANNER_CONCURRENCY ?? 2);
/**
 * Proxy de sortie optionnel (recommandé en production) : la résolution DNS se fait alors au proxy,
 * qui DOIT refuser les plages internes. Sans proxy, chaque hôte est résolu et vérifié ici.
 */
const PROXY = process.env.SCANNER_PROXY || undefined;

let browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browser?.isConnected()) {
    browser = await chromium.launch({
      // Permet d'utiliser un Chromium déjà présent (dev) ; l'image Docker fournit le sien.
      executablePath: process.env.CHROMIUM_PATH || undefined,
      proxy: PROXY ? { server: PROXY } : undefined,
      args: ["--disable-dev-shm-usage", "--no-first-run", "--disable-extensions", "--mute-audio"],
    });
  }
  return browser;
}

export interface ScanResult {
  url: string;
  finalUrl: string;
  chain: string[];
  title: string;
  hasPasswordField: boolean;
  hasCardField: boolean;
  screenshot: string | null;
  reachable: boolean;
}

async function scan(url: URL): Promise<ScanResult> {
  const b = await getBrowser();
  // Téléphone : les arnaques visent surtout les mobiles et adaptent parfois leur page.
  const context = await b.newContext({
    ...devices["iPhone 13"],
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    acceptDownloads: false,
    serviceWorkers: "block",
    permissions: [],
  });
  const chain: string[] = [];
  try {
    await context.route("**/*", async (route) => {
      const u = checkUrl(route.request().url());
      if (!u || !(await isPublicHost(u.hostname, { resolve: !PROXY }))) return route.abort("blockedbyclient");
      return route.continue();
    });
    const page = await context.newPage();
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame() && chain.at(-1) !== frame.url()) chain.push(frame.url());
    });
    const response = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
    for (let r = response?.request().redirectedFrom(); r; r = r.redirectedFrom()) chain.unshift(r.url());
    await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});

    const fields = { password: false, card: false };
    for (const frame of page.frames()) {
      const f = await frame
        .evaluate(() => {
          const inputs = Array.from(document.querySelectorAll("input"));
          const card = inputs.some((i) =>
            /cc-|card|carte|cvv|cvc|crypto|expir/i.test(`${i.autocomplete} ${i.name} ${i.id} ${i.placeholder} ${i.getAttribute("aria-label") ?? ""}`),
          );
          return { password: inputs.some((i) => i.type === "password"), card };
        })
        .catch(() => ({ password: false, card: false }));
      fields.password ||= f.password;
      fields.card ||= f.card;
    }

    // Page d'erreur de Chromium : site injoignable (hors ligne, bloqué, DNS inexistant).
    if (page.url().startsWith("chrome-error://")) {
      return { url: url.toString(), finalUrl: url.toString(), chain: [], title: "", hasPasswordField: false, hasCardField: false, screenshot: null, reachable: false };
    }
    const screenshot = await page.screenshot({ type: "jpeg", quality: 60, timeout: 5_000 }).catch(() => null);
    return {
      reachable: true,
      url: url.toString(),
      finalUrl: page.url(),
      chain: [...new Set(chain)],
      title: (await page.title().catch(() => "")).slice(0, 200),
      hasPasswordField: fields.password,
      hasCardField: fields.card,
      screenshot: screenshot ? screenshot.toString("base64") : null,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

let running = 0;
const waiting: Array<() => void> = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function authorized(header: string | string[] | undefined): boolean {
  const given = Buffer.from(String(header ?? ""));
  const expected = Buffer.from(SECRET);
  return SECRET.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
  if (req.method !== "POST" || req.url !== "/scan") return send(404, { error: "not_found" });
  if (!authorized(req.headers["x-scanner-secret"])) return send(401, { error: "unauthorized" });

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) return send(413, { error: "too_large" });
  }
  const url = checkUrl((JSON.parse(raw || "{}") as { url?: string }).url ?? "");
  if (!url || !(await isPublicHost(url.hostname, { resolve: !PROXY }))) return send(400, { error: "forbidden_url" });
  try {
    const result = await limited(() => Promise.race([scan(url), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 22_000))]));
    send(200, result);
  } catch (err) {
    send(502, { error: "scan_failed", message: (err as Error).message });
  }
});

server.listen(PORT, () => console.log(JSON.stringify({ msg: "scanner.started", port: PORT })));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, async () => (await browser?.close(), process.exit(0)));
