/*
  # Habit Planner Database Schema

  1. New Tables
    - `themes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `habits`
      - `id` (uuid, primary key)
      - `theme_id` (uuid, references themes)
      - `user_id` (uuid, references auth.users)
      - `name` (text)
      - `target_per_week` (integer)
      - `done_count` (integer, default 0)
      - `last_done_at` (timestamptz, nullable)
      - `frequency` (text, enum: weekly/monthly/none)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `blocks`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `label` (text)
      - `is_habit_block` (boolean, default false)
      - `habit_id` (uuid, nullable, references habits)
      - `location_type` (text, enum: unscheduled/slot)
      - `day_index` (integer, nullable)
      - `time_index` (integer, nullable)
      - `completed` (boolean, default false)
      - `hashtag` (text, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Users can only access their own themes, habits, and blocks
*/

CREATE TABLE IF NOT EXISTS themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid REFERENCES themes(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  target_per_week integer DEFAULT 0,
  done_count integer DEFAULT 0,
  last_done_at timestamptz,
  frequency text DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'monthly', 'none')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  label text NOT NULL,
  is_habit_block boolean DEFAULT false,
  habit_id uuid REFERENCES habits(id) ON DELETE SET NULL,
  location_type text DEFAULT 'unscheduled' CHECK (location_type IN ('unscheduled', 'slot')),
  day_index integer,
  time_index integer,
  completed boolean DEFAULT false,
  hashtag text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own themes"
  ON themes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own themes"
  ON themes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own themes"
  ON themes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own themes"
  ON themes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own habits"
  ON habits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own habits"
  ON habits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own habits"
  ON habits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own habits"
  ON habits FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own blocks"
  ON blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own blocks"
  ON blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own blocks"
  ON blocks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own blocks"
  ON blocks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_themes_user_id ON themes(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_theme_id ON habits(theme_id);
CREATE INDEX IF NOT EXISTS idx_blocks_user_id ON blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_habit_id ON blocks(habit_id);
