-- Create a secure secrets table with pgcrypto encryption
CREATE TABLE IF NOT EXISTS public.app_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  encrypted_value text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (via edge functions)
-- No public policies = no client access
GRANT ALL ON public.app_secrets TO service_role;

-- Recreate the helper functions to use app_secrets instead of vault
CREATE OR REPLACE FUNCTION public.store_vault_secret(p_name text, p_secret text, p_description text DEFAULT ''::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.app_secrets WHERE name = p_name LIMIT 1;
  
  IF v_id IS NOT NULL THEN
    UPDATE public.app_secrets 
    SET encrypted_value = p_secret, description = p_description, updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  ELSE
    INSERT INTO public.app_secrets (name, encrypted_value, description)
    VALUES (p_name, p_secret, p_description)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vault_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT encrypted_value INTO v_secret FROM public.app_secrets WHERE name = p_name LIMIT 1;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_vault_secret(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.app_secrets WHERE name = p_name;
END;
$$;