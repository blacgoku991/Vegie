import { one, pool } from "../db/pool.ts";
import { log } from "../lib/log.ts";

/**
 * File de tâches minimaliste sur Postgres (FOR UPDATE SKIP LOCKED) :
 * pas de Redis à opérer, transactions et sauvegardes communes avec le reste des données.
 */
export type JobHandler = (payload: any) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(kind: string, handler: JobHandler) {
  handlers.set(kind, handler);
}

export async function enqueue(kind: string, payload: unknown, opts: { delayMs?: number } = {}) {
  await pool.query("insert into jobs (kind, payload, run_at) values ($1, $2, now() + ($3 || ' milliseconds')::interval)", [
    kind,
    JSON.stringify(payload),
    String(opts.delayMs ?? 0),
  ]);
}

const MAX_ATTEMPTS = 6;

async function claim(): Promise<{ id: string; kind: string; payload: unknown; attempts: number } | null> {
  return one(
    `update jobs set locked_until = now() + interval '5 minutes', attempts = attempts + 1
     where id = (
       select id from jobs
       where run_at <= now() and (locked_until is null or locked_until < now()) and attempts < $1
       order by run_at limit 1 for update skip locked
     )
     returning id, kind, payload, attempts`,
    [MAX_ATTEMPTS],
  );
}

export async function runOnce(): Promise<boolean> {
  const job = await claim();
  if (!job) return false;
  const handler = handlers.get(job.kind);
  try {
    if (!handler) throw new Error(`Aucun gestionnaire pour ${job.kind}`);
    await handler(job.payload);
    await pool.query("delete from jobs where id = $1", [job.id]);
  } catch (err) {
    const message = (err as Error).message;
    // Retentatives avec attente exponentielle : 30 s, 1 min, 2 min, 4 min…
    const backoffSec = 30 * 2 ** (job.attempts - 1);
    await pool.query(
      "update jobs set locked_until = null, last_error = $2, run_at = now() + ($3 || ' seconds')::interval where id = $1",
      [job.id, message.slice(0, 500), String(backoffSec)],
    );
    log.warn("job.failed", { id: job.id, kind: job.kind, attempts: job.attempts, error: message });
  }
  return true;
}

/** Lance `concurrency` boucles de traitement. Renvoie une fonction d'arrêt. */
export function startWorkers(concurrency = 4): () => void {
  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      try {
        const worked = await runOnce();
        if (!worked) await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        log.error("worker.loop", { error: (err as Error).message });
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  };
  for (let i = 0; i < concurrency; i++) void loop();
  return () => {
    stopped = true;
  };
}
