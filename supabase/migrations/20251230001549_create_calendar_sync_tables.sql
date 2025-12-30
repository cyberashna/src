/*
  # Calendar Sync Schema

  1. New Tables
    - `calendar_connections`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `google_refresh_token` (text, encrypted token for API access)
      - `selected_calendar_id` (text, Google Calendar ID)
      - `calendar_name` (text, display name of the calendar)
      - `sync_enabled` (boolean, whether auto-sync is on)
      - `last_synced_at` (timestamptz, timestamp of last sync)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `calendar_event_mappings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `block_id` (text, local block ID)
      - `google_event_id` (text, Google Calendar event ID)
      - `calendar_id` (text, which Google Calendar this event is in)
      - `last_synced_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can only access their own calendar connections and mappings
    - Policies for authenticated users to CRUD their own data
*/

CREATE TABLE IF NOT EXISTS calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_refresh_token text,
  selected_calendar_id text,
  calendar_name text,
  sync_enabled boolean DEFAULT false,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS calendar_event_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id text NOT NULL,
  google_event_id text NOT NULL,
  calendar_id text NOT NULL,
  last_synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, block_id)
);

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar connections"
  ON calendar_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar connections"
  ON calendar_connections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar connections"
  ON calendar_connections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar connections"
  ON calendar_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own calendar event mappings"
  ON calendar_event_mappings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar event mappings"
  ON calendar_event_mappings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar event mappings"
  ON calendar_event_mappings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar event mappings"
  ON calendar_event_mappings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_connections_user_id ON calendar_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_user_id ON calendar_event_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_mappings_block_id ON calendar_event_mappings(block_id);