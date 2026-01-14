/*
  # Add week_start_date to blocks table

  1. Changes
    - Add `week_start_date` column to `blocks` table
      - Stores the Monday date of the week this block belongs to
      - DATE type for efficient querying and filtering
      - Nullable to support unscheduled blocks (which don't belong to a specific week)
      - Indexed for fast week-based queries
  
  2. Notes
    - Unscheduled blocks (location_type = 'unscheduled') will have NULL week_start_date
    - Scheduled blocks (location_type = 'slot') will have a week_start_date set
    - This enables week-specific filtering and navigation
    - The date should always be a Monday (start of week)
*/

-- Add week_start_date column to blocks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'week_start_date'
  ) THEN
    ALTER TABLE blocks ADD COLUMN week_start_date DATE;
  END IF;
END $$;

-- Create index for efficient week-based queries
CREATE INDEX IF NOT EXISTS idx_blocks_week_start_date ON blocks(week_start_date) WHERE week_start_date IS NOT NULL;