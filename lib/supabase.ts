
import { createClient } from '@supabase/supabase-js';

// Prioritize environment variables if provided by the user in the build environment
const supabaseUrl = (typeof process !== 'undefined' && process.env?.SUPABASE_URL) 
  || 'https://lplpftldiiirzvwuwisp.supabase.co';

const supabaseAnonKey = (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) 
  || 'sb_publishable_BC7jXKrcE7gkYis2MZCXmQ_lRSHEBb9';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration is missing URL or Anon Key.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
