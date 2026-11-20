import { GB_URL } from "./config";

/** Guestbook lives in a Google Sheet behind Apps Script (GitHub cannot take guests' messages). */
export async function gbCall<T>(fn: string, ...args: unknown[]): Promise<T> {
  if (!GB_URL) throw new Error("Livre d'or non relié");
  const r = await fetch(GB_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ fn, args }) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Erreur");
  return j.data as T;
}
