import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { pool } from "./pool.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/** Migrations SQL versionnées, appliquées dans l'ordre et une seule fois. */
export async function migrate(): Promise<string[]> {
  await pool.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await pool.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      applied.push(file);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`Migration ${file} échouée : ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

// pathToFileURL : sous Windows, argv[1] vaut « C:\… » et `file://${argv[1]}` ne correspond jamais.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const applied = await migrate();
  console.log(applied.length ? `Migrations appliquées : ${applied.join(", ")}` : "Base à jour.");
  await pool.end();
}
