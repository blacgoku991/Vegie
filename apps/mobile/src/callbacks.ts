import { normalizePhone, type UserBank } from "@vigie/shared";
import { secure } from "./storage";

interface CallbackEntry { id: string; name: string; number: string }
/** `missing` : banques liées sans numéro officiel exploitable (on le dit, sans inventer de numéro). */
export interface CallbackDirectory { checkedAt: string; entries: CallbackEntry[]; missing?: { id: string; name: string }[] }

const key = (userId: string) => `smartsecure.callbacks.${userId}`;
export function callbackDirectory(banks: UserBank[]): CallbackDirectory {
  const entries = banks.flatMap(({ bank }) => {
    const number = bank.officialPhone && normalizePhone(bank.officialPhone);
    return number ? [{ id: bank.id, name: bank.name, number }] : [];
  });
  const missing = banks.filter(({ bank }) => !entries.some((e) => e.id === bank.id)).map(({ bank }) => ({ id: bank.id, name: bank.name }));
  return { checkedAt: new Date().toISOString(), entries, missing };
}

export async function cachedCallbacks(userId: string) {
  const json = await secure.get(key(userId));
  if (!json) return null;
  try {
    const dir = JSON.parse(json) as CallbackDirectory;
    if (!Number.isFinite(Date.parse(dir.checkedAt)) || !Array.isArray(dir.entries)) return null;
    return {
      ...dir,
      entries: dir.entries.filter(e => typeof e.name === "string" && typeof e.number === "string" && normalizePhone(e.number) === e.number),
      missing: Array.isArray(dir.missing) ? dir.missing.filter(m => typeof m.name === "string" && typeof m.id === "string") : [],
    };
  } catch { return null; }
}

export const saveCallbacks = (id: string, dir: CallbackDirectory | null) =>
  secure.set(key(id), dir ? JSON.stringify(dir) : null);
