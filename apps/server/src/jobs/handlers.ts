import { pool } from "../db/pool.ts";
import { log } from "../lib/log.ts";
import { fetchGraphMessage, renewGraphSubscriptions, subscribeMailbox, syncGraphRecent } from "../mail/graph.ts";
import { renewGmailWatches, syncGmail, watchGmail } from "../mail/gmail.ts";
import { superviseImap } from "../mail/imap.ts";
import { registerJob } from "./queue.ts";

export function registerHandlers() {
  registerJob("graph.message", (p: { mailboxId: string; messageId: string }) => fetchGraphMessage(p.mailboxId, p.messageId));
  registerJob("graph.subscribe", (p: { mailboxId: string }) => subscribeMailbox(p.mailboxId));
  registerJob("graph.sync", (p: { mailboxId: string }) => syncGraphRecent(p.mailboxId));
  registerJob("graph.renew", () => renewGraphSubscriptions());
  registerJob("gmail.watch", (p: { mailboxId: string }) => watchGmail(p.mailboxId));
  registerJob("gmail.sync", (p: { mailboxId: string }) => syncGmail(p.mailboxId));
}

/** Tâches périodiques légères (pas de cron externe à opérer). */
export function startSchedulers(): () => void {
  const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
    const run = () => fn().catch((err) => log.warn("scheduler.failed", { name, error: (err as Error).message }));
    void run();
    return setInterval(run, ms);
  };
  const timers = [
    every(60_000, "imap.supervise", superviseImap),
    every(30 * 60_000, "graph.renew", renewGraphSubscriptions),
    every(6 * 3600_000, "gmail.renew", renewGmailWatches),
    every(6 * 3600_000, "retention", retention),
  ];
  return () => timers.forEach(clearInterval);
}

/** Durées de conservation (minimisation RGPD). */
async function retention() {
  await pool.query("delete from alerts where verdict = 'safe' and received_at < now() - interval '30 days'");
  await pool.query("delete from alerts where received_at < now() - interval '13 months'");
  await pool.query("delete from sessions where expires_at < now()");
  await pool.query("delete from otp_codes where expires_at < now() - interval '1 day'");
  await pool.query("delete from oauth_states where created_at < now() - interval '1 hour'");
  await pool.query("delete from jobs where attempts >= 6 and created_at < now() - interval '7 days'");
}
