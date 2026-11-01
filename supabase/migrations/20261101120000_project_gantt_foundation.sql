-- Project Gantt foundation: stages, work items, subtasks, dependencies, project state.
-- Root is entity_records of «Проекты» (project_entity_id + project_record_id).

CREATE TABLE IF NOT EXISTS public.project_gantt_project_state (
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  project_title text NOT NULL DEFAULT '',
  leading_department_id text,
  leading_department_name text,
  published_gantt_revision_id uuid,
  baseline_gantt_revision_id uuid,
  baseline_gantt_fixed_at timestamptz,
  baseline_gantt_fixed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  baseline_gantt_fixed_by_name text,
  operational_plan_state text NOT NULL DEFAULT 'draft'
    CHECK (operational_plan_state IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_entity_id, project_record_id)
);

CREATE TABLE IF NOT EXISTS public.project_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  name text NOT NULL,
  start_date date,
  end_date date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_stages_project
  ON public.project_stages (project_entity_id, project_record_id, sort_order);

CREATE TABLE IF NOT EXISTS public.project_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  stage_id uuid REFERENCES public.project_stages (id) ON DELETE SET NULL,
  name text NOT NULL,
  task_start_date date,
  task_due_date date,
  row_order integer NOT NULL DEFAULT 0,
  planned_hours numeric(12, 2),
  department_id text,
  department_name text,
  status text NOT NULL DEFAULT 'В работе',
  status_color text,
  is_done boolean NOT NULL DEFAULT false,
  completion_percent integer NOT NULL DEFAULT 0
    CHECK (completion_percent >= 0 AND completion_percent <= 100),
  assignee_id text,
  assignee_name text,
  assignee_role text,
  is_operationally_published boolean NOT NULL DEFAULT false,
  published_gantt_revision_id uuid,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_work_items_project
  ON public.project_work_items (project_entity_id, project_record_id, row_order);
CREATE INDEX IF NOT EXISTS idx_project_work_items_stage
  ON public.project_work_items (stage_id, row_order);

