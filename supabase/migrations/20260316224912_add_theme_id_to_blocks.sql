/*
  # Add theme_id to blocks table

  ## Summary
  Adds a nullable `theme_id` foreign key column to the `blocks` table, allowing
  unscheduled blocks to be assigned to a specific theme. Blocks with a theme_id
  are "themed unscheduled" blocks - they appear inside a theme card rather than
  the general unscheduled panel, but remain draggable to calendar slots.

  ## Changes
  - `blocks` table: new nullable `theme_id` column (uuid, FK → themes.id, ON DELETE SET NULL)

  ## Notes
  1. Column is nullable - null means truly unassigned (original behaviour)
  2. ON DELETE SET NULL ensures blocks are not lost if a theme is deleted
  3. No RLS changes needed - existing policies on blocks already cover this column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'theme_id'
  ) THEN
    ALTER TABLE blocks ADD COLUMN theme_id uuid REFERENCES themes(id) ON DELETE SET NULL;
  END IF;
END $$;
