import { BRANCH, REPO } from "./config";
import type { Db } from "./types";

/** GitHub contents API, with the Manager's key saved on the device. */
export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function b64enc(str: string) {
  const bytes = new TextEncoder().encode(str);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const b64dec = (b64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

export async function gh<T = unknown>(token: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new GitHubError(r.status === 401 ? "Clé GitHub refusée ou expirée" : j.message || "GitHub " + r.status, r.status);
  }
  return (r.status === 204 ? null : await r.json()) as T;
}

export async function canPush(token: string) {
  const repo = await gh<{ permissions?: { push?: boolean } }>(token, "");
  return !!repo.permissions?.push;
}

export async function loadDb(token: string): Promise<{ db: Db; sha: string }> {
  const j = await gh<{ content: string; sha: string }>(token, `/contents/data.json?ref=${BRANCH}&t=${Date.now()}`);
  return { db: JSON.parse(b64dec(j.content)), sha: j.sha };
}

export async function putDb(token: string, db: Db, sha: string, message: string) {
  const r = await gh<{ content: { sha: string } }>(token, "/contents/data.json", {
    method: "PUT",
    body: JSON.stringify({ message, branch: BRANCH, sha, content: b64enc(JSON.stringify(db, null, 2) + "\n") }),
  });
  return r.content.sha;
}

export async function putPhoto(token: string, path: string, base64: string, message: string) {
  await gh(token, "/contents/" + path, { method: "PUT", body: JSON.stringify({ message, branch: BRANCH, content: base64 }) });
}

export async function deleteFile(token: string, path: string, message: string) {
  const f = await gh<{ sha: string }>(token, `/contents/${path}?ref=${BRANCH}`);
  await gh(token, "/contents/" + path, { method: "DELETE", body: JSON.stringify({ message, sha: f.sha, branch: BRANCH }) });
}
