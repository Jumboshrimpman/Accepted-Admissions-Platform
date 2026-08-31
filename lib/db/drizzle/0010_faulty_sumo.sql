WITH ranked_connections AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY tutor_profile_id, provider
      ORDER BY
        (status = 'connected' AND encrypted_access_token IS NOT NULL) DESC,
        (encrypted_refresh_token IS NOT NULL) DESC,
        updated_at DESC,
        connected_at DESC NULLS LAST,
        id
    ) AS duplicate_rank
  FROM calendar_connections
)
DELETE FROM calendar_connections AS connection
USING ranked_connections AS ranked
WHERE connection.id = ranked.id
  AND ranked.duplicate_rank > 1;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_connection_profile_provider_idx" ON "calendar_connections" USING btree ("tutor_profile_id","provider");