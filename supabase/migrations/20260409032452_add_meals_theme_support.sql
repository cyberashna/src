/*
  # Add Meals Theme Support

  ## Summary
  This migration adds support for a "meals" theme type, allowing users to track meals
  (breakfast, lunch, dinner) with optional nutrition information alongside their regular habits.

  ## Changes

  ### Modified Tables
  1. `themes`
     - Added `theme_type` column (text, default 'habit') - distinguishes between 'habit' and 'meals' themes

  ### New Tables
  1. `meals`
     - `id` (uuid, primary key)
     - `user_id` (uuid, FK to auth.users)
     - `theme_id` (uuid, FK to themes)
     - `name` (text, required) - meal item name
     - `meal_type` (text) - 'breakfast', 'lunch', or 'dinner'
     - `calories` (integer, optional) - calorie count
     - `protein_g` (numeric, optional) - protein in grams
     - `carbs_g` (numeric, optional) - carbohydrates in grams
     - `fat_g` (numeric, optional) - fat in grams
     - `vitamins_notes` (text, optional) - free-text nutrition notes
     - `created_at` (timestamptz)

  2. `meal_block_links`
     - Links a scheduled block to a specific meal item
     - `id` (uuid, primary key)
     - `block_id` (uuid, FK to blocks)
     - `meal_id` (uuid, FK to meals)
     - `user_id` (uuid, FK to auth.users)
     - `created_at` (timestamptz)

  ## Security
  - RLS enabled on both new tables
  - Users can only access their own meals and meal block links
  - Separate policies for SELECT, INSERT, UPDATE, DELETE

  ## Notes
  - `theme_type` defaults to 'habit' for all existing themes (no data loss)
  - Nutrition fields are all optional (nullable)
  - Meal block links allow a board block to display meal-type colors
*/

-- Add theme_type to themes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'themes' AND column_name = 'theme_type'
  ) THEN
    ALTER TABLE themes ADD COLUMN theme_type text NOT NULL DEFAULT 'habit';
  END IF;
END $$;

-- Create meals table
CREATE TABLE IF NOT EXISTS meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_id uuid NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  meal_type text NOT NULL DEFAULT 'breakfast',
  calories integer,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  vitamins_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meals"
  ON meals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meals"
  ON meals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meals"
  ON meals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meals"
  ON meals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create meal_block_links table
CREATE TABLE IF NOT EXISTS meal_block_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  meal_id uuid NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(block_id)
);

ALTER TABLE meal_block_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meal block links"
  ON meal_block_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal block links"
  ON meal_block_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal block links"
  ON meal_block_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal block links"
  ON meal_block_links FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS meals_user_id_idx ON meals(user_id);
CREATE INDEX IF NOT EXISTS meals_theme_id_idx ON meals(theme_id);
CREATE INDEX IF NOT EXISTS meal_block_links_block_id_idx ON meal_block_links(block_id);
CREATE INDEX IF NOT EXISTS meal_block_links_meal_id_idx ON meal_block_links(meal_id);
