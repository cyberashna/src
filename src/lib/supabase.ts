import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseConfigError = 'Missing Supabase environment variables';

const missingSupabaseClient = new Proxy(
  {},
  {
    get() {
      throw new Error(supabaseConfigError);
    },
  }
) as SupabaseClient;

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : missingSupabaseClient;

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
