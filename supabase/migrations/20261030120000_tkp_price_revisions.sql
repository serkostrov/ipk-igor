-- Immutable TKP sale price revisions for entity CRM «Разбор ТКП» records.

CREATE TABLE IF NOT EXISTS public.tkp_price_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id text NOT NULL,
  record_id text NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  price_mode text NOT NULL CHECK (price_mode IN ('coefficient', 'manual')),
  sale_coefficient numeric(12, 4),
  manual_total_before_vat numeric(15, 2),
  retro_amount numeric(15, 2) NOT NULL DEFAULT 0,
  cost_with_fixed numeric(15, 2) NOT NULL,
  cost_with_coefficient numeric(15, 2) NOT NULL,
  profit_tax_amount numeric(15, 2) NOT NULL,
  contractor_work_total numeric(15, 2) NOT NULL DEFAULT 0,
  additional_work_total numeric(15, 2) NOT NULL DEFAULT 0,
  base_total_before_vat numeric(15, 2) NOT NULL,
  total_before_vat numeric(15, 2) NOT NULL,
  vat_rate numeric(5, 2) NOT NULL DEFAULT 22,
  vat_amount numeric(15, 2) NOT NULL,
  total_with_vat numeric(15, 2) NOT NULL,
  net_profit numeric(15, 2) NOT NULL,
  profitability_percent numeric(12, 4) NOT NULL,
  calculation_snapshot jsonb NOT NULL,
  gip_calculation_snapshot jsonb,
  idempotency_key text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tkp_price_revisions_entity_record_revision_uq
    UNIQUE (entity_id, record_id, revision_number),
  CONSTRAINT tkp_price_revisions_coefficient_shape_check CHECK (
    (
      price_mode = 'coefficient'
      AND sale_coefficient IS NOT NULL
      AND sale_coefficient > 0
      AND manual_total_before_vat IS NULL
    )
    OR (
      price_mode = 'manual'
      AND manual_total_before_vat IS NOT NULL
      AND manual_total_before_vat > 0
    )
  ),
  CONSTRAINT tkp_price_revisions_idempotency_key_check CHECK (
    idempotency_key IS NULL
    OR char_length(btrim(idempotency_key)) BETWEEN 1 AND 200
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tkp_price_revisions_idempotency
  ON public.tkp_price_revisions (entity_id, record_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tkp_price_revisions_record_created
  ON public.tkp_price_revisions (entity_id, record_id, created_at DESC);

ALTER TABLE public.tkp_price_revisions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.tkp_price_revisions TO authenticated;
GRANT ALL ON public.tkp_price_revisions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.tkp_price_revisions FROM authenticated;

DROP POLICY IF EXISTS tkp_price_revisions_select ON public.tkp_price_revisions;
CREATE POLICY tkp_price_revisions_select
  ON public.tkp_price_revisions
  FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.prevent_tkp_price_revisions_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'История цен ТКП неизменяема';
END;
$$;

DROP TRIGGER IF EXISTS tkp_price_revisions_immutable
  ON public.tkp_price_revisions;
CREATE TRIGGER tkp_price_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.tkp_price_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tkp_price_revisions_mutation();

CREATE OR REPLACE FUNCTION public.append_tkp_price_revision(
  p_entity_id text,
  p_record_id text,
  p_price_mode text,
  p_sale_coefficient numeric,
  p_manual_total_before_vat numeric,
  p_retro_amount numeric,
  p_calculation_snapshot jsonb,
  p_gip_calculation_snapshot jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_created_by_name text DEFAULT NULL
)
RETURNS public.tkp_price_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing public.tkp_price_revisions%ROWTYPE;
  next_revision integer;
  inserted public.tkp_price_revisions%ROWTYPE;
  calc jsonb := p_calculation_snapshot;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;

  IF p_entity_id IS NULL OR btrim(p_entity_id) = ''
     OR p_record_id IS NULL OR btrim(p_record_id) = '' THEN
    RAISE EXCEPTION 'entity_id и record_id обязательны';
  END IF;

  IF p_price_mode NOT IN ('coefficient', 'manual') THEN
    RAISE EXCEPTION 'Некорректный режим цены';
  END IF;

  IF calc IS NULL OR jsonb_typeof(calc) <> 'object' THEN
    RAISE EXCEPTION 'calculation_snapshot обязателен';
  END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT *
    INTO existing
    FROM public.tkp_price_revisions
    WHERE entity_id = p_entity_id
      AND record_id = p_record_id
      AND idempotency_key = btrim(p_idempotency_key)
    LIMIT 1;
    IF FOUND THEN
      RETURN existing;
    END IF;
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO next_revision
  FROM public.tkp_price_revisions
  WHERE entity_id = p_entity_id
    AND record_id = p_record_id;

  INSERT INTO public.tkp_price_revisions (
    entity_id,
    record_id,
    revision_number,
    price_mode,
    sale_coefficient,
    manual_total_before_vat,
    retro_amount,
    cost_with_fixed,
    cost_with_coefficient,
    profit_tax_amount,
    contractor_work_total,
    additional_work_total,
    base_total_before_vat,
    total_before_vat,
    vat_rate,
    vat_amount,
    total_with_vat,
    net_profit,
    profitability_percent,
    calculation_snapshot,
    gip_calculation_snapshot,
    idempotency_key,
    created_by,
    created_by_name
  )
  VALUES (
    btrim(p_entity_id),
    btrim(p_record_id),
    next_revision,
    p_price_mode,
    CASE WHEN p_price_mode = 'coefficient' THEN p_sale_coefficient ELSE NULL END,
    CASE WHEN p_price_mode = 'manual' THEN p_manual_total_before_vat ELSE NULL END,
    COALESCE(p_retro_amount, 0),
    COALESCE((calc ->> 'costWithFixed')::numeric, 0),
    COALESCE((calc ->> 'costWithCoefficient')::numeric, 0),
    COALESCE((calc ->> 'profitTaxAmount')::numeric, 0),
    COALESCE((calc ->> 'contractorWorkTotal')::numeric, 0),
    COALESCE((calc ->> 'additionalWorkTotal')::numeric, 0),
    COALESCE((calc ->> 'baseTotalBeforeVat')::numeric, 0),
    COALESCE((calc ->> 'totalBeforeVat')::numeric, 0),
    COALESCE((calc ->> 'vatRate')::numeric, 22),
    COALESCE((calc ->> 'vatAmount')::numeric, 0),
    COALESCE((calc ->> 'totalWithVat')::numeric, 0),
    COALESCE((calc ->> 'netProfit')::numeric, 0),
    COALESCE((calc ->> 'profitabilityPercent')::numeric, 0),
    calc,
    p_gip_calculation_snapshot,
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''),
    auth.uid(),
    NULLIF(btrim(COALESCE(p_created_by_name, '')), '')
  )
  RETURNING * INTO inserted;

  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.append_tkp_price_revision(
  text, text, text, numeric, numeric, numeric, jsonb, jsonb, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_tkp_price_revision(
  text, text, text, numeric, numeric, numeric, jsonb, jsonb, text, text
) TO authenticated;

COMMENT ON TABLE public.tkp_price_revisions IS
  'Immutable sale-price revisions for entity «Разбор ТКП» records.';
COMMENT ON FUNCTION public.append_tkp_price_revision IS
  'Append-only writer for tkp_price_revisions (idempotent by key).';

NOTIFY pgrst, 'reload schema';
