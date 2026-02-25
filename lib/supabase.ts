
import { createClient } from '@supabase/supabase-js';

// Prioritize environment variables for Vercel/Production deployment
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lplpftldiiirzvwuwisp.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_BC7jXKrcE7gkYis2MZCXmQ_lRSHEBb9';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration is missing URL or Anon Key.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
