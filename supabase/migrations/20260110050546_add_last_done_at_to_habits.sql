/*
  # Add last_done_at timestamp to habits

  1. Changes
    - Add `last_done_at` column to `habits` table
      - Stores timestamp of when the habit was last marked as done
      - Nullable (NULL means habit has never been done or timestamp was cleared)
      - Type: timestamptz (timestamp with timezone)
  
  2. Purpose
    - Track when each habit was last completed
    - Allow users to see how long it's been since they last did a habit
    - Support clearing the timestamp to start tracking fresh
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'habits' AND column_name = 'last_done_at'
  ) THEN
    ALTER TABLE habits ADD COLUMN last_done_at timestamptz;
  END IF;
END $$;