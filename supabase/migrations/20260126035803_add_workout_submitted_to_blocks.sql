/*
  # Add workout submission tracking to blocks

  1. Changes
    - Add `workout_submitted` column to `blocks` table
      - Boolean field to track if workout data has been submitted
      - Defaults to false
      - Used to hide/show workout input fields and display submitted data
  
  2. Purpose
    - Allows users to submit workout data and hide input fields
    - Shows submitted workout summary instead of input fields
    - Maintains a clean interface after workout is recorded
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'workout_submitted'
  ) THEN
    ALTER TABLE blocks ADD COLUMN workout_submitted boolean DEFAULT false;
  END IF;
END $$;
