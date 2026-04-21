// Security check: walk every backup file, recompute its HMAC, compare to the
// stored value, and attempt GCM auth-tag verification by doing a dry-run
// decryption (without writing anything to disk). Fails loud on any mismatch.
//
// Run manually whenever you want peace of mind, or wire as a weekly task.
//   node scripts/backup/verify-backups.mjs

import {
  createReadStream, readdirSync, readFileSync, existsSync, statSync,
} from "node:fs";
import { join } from "node:path";
import { createDecipheriv, createHmac, scryptSync } from "node:crypto";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import { homedir } from "node:os";

const configPath = process.env.KAVATI_BACKUP_CONFIG
  || join(homedir(), ".kavati-backup", "config.json");
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const { encryptionPassword, backupDir } = cfg;

const results = { ok: 0, failed: 0, details: [] };

for (const tier of ["daily", "biweekly", "monthly"]) {
  const tierDir = join(backupDir, tier);
  if (!existsSync(tierDir)) continue;
  const files = readdirSync(tierDir).filter(f => f.endsWith(".enc"));
  for (const name of files) {
    const path = join(tierDir, name);
    try {
      await verifyOne(path, encryptionPassword);
      results.ok++;
      results.details.push({ name, status: "OK" });
    } catch (err) {
      results.failed++;
      results.details.push({ name, status: "FAIL", reason: err.message });
    }
  }
}

for (const d of results.details) {
  const mark = d.status === "OK" ? "✓" : "✗";
  console.log(`  ${mark}  ${d.name}  ${d.reason ?? ""}`);
}
console.log(`\nverified: ${results.ok} ok, ${results.failed} failed`);
process.exit(results.failed > 0 ? 1 : 0);

async function verifyOne(path, password) {
  // 1) HMAC check — file hasn't been tampered with or replaced
  const hmacFile = path + ".hmac";
  if (!existsSync(hmacFile)) throw new Error("missing .hmac sidecar");
  const expected = readFileSync(hmacFile, "utf8").trim().split(/\s+/)[0];

  const headerBuf = Buffer.alloc(33);
  const fd = await (await import("node:fs/promises")).open(path, "r");
  await fd.read(headerBuf, 0, 33, 0);
  await fd.close();
  if (headerBuf.slice(0, 4).toString() !== "KVBK") throw new Error("bad magic");
  if (headerBuf[4] !== 1) throw new Error(`unknown version ${headerBuf[4]}`);
  const salt = headerBuf.slice(5, 21);
  const iv   = headerBuf.slice(21, 33);

  const macKey = scryptSync(password, Buffer.concat([Buffer.from("mac:"), salt]), 32);
  const hmac = createHmac("sha256", macKey);
  await pipeline(createReadStream(path), hmac);
  const actual = hmac.digest("hex");
  if (actual !== expected) throw new Error("HMAC mismatch — file tampered or corrupted");

  // 2) Dry-run decrypt to confirm GCM auth tag + gzip are valid
  const encKey = scryptSync(password, Buffer.concat([Buffer.from("enc:"), salt]), 32);
  const totalSize = statSync(path).size;
  const tagStart = totalSize - 16;

  const tagBuf = Buffer.alloc(16);
  const fd2 = await (await import("node:fs/promises")).open(path, "r");
  await fd2.read(tagBuf, 0, 16, tagStart);
  await fd2.close();

  const decipher = createDecipheriv("aes-256-gcm", encKey, iv);
  decipher.setAuthTag(tagBuf);

  const body = createReadStream(path, { start: 33, end: tagStart - 1 });
  const sink = new Writable({ write(_c, _e, cb) { cb(); } });
  await pipeline(body, decipher, createGunzip(), sink);
}
