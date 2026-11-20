// data.json, photos/ and icone.png live at the repo root (the Manager writes them there
// through the GitHub API). Copy them next to the built site.
import { cpSync, existsSync } from "node:fs";
for (const f of ["data.json", "photos", "icone.png"]) {
  if (existsSync(f)) cpSync(f, `dist/${f}`, { recursive: true });
}
console.log("static files copied to dist/");
