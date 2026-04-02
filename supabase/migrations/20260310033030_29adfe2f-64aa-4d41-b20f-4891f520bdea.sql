-- Recreate functions ensuring they run with proper privileges
-- Drop and recreate with explicit search_path including vault

DROP FUNCTION IF EXISTS public.store_vault_secret(text, text, text);

CREATE OR REPLACE FUNCTION public.store_vault_secret(p_name text, p_secret text, p_description text DEFAULT ''::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT id INTO v_secret_id
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;

  IF v_secret_id IS NOT NULL THEN
    UPDATE vault.secrets
    SET secret = p_secret,
        description = p_description,
        updated_at = now()
    WHERE id = v_secret_id;
    RETURN v_secret_id;
  ELSE
    v_secret_id := vault.create_secret(p_secret, p_name, p_description);
    RETURN v_secret_id;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.get_vault_secret(text);

CREATE OR REPLACE FUNCTION public.get_vault_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
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

DROP FUNCTION IF EXISTS public.delete_vault_secret(text);

CREATE OR REPLACE FUNCTION public.delete_vault_secret(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
AS $$
BEGIN
  DELETE FROM vault.secrets
  WHERE name = p_name;
END;
$$;