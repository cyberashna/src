/*
  # Update daily_priorities foreign key to CASCADE on block delete

  1. Changes
    - Drop existing foreign key constraint on `daily_priorities.block_id`
    - Re-create with ON DELETE CASCADE so deleting a block automatically removes its priority entries

  2. Important Notes
    - This prevents foreign key violations when blocks are deleted while still referenced by priorities
    - No data is lost -- only the priority-to-block link is removed when the block itself is deleted
*/

ALTER TABLE daily_priorities
  DROP CONSTRAINT IF EXISTS daily_priorities_block_id_fkey;

ALTER TABLE daily_priorities
  ADD CONSTRAINT daily_priorities_block_id_fkey
  FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE;