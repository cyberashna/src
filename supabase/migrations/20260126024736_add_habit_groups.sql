/*
  # Add habit groups feature

  1. New Tables
    - `habit_groups`
      - `id` (uuid, primary key)
      - `theme_id` (uuid, references themes)
      - `user_id` (uuid, references auth.users)
      - `name` (text) - Group name (e.g., "Strength Training")
      - `group_type` (text) - Type identifier ('strength_training', 'custom')
      - `link_behavior` (text) - How blocks link ('adjacent_merge', 'none')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Changes to existing tables
    - Add `habit_group_id` to `habits` table (nullable, references habit_groups)
    - Add `linked_block_id` to `blocks` table (nullable, references blocks) - for linking blocks together
    - Add `is_linked_group` to `blocks` table (boolean) - marks if this is a linked group block
  
  3. Security
    - Enable RLS on habit_groups table
    - Add policies for authenticated users to manage their own groups
  
  4. Notes
    - Preset groups like "Strength Training" can be created with group_type = 'strength_training'
    - Custom groups created by users have group_type = 'custom'
    - Adjacent blocks from the same group can be linked via linked_block_id
*/

-- Create habit_groups table
CREATE TABLE IF NOT EXISTS habit_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid REFERENCES themes(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  group_type text DEFAULT 'custom' CHECK (group_type IN ('strength_training', 'custom')),
  link_behavior text DEFAULT 'none' CHECK (link_behavior IN ('adjacent_merge', 'none')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add habit_group_id to habits table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'habits' AND column_name = 'habit_group_id'
  ) THEN
    ALTER TABLE habits ADD COLUMN habit_group_id uuid REFERENCES habit_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add linked_block_id to blocks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'linked_block_id'
  ) THEN
    ALTER TABLE blocks ADD COLUMN linked_block_id uuid REFERENCES blocks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add is_linked_group to blocks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'is_linked_group'
  ) THEN
    ALTER TABLE blocks ADD COLUMN is_linked_group boolean DEFAULT false;
  END IF;
END $$;

-- Enable RLS on habit_groups
ALTER TABLE habit_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies for habit_groups
CREATE POLICY "Users can view own habit groups"
  ON habit_groups FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own habit groups"
  ON habit_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own habit groups"
  ON habit_groups FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own habit groups"
  ON habit_groups FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_habit_groups_theme_id ON habit_groups(theme_id);
CREATE INDEX IF NOT EXISTS idx_habit_groups_user_id ON habit_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_group_id ON habits(habit_group_id);
CREATE INDEX IF NOT EXISTS idx_blocks_linked_block_id ON blocks(linked_block_id);