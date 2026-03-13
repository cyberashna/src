/*
  # Add Daily Essentials and Mood Tracking

  1. New Tables
    - `daily_essentials`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text) - e.g., "Medication", "Water", "Meals"
      - `icon` (text) - emoji icon for the essential
      - `sort_order` (integer) - ordering
      - `created_at` (timestamptz)
    - `daily_essential_completions`
      - `id` (uuid, primary key)
      - `essential_id` (uuid, references daily_essentials)
      - `user_id` (uuid, references auth.users)
      - `date` (date) - the day this was checked off
      - `completed` (boolean, default false)
      - `created_at` (timestamptz)
      - Unique constraint on (essential_id, user_id, date)
    - `daily_moods`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `date` (date) - the day this mood applies to
      - `mood` (text) - the emoji representing the mood
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (user_id, date)

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to manage their own data
*/

CREATE TABLE IF NOT EXISTS daily_essentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  icon text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_essentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own essentials"
  ON daily_essentials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own essentials"
  ON daily_essentials FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own essentials"
  ON daily_essentials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own essentials"
  ON daily_essentials FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS daily_essential_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  essential_id uuid REFERENCES daily_essentials(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(essential_id, user_id, date)
);

ALTER TABLE daily_essential_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own essential completions"
  ON daily_essential_completions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own essential completions"
  ON daily_essential_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own essential completions"
  ON daily_essential_completions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own essential completions"
  ON daily_essential_completions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS daily_moods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  mood text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE daily_moods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own moods"
  ON daily_moods FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own moods"
  ON daily_moods FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own moods"
  ON daily_moods FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own moods"
  ON daily_moods FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);