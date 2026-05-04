ALTER TABLE inventory_items
  ALTER COLUMN scope_id TYPE TEXT USING scope_id::text;

ALTER TABLE inventory_adjustments
  ALTER COLUMN scope_id TYPE TEXT USING scope_id::text,
  ALTER COLUMN actor_user_id TYPE TEXT USING actor_user_id::text;

ALTER TABLE inventory_scope_state
  ALTER COLUMN user_id TYPE TEXT USING user_id::text,
  ALTER COLUMN last_scope_id TYPE TEXT USING last_scope_id::text;
