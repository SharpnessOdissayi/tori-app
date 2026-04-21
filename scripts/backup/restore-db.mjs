// Decrypt a backup and pipe the SQL dump to stdout (pipeable into psql)
// or a file. HMAC + GCM tag are both verified before any output is
// produced, so a corrupted/tampered file never gets partially restored.
//
// Examples:
//   # Inspect the SQL:
//   node scripts/backup/restore-db.mjs path\to\kavati-daily-...enc > dump.sql
//
//   # Restore straight into a staging DB:
//   node scripts/backup/restore-db.mjs path\to\backup.enc | psql $STAGING_URL

import {
  createReadStream, readFileSync, existsSync, statSync,
} from "node:fs";
import { join } from "node:path";
import { createDecipheriv, createHmac, scryptSync } from "node:crypto";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { homedir } from "node:os";

const backupPath = process.argv[2];
if (!backupPath || !existsSync(backupPath)) {
  console.error("usage: node restore-db.mjs <path-to-backup.enc>");
  process.exit(2);
}

const configPath = process.env.KAVATI_BACKUP_CONFIG
  || join(homedir(), ".kavati-backup", "config.json");
const { encryptionPassword } = JSON.parse(readFileSync(configPath, "utf8"));

const hmacFile = backupPath + ".hmac";
if (!existsSync(hmacFile)) {
  console.error("[restore] refusing to restore: missing .hmac sidecar");
  process.exit(3);
}
const expectedHmac = readFileSync(hmacFile, "utf8").trim().split(/\s+/)[0];

// Read header (33 bytes: magic4 + ver1 + salt16 + iv12)
const fsp = await import("node:fs/promises");
const fd = await fsp.open(backupPath, "r");
const header = Buffer.alloc(33);
await fd.read(header, 0, 33, 0);
const totalSize = statSync(backupPath).size;
const tag = Buffer.alloc(16);
await fd.read(tag, 0, 16, totalSize - 16);
await fd.close();

if (header.slice(0, 4).toString() !== "KVBK") {
  console.error("[restore] bad magic — not a Kavati backup");
  process.exit(3);
}
const version = header[4];
if (version !== 1) {
  console.error(`[restore] unknown version ${version}`);
  process.exit(3);
}
const salt = header.slice(5, 21);
const iv   = header.slice(21, 33);

// Verify HMAC BEFORE touching any ciphertext
const macKey = scryptSync(encryptionPassword, Buffer.concat([Buffer.from("mac:"), salt]), 32);
const hmac = createHmac("sha256", macKey);
await pipeline(createReadStream(backupPath), hmac);
if (hmac.digest("hex") !== expectedHmac) {
  console.error("[restore] HMAC MISMATCH — file tampered or password wrong. Refusing.");
  process.exit(3);
}

const encKey = scryptSync(encryptionPassword, Buffer.concat([Buffer.from("enc:"), salt]), 32);
const decipher = createDecipheriv("aes-256-gcm", encKey, iv);
decipher.setAuthTag(tag);

const body = createReadStream(backupPath, { start: 33, end: totalSize - 17 });
await pipeline(body, decipher, createGunzip(), process.stdout);
