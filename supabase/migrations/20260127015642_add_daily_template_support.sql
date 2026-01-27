/*
  # Add Daily Template Support for Blocks

  1. Changes
    - Add `is_daily_template` column to blocks table (boolean, default false)
      - When true, this block represents a daily habit template that should appear on all days
    - Add `daily_template_id` column to blocks table (uuid, nullable, references blocks)
      - Links individual day blocks to their parent daily template
    - When a block is marked as a daily template, it can be used to generate instances on all days
  
  2. Notes
    - Daily template blocks act as "master" blocks that define habits to appear across all 7 days
    - Individual day blocks can reference their template via daily_template_id
    - This allows users to place a habit once and have it appear on all days
    - Users can still override individual days by placing separate blocks
*/

DO $$
BEGIN
  -- Add is_daily_template column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'is_daily_template'
  ) THEN
    ALTER TABLE blocks ADD COLUMN is_daily_template boolean DEFAULT false;
  END IF;

  -- Add daily_template_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'daily_template_id'
  ) THEN
    ALTER TABLE blocks ADD COLUMN daily_template_id uuid REFERENCES blocks(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for daily template queries
CREATE INDEX IF NOT EXISTS idx_blocks_daily_template_id ON blocks(daily_template_id);
CREATE INDEX IF NOT EXISTS idx_blocks_is_daily_template ON blocks(is_daily_template);
