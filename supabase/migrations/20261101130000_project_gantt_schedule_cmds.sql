-- Project Gantt schedule commands: dependency CRUD, cascade reschedule, reorder.

CREATE TABLE IF NOT EXISTS public.project_gantt_reschedule_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  work_item_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  new_start_date date,
  new_end_date date,
  changed_count integer NOT NULL DEFAULT 0,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_gantt_reschedule_executions_idempotency_uq
    UNIQUE (project_entity_id, project_record_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.project_gantt_order_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  work_item_id uuid NOT NULL,
  stage_id uuid,
  direction text NOT NULL CHECK (direction IN ('up', 'down')),
  idempotency_key uuid NOT NULL,
  expected_order uuid[] NOT NULL,
  result_order uuid[] NOT NULL DEFAULT '{}',
  changed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_gantt_order_executions_idempotency_uq
    UNIQUE (project_entity_id, project_record_id, idempotency_key)
);

ALTER TABLE public.project_gantt_reschedule_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_gantt_order_executions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.project_gantt_reschedule_executions TO authenticated;
GRANT SELECT ON public.project_gantt_order_executions TO authenticated;
GRANT ALL ON public.project_gantt_reschedule_executions TO service_role;
GRANT ALL ON public.project_gantt_order_executions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.project_gantt_reschedule_executions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_gantt_order_executions FROM authenticated;

DROP POLICY IF EXISTS project_gantt_reschedule_executions_select
  ON public.project_gantt_reschedule_executions;
CREATE POLICY project_gantt_reschedule_executions_select
  ON public.project_gantt_reschedule_executions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_gantt_order_executions_select
  ON public.project_gantt_order_executions;
