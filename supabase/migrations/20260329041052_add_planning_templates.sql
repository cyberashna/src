/*
  # Add Planning Templates System

  ## Summary
  Creates a sticky-note style checklist system where users can define reusable
  planning templates (Weekly, Daily, or Custom) with checklist items. Completions
  are stored per date period so they auto-reset when the week or day rolls over.

  ## New Tables

  ### planning_templates
  - id (uuid, primary key)
  - user_id (uuid, references auth.users)
  - name (text) - display name e.g. "Weekly" or "Daily"
  - icon (text) - emoji string e.g. "📅"
  - type (text) - 'weekly', 'daily', or 'custom'
  - sort_order (int) - ordering of tabs
  - is_default (bool) - true for seeded defaults, cannot be deleted by user
  - created_at (timestamptz)

  ### template_checklist_items
  - id (uuid, primary key)
  - template_id (uuid, references planning_templates, ON DELETE CASCADE)
  - user_id (uuid, references auth.users)
  - label (text) - the checklist item text
  - sort_order (int) - ordering within the template
  - created_at (timestamptz)

  ### template_completions
  - id (uuid, primary key)
  - user_id (uuid, references auth.users)
  - item_id (uuid, references template_checklist_items, ON DELETE CASCADE)
  - completed_date (text) - ISO date string (Monday of week for weekly, today for daily)
  - created_at (timestamptz)
  - UNIQUE constraint on (item_id, completed_date) for safe upserts

  ## Security
  - RLS enabled on all three tables
  - Separate SELECT, INSERT, UPDATE, DELETE policies for each table
  - All policies restrict access to authenticated users and their own data only
*/

CREATE TABLE IF NOT EXISTS planning_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'custom' CHECK (type IN ('weekly', 'daily', 'custom')),
  sort_order int NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE planning_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own planning templates"
  ON planning_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own planning templates"
  ON planning_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own planning templates"
  ON planning_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own planning templates"
  ON planning_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND is_default = false);

CREATE TABLE IF NOT EXISTS template_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES planning_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE template_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checklist items"
  ON template_checklist_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own checklist items"
  ON template_checklist_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own checklist items"
  ON template_checklist_items FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own checklist items"
  ON template_checklist_items FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS template_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES template_checklist_items(id) ON DELETE CASCADE,
  completed_date text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(item_id, completed_date)
);

ALTER TABLE template_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completions"
  ON template_completions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own completions"
  ON template_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own completions"
  ON template_completions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own completions"
  ON template_completions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
