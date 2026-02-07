/*
  # Add Habit Notes and Workout History Tables

  1. New Tables
    - `habit_notes`
      - `id` (uuid, primary key)
      - `habit_id` (uuid, FK to habits, unique per user+habit)
      - `user_id` (uuid, FK to auth.users)
      - `content` (text, the note content)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `workout_history`
      - `id` (uuid, primary key)
      - `habit_id` (uuid, FK to habits)
      - `user_id` (uuid, FK to auth.users)
      - `block_id` (uuid, FK to blocks, nullable)
      - `sets` (integer)
      - `reps` (integer)
      - `weight` (numeric)
      - `unit` (text, lbs or kg)
      - `completed_date` (date)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add select/insert/update/delete policies for authenticated users on their own data

  3. Indexes
    - Index on habit_id and user_id for both tables
*/

-- habit_notes table
CREATE TABLE IF NOT EXISTS habit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id uuid REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  content text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(habit_id, user_id)
);

ALTER TABLE habit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own habit notes"
  ON habit_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own habit notes"
  ON habit_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own habit notes"
  ON habit_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own habit notes"
  ON habit_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_habit_notes_habit_id ON habit_notes(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_notes_user_id ON habit_notes(user_id);

-- workout_history table
CREATE TABLE IF NOT EXISTS workout_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id uuid REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  block_id uuid REFERENCES blocks(id) ON DELETE SET NULL,
  sets integer,
  reps integer,
  weight numeric(10, 2),
  unit text DEFAULT 'lbs' CHECK (unit IN ('lbs', 'kg')),
  completed_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE workout_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own workout history"
  ON workout_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout history"
  ON workout_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout history"
  ON workout_history FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout history"
  ON workout_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_workout_history_habit_id ON workout_history(habit_id);
CREATE INDEX IF NOT EXISTS idx_workout_history_user_id ON workout_history(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_history_completed_date ON workout_history(completed_date);
