import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas en .env');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
