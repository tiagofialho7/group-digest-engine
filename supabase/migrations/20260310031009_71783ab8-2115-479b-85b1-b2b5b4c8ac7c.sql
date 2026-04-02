
-- Create helper functions for Supabase Vault operations

-- Store or update a secret in vault
CREATE OR REPLACE FUNCTION public.store_vault_secret(p_name text, p_secret text, p_description text DEFAULT '')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  -- Check if secret already exists
  SELECT id INTO v_secret_id
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;

  IF v_secret_id IS NOT NULL THEN
    -- Update existing secret
    UPDATE vault.secrets
    SET secret = p_secret,
        description = p_description,
        updated_at = now()
    WHERE id = v_secret_id;
    RETURN v_secret_id;
  ELSE
    -- Create new secret
    v_secret_id := vault.create_secret(p_secret, p_name, p_description);
    RETURN v_secret_id;
  END IF;
END;
$$;

-- Retrieve a decrypted secret from vault
CREATE OR REPLACE FUNCTION public.get_vault_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;

  RETURN v_secret;
END;
$$;

-- Delete a secret from vault
CREATE OR REPLACE FUNCTION public.delete_vault_secret(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM vault.secrets
  WHERE name = p_name;
END;
$$;
