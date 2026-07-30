/*
# Add planning_outliner_data table

## Summary
Migrates the Planning Outliner from localStorage to Supabase so data syncs
across devices and browsers.

## New Tables

### planning_outliner_data
Stores the full outliner node tree as a JSONB blob, one row per user.

- `id` (uuid, primary key)
- `user_id` (uuid, not null, defaults to auth.uid(), FK → auth.users ON DELETE CASCADE)
- `nodes` (jsonb, not null, default empty array) — the full nested OutlineNode[] tree
- `updated_at` (timestamptz) — last save timestamp

## Security
- RLS enabled.
- Four owner-scoped policies (SELECT / INSERT / UPDATE / DELETE) scoped to `authenticated`.
- `user_id` defaults to `auth.uid()` so client inserts that omit it still satisfy the INSERT policy.
*/

CREATE TABLE IF NOT EXISTS planning_outliner_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE planning_outliner_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_outliner" ON planning_outliner_data;
CREATE POLICY "select_own_outliner" ON planning_outliner_data FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_outliner" ON planning_outliner_data;
CREATE POLICY "insert_own_outliner" ON planning_outliner_data FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_outliner" ON planning_outliner_data;
CREATE POLICY "update_own_outliner" ON planning_outliner_data FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_outliner" ON planning_outliner_data;
CREATE POLICY "delete_own_outliner" ON planning_outliner_data FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
