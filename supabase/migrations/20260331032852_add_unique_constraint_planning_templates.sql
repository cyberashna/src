/*
  # Add unique constraint to prevent duplicate default planning templates

  ## Changes
  - Adds a unique constraint on (user_id, name) for planning_templates
    so the same template name cannot be created twice for the same user.

  ## Notes
  - This prevents the race condition in seedDefaults from creating duplicate Weekly/Daily templates.
*/

ALTER TABLE planning_templates
  ADD CONSTRAINT planning_templates_user_id_name_key UNIQUE (user_id, name);
