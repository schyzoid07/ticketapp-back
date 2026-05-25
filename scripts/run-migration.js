import 'dotenv/config';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '00003_multi_tenant_setup.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  // Use pg-meta endpoint (Supabase's internal SQL API)
  const url = `${supabaseUrl}/pg/sql`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error('Error:', text);
    process.exit(1);
  }
  console.log('Migración aplicada exitosamente');
}

run().catch(console.error);
