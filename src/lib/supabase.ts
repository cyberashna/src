import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type CalendarConnection = {
  id: string;
  user_id: string;
  google_refresh_token: string | null;
  selected_calendar_id: string | null;
  calendar_name: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEventMapping = {
  id: string;
  user_id: string;
  block_id: string;
  google_event_id: string;
  calendar_id: string;
  last_synced_at: string;
  created_at: string;
};
