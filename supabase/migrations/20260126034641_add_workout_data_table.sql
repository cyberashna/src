/*
  # Add workout data tracking for strength training

  1. New Tables
    - `workout_data`
      - `id` (uuid, primary key)
      - `block_id` (uuid, references blocks) - Links to the specific block
      - `sets` (integer, nullable) - Number of sets performed
      - `reps` (integer, nullable) - Number of reps per set
      - `weight` (numeric, nullable) - Weight amount
      - `unit` (text, nullable) - Weight unit ('lbs' or 'kg')
      - `user_id` (uuid, references auth.users) - For RLS
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on workout_data table
    - Add policies for authenticated users to manage their own workout data

  3. Notes
    - All workout fields (sets, reps, weight, unit) are optional
    - Each block can have at most one workout_data record
    - Workout data is automatically cleaned up when blocks are deleted
*/

-- Create workout_data table
CREATE TABLE IF NOT EXISTS workout_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid REFERENCES blocks(id) ON DELETE CASCADE NOT NULL UNIQUE,
  sets integer,
  reps integer,
  weight numeric(10, 2),
  unit text DEFAULT 'lbs' CHECK (unit IN ('lbs', 'kg')),
  user_id uuid REFERENCES auth.users NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on workout_data
ALTER TABLE workout_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workout_data
CREATE POLICY "Users can view own workout data"
  ON workout_data FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workout data"
  ON workout_data FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workout data"
  ON workout_data FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workout data"
  ON workout_data FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workout_data_block_id ON workout_data(block_id);
CREATE INDEX IF NOT EXISTS idx_workout_data_user_id ON workout_data(user_id);
