import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '00003_multi_tenant_setup.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  console.log('Aplicando migración 00003_multi_tenant_setup.sql...');

  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' });
    if (error) {
      // Try direct query via REST API
      console.log(`Ejecutando: ${stmt.substring(0, 80)}...`);
      const { error: directError } = await supabase.from('_exec_sql').select('*').csv();
      // Fallback: use raw query
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ sql: stmt + ';' }),
      });
      if (!response.ok) {
        const text = await response.text();
        console.error(`Error ejecutando: ${stmt.substring(0, 80)}...`);
        console.error(text);
      } else {
        console.log(`✓ ${stmt.substring(0, 60)}...`);
      }
    } else {
      console.log(`✓ ${stmt.substring(0, 60)}...`);
    }
  }

  console.log('Migración completada.');
}

applyMigration().catch(console.error);