CREATE POLICY project_gantt_order_executions_select
  ON public.project_gantt_order_executions FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.project_gantt_is_business_day(p_date date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXTRACT(ISODOW FROM p_date)::integer BETWEEN 1 AND 5;
$$;

CREATE OR REPLACE FUNCTION public.project_gantt_add_business_days(
  p_date date,
  p_days integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  cursor date := p_date;
  remaining integer := ABS(p_days);
  step integer := CASE WHEN p_days < 0 THEN -1 ELSE 1 END;
BEGIN
  IF p_date IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_days = 0 THEN
    RETURN p_date;
  END IF;
  WHILE remaining > 0 LOOP
    cursor := cursor + step;
    IF public.project_gantt_is_business_day(cursor) THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;
  RETURN cursor;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_gantt_business_duration(
  p_start date,
  p_end date
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  cursor date;
  count integer := 0;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RETURN NULL;
  END IF;
  cursor := p_start;
  WHILE cursor <= p_end LOOP
    IF public.project_gantt_is_business_day(cursor) THEN
      count := count + 1;
    END IF;
    cursor := cursor + 1;
  END LOOP;
  RETURN count;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_project_gantt_dependency(
  p_project_entity_id text,
  p_project_record_id text,
  p_predecessor_work_item_id uuid,
  p_successor_work_item_id uuid,
  p_dependency_type text DEFAULT 'finish_to_start',
  p_lag_business_days integer DEFAULT 0
)
RETURNS public.project_work_item_dependencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row public.project_work_item_dependencies%ROWTYPE;
  dep_type public.project_work_item_dependency_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;
  dep_type := p_dependency_type::public.project_work_item_dependency_type;

  INSERT INTO public.project_work_item_dependencies (
    project_entity_id,
    project_record_id,
    predecessor_work_item_id,
    successor_work_item_id,
    dependency_type,
    lag_business_days,
    created_by
  )
  VALUES (
    p_project_entity_id,
    p_project_record_id,
    p_predecessor_work_item_id,
    p_successor_work_item_id,
    dep_type,
    COALESCE(p_lag_business_days, 0),
    auth.uid()
  )
  RETURNING * INTO row;

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_project_gantt_dependency(
  text, text, uuid, uuid, text, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_project_gantt_dependency(
  p_project_entity_id text,
  p_project_record_id text,
  p_dependency_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;
  DELETE FROM public.project_work_item_dependencies
  WHERE id = p_dependency_id
    AND project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_project_gantt_dependency(text, text, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_project_gantt_work_item(
  p_project_entity_id text,
  p_project_record_id text,
  p_work_item_id uuid,
  p_new_start_date date,
  p_new_end_date date,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing public.project_gantt_reschedule_executions%ROWTYPE;
  root public.project_work_items%ROWTYPE;
  item public.project_work_items%ROWTYPE;
  edge record;
  reachable uuid[] := ARRAY[p_work_item_id];
  frontier uuid[] := ARRAY[p_work_item_id];
  current uuid;
  next_ids uuid[];
  order_ids uuid[] := ARRAY[]::uuid[];
  indegree jsonb := '{}'::jsonb;
  ready uuid[] := ARRAY[]::uuid[];
  pred_count integer;
  duration integer;
  bound date;
  lower_bound date;
  new_start date;
  new_end date;
  dates jsonb := '{}'::jsonb;
  changes jsonb := '[]'::jsonb;
  change_count integer := 0;
  execution_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;

  SELECT * INTO existing
  FROM public.project_gantt_reschedule_executions
  WHERE project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id
    AND idempotency_key = p_idempotency_key;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'executionId', existing.id,
      'replayed', true,
      'changedCount', existing.changed_count,
      'changes', existing.result_payload->'changes'
    );
  END IF;

  SELECT * INTO root
  FROM public.project_work_items
  WHERE id = p_work_item_id
    AND project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id;
  IF root.id IS NULL THEN
    RAISE EXCEPTION 'Корневая работа не найдена';
  END IF;

  LOOP
    EXIT WHEN cardinality(frontier) = 0;
    current := frontier[1];
    frontier := frontier[2:];
    SELECT COALESCE(array_agg(d.successor_work_item_id ORDER BY d.successor_work_item_id), ARRAY[]::uuid[])
      INTO next_ids
    FROM public.project_work_item_dependencies d
    WHERE d.predecessor_work_item_id = current
      AND d.project_entity_id = p_project_entity_id
      AND d.project_record_id = p_project_record_id;
    FOR i IN 1..COALESCE(cardinality(next_ids), 0) LOOP
      IF NOT (next_ids[i] = ANY (reachable)) THEN
        reachable := reachable || next_ids[i];
        frontier := frontier || next_ids[i];
      END IF;
    END LOOP;
  END LOOP;

  FOREACH current IN ARRAY reachable LOOP
    SELECT COUNT(DISTINCT d.predecessor_work_item_id)::integer INTO pred_count
    FROM public.project_work_item_dependencies d
    WHERE d.successor_work_item_id = current
      AND d.project_entity_id = p_project_entity_id
      AND d.project_record_id = p_project_record_id
      AND d.predecessor_work_item_id = ANY (reachable);
    indegree := indegree || jsonb_build_object(current::text, pred_count);
    IF pred_count = 0 THEN
      ready := array_append(ready, current);
    END IF;
  END LOOP;
  ready := (SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[]) FROM unnest(ready) x);

  WHILE cardinality(ready) > 0 LOOP
    current := ready[1];
    ready := ready[2:];
    order_ids := array_append(order_ids, current);
    SELECT COALESCE(array_agg(d.successor_work_item_id ORDER BY d.successor_work_item_id), ARRAY[]::uuid[])
      INTO next_ids
    FROM public.project_work_item_dependencies d
    WHERE d.predecessor_work_item_id = current
      AND d.project_entity_id = p_project_entity_id
      AND d.project_record_id = p_project_record_id
      AND d.successor_work_item_id = ANY (reachable);
    FOR i IN 1..COALESCE(cardinality(next_ids), 0) LOOP
      pred_count := (indegree->>next_ids[i]::text)::integer - 1;
      indegree := indegree || jsonb_build_object(next_ids[i]::text, pred_count);
      IF pred_count = 0 THEN
        ready := array_append(ready, next_ids[i]);
        ready := (SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[]) FROM unnest(ready) x);
      END IF;
    END LOOP;
  END LOOP;

  IF cardinality(order_ids) <> cardinality(reachable) THEN
    RAISE EXCEPTION 'Граф зависимостей содержит цикл';
  END IF;

  FOR item IN
    SELECT * FROM public.project_work_items
    WHERE project_entity_id = p_project_entity_id
      AND project_record_id = p_project_record_id
  LOOP
    dates := dates || jsonb_build_object(
      item.id::text,
      jsonb_build_object('start', item.task_start_date, 'end', item.task_due_date)
    );
  END LOOP;

  dates := dates || jsonb_build_object(
    root.id::text,
    jsonb_build_object('start', p_new_start_date, 'end', p_new_end_date)
  );

  IF root.task_start_date IS DISTINCT FROM p_new_start_date
     OR root.task_due_date IS DISTINCT FROM p_new_end_date THEN
    UPDATE public.project_work_items
    SET task_start_date = p_new_start_date,
        task_due_date = p_new_end_date,
        updated_at = now()
    WHERE id = root.id;
    changes := changes || jsonb_build_array(jsonb_build_object(
      'workItemId', root.id,
      'oldStartDate', root.task_start_date,
      'oldEndDate', root.task_due_date,
      'newStartDate', p_new_start_date,
      'newEndDate', p_new_end_date
    ));
    change_count := change_count + 1;
  END IF;

  FOREACH current IN ARRAY order_ids LOOP
    CONTINUE WHEN current = root.id;
    SELECT * INTO item FROM public.project_work_items WHERE id = current;
    duration := public.project_gantt_business_duration(
      item.task_start_date, item.task_due_date
    );
    CONTINUE WHEN duration IS NULL;

    lower_bound := NULL;
    FOR edge IN
      SELECT *
      FROM public.project_work_item_dependencies d
      WHERE d.successor_work_item_id = current
        AND d.project_entity_id = p_project_entity_id
        AND d.project_record_id = p_project_record_id
      ORDER BY d.predecessor_work_item_id, d.dependency_type::text
    LOOP
      IF edge.dependency_type IN ('finish_to_start', 'finish_to_finish') THEN
        IF (dates->edge.predecessor_work_item_id::text->>'end') IS NULL THEN
          RAISE EXCEPTION 'У предшественника не задан срок окончания';
        END IF;
        bound := CASE
          WHEN edge.dependency_type = 'finish_to_start' THEN
            public.project_gantt_add_business_days(
              (dates->edge.predecessor_work_item_id::text->>'end')::date, 1
            )
          ELSE
            public.project_gantt_add_business_days(
              (dates->edge.predecessor_work_item_id::text->>'end')::date,
              -(duration - 1)
            )
        END;
      ELSE
        IF (dates->edge.predecessor_work_item_id::text->>'start') IS NULL THEN
          RAISE EXCEPTION 'У предшественника не задан срок начала';
        END IF;
        bound := CASE
          WHEN edge.dependency_type = 'start_to_start' THEN
            (dates->edge.predecessor_work_item_id::text->>'start')::date
          ELSE
            public.project_gantt_add_business_days(
              (dates->edge.predecessor_work_item_id::text->>'start')::date,
              -(duration - 1)
            )
        END;
      END IF;
      bound := public.project_gantt_add_business_days(bound, edge.lag_business_days);
      IF lower_bound IS NULL OR bound > lower_bound THEN
        lower_bound := bound;
      END IF;
    END LOOP;

    CONTINUE WHEN lower_bound IS NULL;
    new_start := lower_bound;
    new_end := public.project_gantt_add_business_days(new_start, duration - 1);
    dates := dates || jsonb_build_object(
      current::text,
      jsonb_build_object('start', new_start, 'end', new_end)
    );
    IF item.task_start_date IS DISTINCT FROM new_start
       OR item.task_due_date IS DISTINCT FROM new_end THEN
      UPDATE public.project_work_items
      SET task_start_date = new_start,
          task_due_date = new_end,
          updated_at = now()
      WHERE id = current;
      changes := changes || jsonb_build_array(jsonb_build_object(
        'workItemId', current,
        'oldStartDate', item.task_start_date,
        'oldEndDate', item.task_due_date,
        'newStartDate', new_start,
        'newEndDate', new_end
      ));
      change_count := change_count + 1;
    END IF;
  END LOOP;

  INSERT INTO public.project_gantt_reschedule_executions (
    project_entity_id,
    project_record_id,
    work_item_id,
    idempotency_key,
    new_start_date,
    new_end_date,
    changed_count,
    result_payload,
    created_by
  )
  VALUES (
    p_project_entity_id,
    p_project_record_id,
    p_work_item_id,
    p_idempotency_key,
    p_new_start_date,
    p_new_end_date,
    change_count,
    jsonb_build_object('changes', changes),
    auth.uid()
  )
  RETURNING id INTO execution_id;

  RETURN jsonb_build_object(
    'executionId', execution_id,
    'replayed', false,
    'changedCount', change_count,
    'changes', changes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_project_gantt_work_item(
  text, text, uuid, date, date, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_project_gantt_work_item(
  p_project_entity_id text,
  p_project_record_id text,
  p_work_item_id uuid,
  p_stage_id uuid,
  p_direction text,
  p_expected_order uuid[],
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing public.project_gantt_order_executions%ROWTYPE;
  current_order uuid[];
  idx integer;
  swap_idx integer;
  result_order uuid[];
  changed boolean := false;
  execution_id uuid;
  i integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;
  IF p_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'Некорректное направление';
  END IF;

  SELECT * INTO existing
  FROM public.project_gantt_order_executions
  WHERE project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id
    AND idempotency_key = p_idempotency_key;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'executionId', existing.id,
      'replayed', true,
      'changed', existing.changed,
      'workItemOrder', to_jsonb(existing.result_order)
    );
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY row_order, id), ARRAY[]::uuid[])
    INTO current_order
  FROM public.project_work_items
  WHERE project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id
    AND stage_id IS NOT DISTINCT FROM p_stage_id;

  IF current_order IS DISTINCT FROM p_expected_order THEN
    RAISE EXCEPTION 'Ожидаемый порядок работ устарел';
  END IF;

  idx := array_position(current_order, p_work_item_id);
  IF idx IS NULL THEN
    RAISE EXCEPTION 'Перемещаемая задача отсутствует в ожидаемом порядке';
  END IF;

  swap_idx := CASE
    WHEN p_direction = 'up' THEN idx - 1
    ELSE idx + 1
  END;

  result_order := current_order;
  IF swap_idx BETWEEN 1 AND cardinality(current_order) THEN
    result_order[idx] := current_order[swap_idx];
    result_order[swap_idx] := current_order[idx];
    changed := true;
    FOR i IN 1..cardinality(result_order) LOOP
      UPDATE public.project_work_items
      SET row_order = i - 1, updated_at = now()
      WHERE id = result_order[i];
    END LOOP;
  END IF;

  INSERT INTO public.project_gantt_order_executions (
    project_entity_id,
    project_record_id,
    work_item_id,
    stage_id,
    direction,
    idempotency_key,
    expected_order,
    result_order,
    changed,
    created_by
  )
  VALUES (
    p_project_entity_id,
    p_project_record_id,
    p_work_item_id,
    p_stage_id,
    p_direction,
    p_idempotency_key,
    p_expected_order,
    result_order,
    changed,
    auth.uid()
  )
  RETURNING id INTO execution_id;

  RETURN jsonb_build_object(
    'executionId', execution_id,
    'replayed', false,
    'changed', changed,
    'workItemOrder', to_jsonb(result_order)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_project_gantt_work_item(
  text, text, uuid, uuid, text, uuid[], uuid
) TO authenticated;
