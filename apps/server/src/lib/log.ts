/** Journal minimal en JSON (une ligne par événement). Jamais de contenu de mail ni de secret. */
type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, msg: string, extra?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export const log = {
  debug: (m: string, e?: Record<string, unknown>) => write("debug", m, e),
  info: (m: string, e?: Record<string, unknown>) => write("info", m, e),
  warn: (m: string, e?: Record<string, unknown>) => write("warn", m, e),
  error: (m: string, e?: Record<string, unknown>) => write("error", m, e),
};
