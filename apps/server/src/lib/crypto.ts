import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config, isProd } from "../config.ts";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const otpCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return ["scrypt", salt.toString("base64"), derived.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

function key(): Buffer {
  if (config.ENCRYPTION_KEY) {
    const k = Buffer.from(config.ENCRYPTION_KEY, "base64");
    if (k.length !== 32) throw new Error("ENCRYPTION_KEY doit faire 32 octets (base64)");
    return k;
  }
  if (isProd) throw new Error("ENCRYPTION_KEY manquante");
  // Clé de développement uniquement : refusée en production (voir config.ts).
  return createHash("sha256").update("vigie-dev-only-key").digest();
}

/** Chiffre un secret (mot de passe IMAP, jeton OAuth) en AES-256-GCM. Format : v1.iv.tag.data (base64url). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(enc: string): string {
  const [v, iv, tag, data] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Format de secret inconnu");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export const encryptJson = (value: unknown) => encryptSecret(JSON.stringify(value));
export const decryptJson = <T>(enc: string): T => JSON.parse(decryptSecret(enc)) as T;

/** Comparaison à temps constant de deux chaînes (secrets de webhooks). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
