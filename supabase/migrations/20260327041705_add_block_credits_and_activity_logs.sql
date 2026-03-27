/*
  # Add Block Habit Credits and Activity Logs

  ## Summary
  This migration adds support for cross-crediting habits when a block is completed,
  and logs all completion events for analytics purposes.

  ## New Tables

  ### block_habit_credits
  Stores secondary habit credits for a given block. When a block is completed,
  all habits listed here (plus the primary habit_id on the block) receive a
  done_count increment.
  - `id` (uuid, PK)
  - `block_id` (uuid, FK → blocks.id cascade delete)
  - `habit_id` (uuid, FK → habits.id cascade delete)
  - `user_id` (uuid, FK → auth.users)
  - `created_at` (timestamptz)

  ### block_activity_logs
  Append-only log. One row is written per credited habit each time a block is
  marked complete. Rows are deleted when a block is un-checked.
  - `id` (uuid, PK)
  - `block_id` (uuid, FK → blocks.id cascade delete)
  - `habit_id` (uuid, FK → habits.id cascade delete)
  - `user_id` (uuid, FK → auth.users)
  - `week_start_date` (date)
  - `day_index` (int, 0=Mon..6=Sun)
  - `time_index` (int, slot index)
  - `completed_at` (timestamptz)
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - Users can only read/write their own rows
*/

CREATE TABLE IF NOT EXISTS block_habit_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (block_id, habit_id)
);

ALTER TABLE block_habit_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own block habit credits"
  ON block_habit_credits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own block habit credits"
  ON block_habit_credits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own block habit credits"
  ON block_habit_credits FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS block_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date date,
  day_index integer,
  time_index integer,
  completed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE block_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own activity logs"
  ON block_activity_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity logs"
  ON block_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own activity logs"
  ON block_activity_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_block_habit_credits_block_id ON block_habit_credits (block_id);
CREATE INDEX IF NOT EXISTS idx_block_habit_credits_habit_id ON block_habit_credits (habit_id);
CREATE INDEX IF NOT EXISTS idx_block_habit_credits_user_id ON block_habit_credits (user_id);
CREATE INDEX IF NOT EXISTS idx_block_activity_logs_habit_id ON block_activity_logs (habit_id);
CREATE INDEX IF NOT EXISTS idx_block_activity_logs_user_id ON block_activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_block_activity_logs_week_start_date ON block_activity_logs (week_start_date);
