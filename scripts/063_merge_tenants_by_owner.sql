-- Collapse one-tenant-per-space leftovers into one tenant per space owner.
-- Safe to re-run. Spaces with no owner are left on their own tenant.

BEGIN;

WITH ranked AS (
  SELECT
    s.owner_id,
    s.tenant_id,
    t.name,
    t.created_at,
    row_number() OVER (
      PARTITION BY s.owner_id
      ORDER BY (t.name LIKE '% organisation') DESC, t.created_at ASC
    ) AS rn
  FROM public.spaces s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE s.owner_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
),
canonical AS (
  SELECT owner_id, tenant_id
  FROM ranked
  WHERE rn = 1
),
owner_tenants AS (
  SELECT DISTINCT s.owner_id, s.tenant_id
  FROM public.spaces s
  WHERE s.owner_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
)
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT
  c.tenant_id,
  tm.user_id,
  CASE
    WHEN bool_or(tm.role = 'owner') THEN 'owner'
    WHEN bool_or(tm.role = 'admin') THEN 'admin'
    ELSE 'member'
  END
FROM public.tenant_members tm
JOIN owner_tenants ot ON ot.tenant_id = tm.tenant_id
JOIN canonical c ON c.owner_id = ot.owner_id
GROUP BY c.tenant_id, tm.user_id
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
  role = CASE
    WHEN public.tenant_members.role = 'owner' OR EXCLUDED.role = 'owner' THEN 'owner'
    WHEN public.tenant_members.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin'
    ELSE 'member'
  END;

WITH ranked AS (
  SELECT
    s.owner_id,
    s.tenant_id,
    t.created_at,
    row_number() OVER (
      PARTITION BY s.owner_id
      ORDER BY (t.name LIKE '% organisation') DESC, t.created_at ASC
    ) AS rn
  FROM public.spaces s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE s.owner_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
),
canonical AS (
  SELECT owner_id, tenant_id
  FROM ranked
  WHERE rn = 1
),
owner_tenants AS (
  SELECT DISTINCT s.owner_id, s.tenant_id
  FROM public.spaces s
  WHERE s.owner_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
)
INSERT INTO public.tenant_llm_credentials (tenant_id, provider_id, encrypted_key, updated_at)
SELECT DISTINCT ON (c.tenant_id, cred.provider_id)
  c.tenant_id,
  cred.provider_id,
  cred.encrypted_key,
  cred.updated_at
FROM public.tenant_llm_credentials cred
JOIN owner_tenants ot ON ot.tenant_id = cred.tenant_id
JOIN canonical c ON c.owner_id = ot.owner_id
WHERE cred.tenant_id <> c.tenant_id
ORDER BY c.tenant_id, cred.provider_id, cred.updated_at DESC
ON CONFLICT (tenant_id, provider_id) DO NOTHING;

WITH ranked AS (
  SELECT
    s.owner_id,
    s.tenant_id,
    t.created_at,
    row_number() OVER (
      PARTITION BY s.owner_id
      ORDER BY (t.name LIKE '% organisation') DESC, t.created_at ASC
    ) AS rn
  FROM public.spaces s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE s.owner_id IS NOT NULL
    AND s.tenant_id IS NOT NULL
),
canonical AS (
  SELECT owner_id, tenant_id
  FROM ranked
  WHERE rn = 1
)
UPDATE public.spaces s
SET tenant_id = c.tenant_id
FROM canonical c
WHERE s.owner_id = c.owner_id
  AND s.tenant_id IS DISTINCT FROM c.tenant_id;

DELETE FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.spaces s WHERE s.tenant_id = t.id
);

COMMIT;
