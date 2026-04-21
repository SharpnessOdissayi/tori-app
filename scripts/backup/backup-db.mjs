// Local encrypted backup of the Kavati Postgres DB.
//
// Usage (via Windows Task Scheduler):
//   node scripts/backup/backup-db.mjs daily
//   node scripts/backup/backup-db.mjs biweekly
//   node scripts/backup/backup-db.mjs monthly
//
// Pipeline: pg_dump → gzip → AES-256-GCM → local file + HMAC sidecar.
// Retention per tier (oldest files pruned on each run):
//   daily    → 3   (three most recent, run 3x/day ⇒ ~1 day window)
//   biweekly → 4   (last 8 weeks of fortnightly snapshots)
//   monthly  → 12  (rolling year)
//
// Config lives OUTSIDE the repo at %USERPROFILE%\.kavati-backup\config.json
// (or override with env KAVATI_BACKUP_CONFIG) and holds DATABASE_URL
// + encryption password — never committed.

import { spawn } from "node:child_process";
import {
  createWriteStream, createReadStream, mkdirSync, readdirSync, statSync,
  unlinkSync, existsSync, readFileSync, writeFileSync, appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { createGzip } from "node:zlib";
import { createCipheriv, createHmac, randomBytes, scryptSync } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { PassThrough } from "node:stream";
import { homedir } from "node:os";

const TIER = process.argv[2];
const RETENTION = { daily: 3, biweekly: 4, monthly: 12 };
if (!TIER || !(TIER in RETENTION)) {
  console.error("usage: node backup-db.mjs <daily|biweekly|monthly>");
  process.exit(2);
}

const configPath = process.env.KAVATI_BACKUP_CONFIG
  || join(homedir(), ".kavati-backup", "config.json");
if (!existsSync(configPath)) {
  console.error(`[backup] config not found: ${configPath}`);
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const { databaseUrl, encryptionPassword, backupDir, pgDumpPath = "pg_dump" } = cfg;
for (const k of ["databaseUrl", "encryptionPassword", "backupDir"]) {
  if (!cfg[k]) { console.error(`[backup] config missing ${k}`); process.exit(2); }
}

const tierDir = join(backupDir, TIER);
mkdirSync(tierDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const filename = `kavati-${TIER}-${stamp}.sql.gz.enc`;
const outPath = join(tierDir, filename);

// Key derivation: one password → two independent keys (encrypt + MAC).
const salt = randomBytes(16);
const iv = randomBytes(12);
const encKey = scryptSync(encryptionPassword, Buffer.concat([Buffer.from("enc:"), salt]), 32);
const macKey = scryptSync(encryptionPassword, Buffer.concat([Buffer.from("mac:"), salt]), 32);

const fileOut = createWriteStream(outPath);
// File header: magic(4) + version(1) + salt(16) + iv(12)  → 33 bytes
fileOut.write(Buffer.concat([Buffer.from("KVBK"), Buffer.from([1]), salt, iv]));

const cipher = createCipheriv("aes-256-gcm", encKey, iv);
const pass = new PassThrough();
pass.pipe(fileOut, { end: false });

const dump = spawn(pgDumpPath, ["--no-owner", "--no-privileges", databaseUrl], {
  stdio: ["ignore", "pipe", "pipe"],
});
let dumpErr = "";
dump.stderr.on("data", d => { dumpErr += d.toString(); });

const log = (msg) => {
  const line = `${new Date().toISOString()}  ${TIER}  ${msg}\n`;
  process.stdout.write(`[backup] ${msg}\n`);
  appendFileSync(join(backupDir, "backup.log"), line);
};

try {
  await pipeline(dump.stdout, createGzip({ level: 9 }), cipher, pass);
  // Append GCM auth tag (16 bytes) at end — verifies ciphertext integrity
  // for anyone who has the password, without needing a separate file.
  fileOut.write(cipher.getAuthTag());
  await new Promise((res, rej) => fileOut.end(err => err ? rej(err) : res()));
  if (dump.exitCode !== 0) {
    throw new Error(`pg_dump exited ${dump.exitCode}: ${dumpErr.trim().slice(0, 200)}`);
  }
} catch (err) {
  log(`FAIL  ${err.message}`);
  if (existsSync(outPath)) unlinkSync(outPath);
  process.exit(1);
}

// HMAC-SHA256 over the whole encrypted file — detects any tampering
// (including swapping it with a rogue backup) when restoring.
const hmac = createHmac("sha256", macKey);
await pipeline(createReadStream(outPath), hmac);
const tag = hmac.digest("hex");
writeFileSync(outPath + ".hmac", `${tag}  ${filename}\n`);

const sizeMB = (statSync(outPath).size / 1024 / 1024).toFixed(2);
log(`OK    ${filename}  ${sizeMB}MB  hmac=${tag.slice(0, 16)}…`);

// Rotate: keep N newest, prune the rest (and their .hmac sidecars).
const peers = readdirSync(tierDir)
  .filter(f => f.startsWith(`kavati-${TIER}-`) && f.endsWith(".enc"))
  .map(f => ({ name: f, mtime: statSync(join(tierDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
for (const old of peers.slice(RETENTION[TIER])) {
  unlinkSync(join(tierDir, old.name));
  const chk = join(tierDir, old.name + ".hmac");
  if (existsSync(chk)) unlinkSync(chk);
  log(`PRUNE ${old.name}`);
}
