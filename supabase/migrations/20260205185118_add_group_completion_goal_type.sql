/*
  # Add group completion goal type

  1. Changes to existing tables
    - `theme_goals`
      - Update `goal_type` check constraint to allow 'group_completion' in addition to 'total_completions' and 'unique_daily_habits'
      - Add `habit_group_id` (uuid, nullable) - references `habit_groups(id)` with ON DELETE CASCADE
        so deleting a group automatically removes any goals tied to it

  2. Notes
    - The new 'group_completion' goal type tracks unique habit completions within a specific habit group
    - `habit_group_id` is only required when `goal_type` is 'group_completion'; it is null for other goal types
    - ON DELETE CASCADE ensures data integrity when groups are removed
*/

-- Update the goal_type check constraint to include 'group_completion'
DO $$
BEGIN
  ALTER TABLE theme_goals DROP CONSTRAINT IF EXISTS theme_goals_goal_type_check;
  ALTER TABLE theme_goals ADD CONSTRAINT theme_goals_goal_type_check
    CHECK (goal_type IN ('total_completions', 'unique_daily_habits', 'group_completion'));
END $$;

-- Add habit_group_id column to theme_goals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'theme_goals' AND column_name = 'habit_group_id'
  ) THEN
    ALTER TABLE theme_goals ADD COLUMN habit_group_id uuid REFERENCES habit_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for performance on the new column
CREATE INDEX IF NOT EXISTS idx_theme_goals_habit_group_id ON theme_goals(habit_group_id);