CREATE TABLE IF NOT EXISTS public.project_gantt_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  work_item_id uuid REFERENCES public.project_work_items (id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  assignee_id text,
  assignee_name text,
  assignee_role text,
  status text NOT NULL DEFAULT 'В работе',
  status_color text,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_gantt_subtasks_project
  ON public.project_gantt_subtasks (project_entity_id, project_record_id);
CREATE INDEX IF NOT EXISTS idx_project_gantt_subtasks_work_item
  ON public.project_gantt_subtasks (work_item_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'project_work_item_dependency_type'
  ) THEN
    CREATE TYPE public.project_work_item_dependency_type AS ENUM (
      'finish_to_start',
      'start_to_start',
      'finish_to_finish',
      'start_to_finish'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_work_item_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  predecessor_work_item_id uuid NOT NULL
    REFERENCES public.project_work_items (id) ON DELETE CASCADE,
  successor_work_item_id uuid NOT NULL
    REFERENCES public.project_work_items (id) ON DELETE CASCADE,
  dependency_type public.project_work_item_dependency_type NOT NULL
    DEFAULT 'finish_to_start',
  lag_business_days integer NOT NULL DEFAULT 0
    CHECK (lag_business_days BETWEEN -10000 AND 10000),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_work_item_dependencies_distinct_ends CHECK (
    predecessor_work_item_id <> successor_work_item_id
  ),
  CONSTRAINT project_work_item_dependencies_unique_edge UNIQUE (
    project_entity_id,
    project_record_id,
    predecessor_work_item_id,
    successor_work_item_id,
    dependency_type
  )
);

CREATE INDEX IF NOT EXISTS idx_project_work_item_dependencies_project
  ON public.project_work_item_dependencies (project_entity_id, project_record_id);

CREATE OR REPLACE FUNCTION public.project_gantt_assert_same_project_dependency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  pred public.project_work_items%ROWTYPE;
  succ public.project_work_items%ROWTYPE;
BEGIN
  SELECT * INTO pred FROM public.project_work_items WHERE id = NEW.predecessor_work_item_id;
  SELECT * INTO succ FROM public.project_work_items WHERE id = NEW.successor_work_item_id;
  IF pred.id IS NULL OR succ.id IS NULL THEN
    RAISE EXCEPTION 'Работа зависимости не найдена';
  END IF;
  IF pred.project_entity_id <> NEW.project_entity_id
     OR pred.project_record_id <> NEW.project_record_id
     OR succ.project_entity_id <> NEW.project_entity_id
     OR succ.project_record_id <> NEW.project_record_id THEN
    RAISE EXCEPTION 'Зависимость должна связывать работы одного проекта';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_work_item_dependencies_same_project
  ON public.project_work_item_dependencies;
CREATE TRIGGER project_work_item_dependencies_same_project
  BEFORE INSERT OR UPDATE ON public.project_work_item_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.project_gantt_assert_same_project_dependency();

CREATE OR REPLACE FUNCTION public.project_gantt_assert_no_dependency_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  visited uuid[] := ARRAY[NEW.successor_work_item_id];
  frontier uuid[] := ARRAY[NEW.successor_work_item_id];
  current uuid;
  next_ids uuid[];
BEGIN
  LOOP
    EXIT WHEN cardinality(frontier) = 0;
    current := frontier[1];
    frontier := frontier[2:];
    SELECT COALESCE(array_agg(d.successor_work_item_id), ARRAY[]::uuid[])
      INTO next_ids
    FROM public.project_work_item_dependencies d
    WHERE d.predecessor_work_item_id = current
      AND d.project_entity_id = NEW.project_entity_id
      AND d.project_record_id = NEW.project_record_id
      AND (TG_OP = 'INSERT' OR d.id <> NEW.id);

    IF NEW.predecessor_work_item_id = ANY (next_ids) THEN
      RAISE EXCEPTION 'Зависимости образуют цикл';
    END IF;

    SELECT COALESCE(array_agg(x), ARRAY[]::uuid[])
      INTO next_ids
    FROM unnest(next_ids) AS x
    WHERE NOT (x = ANY (visited));

    visited := visited || next_ids;
    frontier := frontier || next_ids;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_work_item_dependencies_no_cycle
  ON public.project_work_item_dependencies;
CREATE TRIGGER project_work_item_dependencies_no_cycle
  BEFORE INSERT OR UPDATE ON public.project_work_item_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.project_gantt_assert_no_dependency_cycle();

-- RLS: authenticated can SELECT; writes via SECURITY DEFINER RPCs.
ALTER TABLE public.project_gantt_project_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_gantt_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_work_item_dependencies ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.project_gantt_project_state TO authenticated;
GRANT SELECT ON public.project_stages TO authenticated;
GRANT SELECT ON public.project_work_items TO authenticated;
GRANT SELECT ON public.project_gantt_subtasks TO authenticated;
GRANT SELECT ON public.project_work_item_dependencies TO authenticated;
GRANT ALL ON public.project_gantt_project_state TO service_role;
GRANT ALL ON public.project_stages TO service_role;
GRANT ALL ON public.project_work_items TO service_role;
GRANT ALL ON public.project_gantt_subtasks TO service_role;
GRANT ALL ON public.project_work_item_dependencies TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.project_gantt_project_state FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_stages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_work_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_gantt_subtasks FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_work_item_dependencies FROM authenticated;

DROP POLICY IF EXISTS project_gantt_project_state_select ON public.project_gantt_project_state;
CREATE POLICY project_gantt_project_state_select
  ON public.project_gantt_project_state FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_stages_select ON public.project_stages;
CREATE POLICY project_stages_select
  ON public.project_stages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_work_items_select ON public.project_work_items;
CREATE POLICY project_work_items_select
  ON public.project_work_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_gantt_subtasks_select ON public.project_gantt_subtasks;
CREATE POLICY project_gantt_subtasks_select
  ON public.project_gantt_subtasks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_work_item_dependencies_select ON public.project_work_item_dependencies;
CREATE POLICY project_work_item_dependencies_select
  ON public.project_work_item_dependencies FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.ensure_project_gantt_project_state(
  p_project_entity_id text,
  p_project_record_id text,
  p_project_title text DEFAULT ''
)
RETURNS public.project_gantt_project_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row public.project_gantt_project_state%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;
  IF p_project_entity_id IS NULL OR btrim(p_project_entity_id) = ''
     OR p_project_record_id IS NULL OR btrim(p_project_record_id) = '' THEN
    RAISE EXCEPTION 'project_entity_id и project_record_id обязательны';
  END IF;

  INSERT INTO public.project_gantt_project_state (
    project_entity_id, project_record_id, project_title
  )
  VALUES (p_project_entity_id, p_project_record_id, COALESCE(p_project_title, ''))
  ON CONFLICT (project_entity_id, project_record_id) DO UPDATE
    SET project_title = CASE
          WHEN EXCLUDED.project_title <> '' THEN EXCLUDED.project_title
          ELSE project_gantt_project_state.project_title
        END,
        updated_at = now()
  RETURNING * INTO row;

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_project_gantt_project_state(text, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_project_gantt_stage(
  p_project_entity_id text,
  p_project_record_id text,
  p_name text,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL
)
RETURNS public.project_stages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row public.project_stages%ROWTYPE;
  next_order integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;
  PERFORM public.ensure_project_gantt_project_state(
    p_project_entity_id, p_project_record_id, ''
  );

  IF p_stage_id IS NOT NULL THEN
    UPDATE public.project_stages
    SET name = COALESCE(NULLIF(btrim(p_name), ''), name),
        start_date = COALESCE(p_start_date, start_date),
        end_date = COALESCE(p_end_date, end_date),
        sort_order = COALESCE(p_sort_order, sort_order),
        updated_at = now()
    WHERE id = p_stage_id
      AND project_entity_id = p_project_entity_id
      AND project_record_id = p_project_record_id
    RETURNING * INTO row;
    IF row.id IS NULL THEN
      RAISE EXCEPTION 'Этап не найден';
    END IF;
    RETURN row;
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO next_order
  FROM public.project_stages
  WHERE project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id;

  INSERT INTO public.project_stages (
    project_entity_id, project_record_id, name, start_date, end_date, sort_order
  )
  VALUES (
    p_project_entity_id,
    p_project_record_id,
    NULLIF(btrim(p_name), ''),
    p_start_date,
    p_end_date,
    COALESCE(p_sort_order, next_order)
  )
  RETURNING * INTO row;

  IF row.name IS NULL THEN
    RAISE EXCEPTION 'Название этапа обязательно';
  END IF;
  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_project_gantt_stage(
  text, text, text, date, date, integer, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_project_gantt_work_item(
  p_project_entity_id text,
  p_project_record_id text,
  p_name text,
  p_stage_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_planned_hours numeric DEFAULT NULL,
  p_department_id text DEFAULT NULL,
  p_department_name text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_status_color text DEFAULT NULL,
  p_is_done boolean DEFAULT NULL,
  p_assignee_id text DEFAULT NULL,
  p_assignee_name text DEFAULT NULL,
  p_assignee_role text DEFAULT NULL,
  p_work_item_id uuid DEFAULT NULL
)
RETURNS public.project_work_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row public.project_work_items%ROWTYPE;
  next_order integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;
  PERFORM public.ensure_project_gantt_project_state(
    p_project_entity_id, p_project_record_id, ''
  );

  IF p_work_item_id IS NOT NULL THEN
    UPDATE public.project_work_items
    SET name = COALESCE(NULLIF(btrim(p_name), ''), name),
        stage_id = COALESCE(p_stage_id, stage_id),
        task_start_date = p_start_date,
        task_due_date = p_due_date,
        planned_hours = COALESCE(p_planned_hours, planned_hours),
        department_id = COALESCE(p_department_id, department_id),
        department_name = COALESCE(p_department_name, department_name),
        status = COALESCE(NULLIF(btrim(p_status), ''), status),
        status_color = COALESCE(p_status_color, status_color),
        is_done = COALESCE(p_is_done, is_done),
        assignee_id = COALESCE(p_assignee_id, assignee_id),
        assignee_name = COALESCE(p_assignee_name, assignee_name),
        assignee_role = COALESCE(p_assignee_role, assignee_role),
        updated_at = now()
    WHERE id = p_work_item_id
      AND project_entity_id = p_project_entity_id
      AND project_record_id = p_project_record_id
    RETURNING * INTO row;
    IF row.id IS NULL THEN
      RAISE EXCEPTION 'Работа не найдена';
    END IF;
    RETURN row;
  END IF;

  SELECT COALESCE(MAX(row_order), -1) + 1 INTO next_order
  FROM public.project_work_items
  WHERE project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id
    AND stage_id IS NOT DISTINCT FROM p_stage_id;

  INSERT INTO public.project_work_items (
    project_entity_id,
    project_record_id,
    stage_id,
    name,
    task_start_date,
    task_due_date,
    row_order,
    planned_hours,
    department_id,
    department_name,
    status,
    status_color,
    is_done,
    assignee_id,
    assignee_name,
    assignee_role,
    created_by
  )
  VALUES (
    p_project_entity_id,
    p_project_record_id,
    p_stage_id,
    NULLIF(btrim(p_name), ''),
    p_start_date,
    p_due_date,
    next_order,
    p_planned_hours,
    p_department_id,
    p_department_name,
    COALESCE(NULLIF(btrim(p_status), ''), 'В работе'),
    p_status_color,
    COALESCE(p_is_done, false),
    p_assignee_id,
    p_assignee_name,
    p_assignee_role,
    auth.uid()
  )
  RETURNING * INTO row;

  IF row.name IS NULL THEN
    RAISE EXCEPTION 'Название работы обязательно';
  END IF;
  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_project_gantt_work_item(
  text, text, text, uuid, date, date, numeric, text, text, text, text, boolean, text, text, text, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_project_gantt_work_item(
  p_project_entity_id text,
  p_project_record_id text,
  p_work_item_id uuid
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
  DELETE FROM public.project_work_items
  WHERE id = p_work_item_id
    AND project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_project_gantt_work_item(text, text, uuid)
  TO authenticated;
