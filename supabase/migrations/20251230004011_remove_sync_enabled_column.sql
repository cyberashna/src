/*
  # Remove sync_enabled column

  This migration removes the sync_enabled column from calendar_connections
  since we now only support one-way import (not two-way sync).
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_connections' AND column_name = 'sync_enabled'
  ) THEN
    ALTER TABLE calendar_connections DROP COLUMN sync_enabled;
  END IF;
END $$;