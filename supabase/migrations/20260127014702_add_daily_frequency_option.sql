/*
  # Add 'daily' frequency option to habits

  1. Changes
    - Update the frequency constraint on habits table to include 'daily' as a valid option
    - The valid frequency values are now: 'daily', 'weekly', 'monthly', 'none'
  
  2. Notes
    - This allows users to set daily targets for their habits
    - Existing habits with 'weekly', 'monthly', or 'none' frequencies are not affected
*/

DO $$
BEGIN
  -- Drop the old constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'habits_frequency_check'
  ) THEN
    ALTER TABLE habits DROP CONSTRAINT habits_frequency_check;
  END IF;

  -- Add the new constraint with 'daily' included
  ALTER TABLE habits ADD CONSTRAINT habits_frequency_check 
    CHECK (frequency IN ('daily', 'weekly', 'monthly', 'none'));
END $$;