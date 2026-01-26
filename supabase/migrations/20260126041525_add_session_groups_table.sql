/*
  # Add Session Groups for Automatic Workout Grouping

  ## Overview
  This migration adds support for automatic session grouping, allowing strength training
  blocks to be visually and logically grouped together with auto-generated names,
  connecting visual elements, and color-coded organization.

  ## New Tables
    - `session_groups`
      - `id` (uuid, primary key) - Unique identifier for each session group
      - `user_id` (uuid, not null) - References auth.users, owner of the session
      - `week_start_date` (date, not null) - Start date of the week this session belongs to
      - `session_number` (integer, not null) - Sequential number within the week (1, 2, 3, etc.)
      - `custom_name` (text, nullable) - Optional custom name (overrides auto-generated "Session N")
      - `accent_color` (text, not null) - Color code for visual styling (e.g., 'blue', 'teal', 'green')
      - `created_at` (timestamptz) - Timestamp when session group was created

  ## Modified Tables
    - `blocks`
      - Added `session_group_id` (uuid, nullable) - References session_groups, links block to a session group

  ## Security
    - Enable RLS on `session_groups` table
    - Add policies for authenticated users to manage their own session groups
    - Foreign key constraints ensure data integrity

  ## Important Notes
    1. Session numbers are sequential within each week_start_date for a user
    2. When custom_name is null, UI displays "Session {session_number}"
    3. Accent colors rotate through a predefined palette
    4. Deleting a session group will set session_group_id to null on associated blocks (cascade)
*/

-- Create session_groups table
CREATE TABLE IF NOT EXISTS session_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  session_number integer NOT NULL,
  custom_name text,
  accent_color text NOT NULL DEFAULT 'blue',
  created_at timestamptz DEFAULT now()
);

-- Add session_group_id to blocks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'session_group_id'
  ) THEN
    ALTER TABLE blocks ADD COLUMN session_group_id uuid REFERENCES session_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_groups_user_week ON session_groups(user_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_blocks_session_group ON blocks(session_group_id);

-- Enable RLS on session_groups
ALTER TABLE session_groups ENABLE ROW LEVEL SECURITY;

-- Policies for session_groups
CREATE POLICY "Users can view own session groups"
  ON session_groups FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own session groups"
  ON session_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own session groups"
  ON session_groups FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own session groups"
  ON session_groups FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);