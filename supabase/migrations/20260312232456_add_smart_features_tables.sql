/*
  # Smart Features: Quick Start Templates, Daily Priorities, Pattern Analysis, and Standing Blocks

  1. New Tables
    - `quick_start_templates`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text) - Template name like "Morning Routine"
      - `description` (text) - Description of the template
      - `category` (text) - Category: morning, evening, work, self-care, fitness
      - `is_system_default` (boolean) - Whether this is a built-in template
      - `created_at` (timestamptz)

    - `template_blocks`
      - `id` (uuid, primary key)
      - `template_id` (uuid, references quick_start_templates)
      - `label` (text) - Block label that should exist in user's activity bank
      - `day_index` (int) - Which day of week (0-6)
      - `time_index` (int) - Which time slot
      - `relative_position` (int) - Order within template for display
      - `created_at` (timestamptz)

    - `daily_priorities`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `block_id` (uuid, references blocks, nullable) - Can be null if not scheduled yet
      - `date` (date) - Which date these priorities are for
      - `priority_rank` (int) - 1, 2, or 3 (gold, silver, bronze)
      - `completed` (boolean) - Whether this priority was completed
      - `created_at` (timestamptz)

    - `block_patterns`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `block_label` (text) - The label of the repeating block
      - `preferred_day_index` (int) - Most common day of week
      - `preferred_time_index` (int) - Most common time slot
      - `occurrence_count` (int) - How many times seen in pattern window
      - `last_seen_week` (date) - Week start date when last observed
      - `confidence_score` (int) - Percentage 0-100
      - `is_dismissed` (boolean) - User dismissed this suggestion
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `standing_blocks`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `source_block_id` (uuid, references blocks) - The original block that was made standing
      - `block_label` (text) - Label for easy lookup
      - `day_index` (int) - Preferred day of week
      - `time_index` (int) - Preferred time slot
      - `recurrence_enabled` (boolean) - Whether currently active
      - `created_at` (timestamptz)
      - `paused_at` (timestamptz, nullable) - When paused if applicable

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to manage their own data

  3. Indexes
    - Add indexes on user_id, date, and week_start_date for efficient querying
*/

-- Create quick_start_templates table
CREATE TABLE IF NOT EXISTS quick_start_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL CHECK (category IN ('morning', 'evening', 'work', 'self-care', 'fitness', 'custom')),
  is_system_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quick_start_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates and system defaults"
  ON quick_start_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR is_system_default = true);

CREATE POLICY "Users can create own templates"
  ON quick_start_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON quick_start_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON quick_start_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create template_blocks table
CREATE TABLE IF NOT EXISTS template_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES quick_start_templates(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  day_index int NOT NULL CHECK (day_index >= 0 AND day_index <= 6),
  time_index int NOT NULL CHECK (time_index >= 0),
  relative_position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE template_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view template blocks for accessible templates"
  ON template_blocks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_start_templates
      WHERE quick_start_templates.id = template_blocks.template_id
      AND (quick_start_templates.user_id = auth.uid() OR quick_start_templates.is_system_default = true)
    )
  );

CREATE POLICY "Users can create template blocks for own templates"
  ON template_blocks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quick_start_templates
      WHERE quick_start_templates.id = template_blocks.template_id
      AND quick_start_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update template blocks for own templates"
  ON template_blocks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_start_templates
      WHERE quick_start_templates.id = template_blocks.template_id
      AND quick_start_templates.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quick_start_templates
      WHERE quick_start_templates.id = template_blocks.template_id
      AND quick_start_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete template blocks for own templates"
  ON template_blocks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_start_templates
      WHERE quick_start_templates.id = template_blocks.template_id
      AND quick_start_templates.user_id = auth.uid()
    )
  );

-- Create daily_priorities table
CREATE TABLE IF NOT EXISTS daily_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  block_id uuid REFERENCES blocks(id) ON DELETE SET NULL,
  date date NOT NULL,
  priority_rank int NOT NULL CHECK (priority_rank >= 1 AND priority_rank <= 3),
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date, priority_rank)
);

ALTER TABLE daily_priorities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own priorities"
  ON daily_priorities FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own priorities"
  ON daily_priorities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own priorities"
  ON daily_priorities FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own priorities"
  ON daily_priorities FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create block_patterns table
CREATE TABLE IF NOT EXISTS block_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  block_label text NOT NULL,
  preferred_day_index int NOT NULL CHECK (preferred_day_index >= 0 AND preferred_day_index <= 6),
  preferred_time_index int NOT NULL CHECK (preferred_time_index >= 0),
  occurrence_count int DEFAULT 1,
  last_seen_week date NOT NULL,
  confidence_score int DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  is_dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, block_label, preferred_day_index, preferred_time_index)
);

ALTER TABLE block_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own patterns"
  ON block_patterns FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own patterns"
  ON block_patterns FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patterns"
  ON block_patterns FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own patterns"
  ON block_patterns FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create standing_blocks table
CREATE TABLE IF NOT EXISTS standing_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_block_id uuid REFERENCES blocks(id) ON DELETE CASCADE NOT NULL,
  block_label text NOT NULL,
  day_index int NOT NULL CHECK (day_index >= 0 AND day_index <= 6),
  time_index int NOT NULL CHECK (time_index >= 0),
  recurrence_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  paused_at timestamptz
);

ALTER TABLE standing_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own standing blocks"
  ON standing_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own standing blocks"
  ON standing_blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own standing blocks"
  ON standing_blocks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own standing blocks"
  ON standing_blocks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quick_start_templates_user_id ON quick_start_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_template_blocks_template_id ON template_blocks(template_id);
CREATE INDEX IF NOT EXISTS idx_daily_priorities_user_date ON daily_priorities(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_priorities_block_id ON daily_priorities(block_id);
CREATE INDEX IF NOT EXISTS idx_block_patterns_user_id ON block_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_block_patterns_last_seen_week ON block_patterns(last_seen_week);
CREATE INDEX IF NOT EXISTS idx_standing_blocks_user_id ON standing_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_standing_blocks_source_block_id ON standing_blocks(source_block_id);
