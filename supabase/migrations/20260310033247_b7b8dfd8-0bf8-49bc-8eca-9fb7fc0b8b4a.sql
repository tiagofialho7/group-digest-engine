GRANT USAGE ON SCHEMA vault TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON vault.secrets TO postgres;
GRANT SELECT ON vault.decrypted_secrets TO postgres;
GRANT EXECUTE ON FUNCTION vault.create_secret(text, text, text, uuid) TO postgres;
GRANT EXECUTE ON FUNCTION vault.update_secret(uuid, text, text, text, uuid) TO postgres;