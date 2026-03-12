/*
  # Update blocks table for smart features

  1. Changes
    - Add `is_suggested` column to track ghost blocks
    - Add `pattern_id` column to link suggested blocks to their patterns
    - Add `is_standing` column to mark blocks that recur weekly
    - Add `standing_block_id` column to reference the standing block config

  2. Notes
    - Ghost blocks are temporary suggestions with is_suggested = true
    - When accepted, is_suggested becomes false
    - Standing blocks have is_standing = true and link to standing_blocks table
*/

-- Add new columns to blocks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'is_suggested'
  ) THEN
    ALTER TABLE blocks ADD COLUMN is_suggested boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'pattern_id'
  ) THEN
    ALTER TABLE blocks ADD COLUMN pattern_id uuid REFERENCES block_patterns(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'is_standing'
  ) THEN
    ALTER TABLE blocks ADD COLUMN is_standing boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blocks' AND column_name = 'standing_block_id'
  ) THEN
    ALTER TABLE blocks ADD COLUMN standing_block_id uuid REFERENCES standing_blocks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for efficient ghost block queries
CREATE INDEX IF NOT EXISTS idx_blocks_is_suggested ON blocks(user_id, is_suggested) WHERE is_suggested = true;
CREATE INDEX IF NOT EXISTS idx_blocks_pattern_id ON blocks(pattern_id) WHERE pattern_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blocks_standing ON blocks(user_id, is_standing) WHERE is_standing = true;
