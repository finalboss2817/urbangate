
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const supabaseUrl = 'https://lplpftldiiirzvwuwisp.supabase.co';
const supabaseAnonKey = 'sb_publishable_BC7jXKrcE7gkYis2MZCXmQ_lRSHEBb9';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
