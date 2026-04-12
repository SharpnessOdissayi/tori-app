const { Client } = require("./node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await client.connect();
  await client.query(`
    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  console.log("Migration complete: reminder_24h_sent, reminder_1h_sent added");
  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
