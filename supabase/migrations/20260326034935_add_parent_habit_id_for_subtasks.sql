/*
  # Add parent_habit_id to habits for subtask support

  ## Summary
  Adds a self-referencing foreign key to the habits table so that habits can
  have child habits (subtasks). This enables a three-level hierarchy:
    Theme → Group → Habit → Subtask (child habit)

  ## Changes
  - `habits` table: new nullable column `parent_habit_id` (uuid, FK to habits.id ON DELETE CASCADE)

  ## Notes
  - Top-level habits have `parent_habit_id = NULL`
  - Subtasks have `parent_habit_id` set to their parent habit's id
  - Deleting a parent habit cascades to delete all its subtasks
  - All existing habits remain unaffected (column defaults to NULL)
  - Subtasks can still be assigned to a group via habit_group_id (inherited from parent typically)
  - Subtasks support the same block creation / calendar scheduling as parent habits
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'habits' AND column_name = 'parent_habit_id'
  ) THEN
    ALTER TABLE habits ADD COLUMN parent_habit_id uuid REFERENCES habits(id) ON DELETE CASCADE;
  END IF;
END $$;
