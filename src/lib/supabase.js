import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://nzplvlkuwezxwkgmrixe.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_IkvhCU6bhdVd6kUFSZKpXQ_QWpgtC6e';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

export function errMsg(e) {
  if (!e) return 'Something went wrong';
  return e.message || e.error_description || String(e);
}
