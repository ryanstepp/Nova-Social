import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(root, "client", "dist");
const publicDir = path.join(root, "server", "public");

await fs.rm(publicDir, { recursive: true, force: true });
await fs.mkdir(publicDir, { recursive: true });
await fs.cp(distDir, publicDir, { recursive: true });

console.log("Prepared server/public from client/dist.");
