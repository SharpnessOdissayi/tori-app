const { Client } = require("./node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("Missing DATABASE_URL"); process.exit(1); }

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  console.log("Connected");

  await client.query(`
    ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS green_api_instance_id TEXT,
      ADD COLUMN IF NOT EXISTS green_api_token TEXT,
      ADD COLUMN IF NOT EXISTS require_phone_verification BOOLEAN NOT NULL DEFAULT TRUE;
  `);
  console.log("Migration complete: green_api_instance_id, green_api_token, require_phone_verification added");

  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
