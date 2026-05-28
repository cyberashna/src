/*
  # Add block notes and block tasks

  1. New Tables
    - `block_notes`
      - `id` (uuid, primary key)
      - `block_id` (uuid, FK to blocks, unique per user)
      - `user_id` (uuid, FK to auth.users)
      - `content` (text) - free-text notes for the block
      - `created_at`, `updated_at`
    - `block_tasks`
      - `id` (uuid, primary key)
      - `block_id` (uuid, FK to blocks)
      - `user_id` (uuid, FK to auth.users)
      - `label` (text) - task description
      - `completed` (boolean, default false)
      - `sort_order` (integer, default 0) - for ordering tasks within a block
      - `created_at`, `updated_at`

  2. Security
    - RLS enabled on both tables
    - Users can only read/write their own block notes and tasks

  3. Notes
    - block_notes has a unique constraint on (block_id, user_id) to support upsert
    - block_tasks can have multiple rows per block (one per task item)
    - When a block note is written for a habit block, the content will also be surfaced
      in the habit notes view via a JOIN query in the application layer
*/

CREATE TABLE IF NOT EXISTS block_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(block_id, user_id)
);

ALTER TABLE block_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own block notes"
  ON block_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own block notes"
  ON block_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own block notes"
  ON block_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own block notes"
  ON block_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS block_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  completed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE block_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own block tasks"
  ON block_tasks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own block tasks"
  ON block_tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own block tasks"
  ON block_tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own block tasks"
  ON block_tasks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS block_notes_block_id_idx ON block_notes(block_id);
CREATE INDEX IF NOT EXISTS block_tasks_block_id_idx ON block_tasks(block_id);
CREATE INDEX IF NOT EXISTS block_tasks_block_sort_idx ON block_tasks(block_id, sort_order);
