-- Project Gantt lifecycle: revisions, decisions, publish, baseline, mutation guards.

CREATE TABLE IF NOT EXISTS public.project_gantt_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  cycle_number integer NOT NULL DEFAULT 1 CHECK (cycle_number > 0),
  status text NOT NULL
    CHECK (status IN (
      'draft',
      'leading_review',
      'department_review',
      'rework',
      'approved',
      'published',
      'superseded'
    )),
  resubmission_mode text NOT NULL DEFAULT 'initial'
    CHECK (resubmission_mode IN ('initial', 'targeted', 'all')),
  target_department_id text,
  target_department_name text,
  leading_department_id text,
  leading_department_name text,
  content_hash text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_by_name text,
  submitted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  submitted_by_name text,
  published_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  published_by_name text,
  submitted_at timestamptz,
  returned_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_gantt_revisions_project_revision_uq
    UNIQUE (project_entity_id, project_record_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_project_gantt_revisions_project_status
  ON public.project_gantt_revisions (project_entity_id, project_record_id, status);

CREATE TABLE IF NOT EXISTS public.project_gantt_revision_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.project_gantt_revisions (id) ON DELETE CASCADE,
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  department_id text NOT NULL,
  department_name text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('leading', 'participant')),
  required boolean NOT NULL DEFAULT true,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'approved', 'rejected', 'superseded')),
  comment text,
  decided_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_gantt_revision_decisions_unique
    UNIQUE (revision_id, department_id)
);

CREATE TABLE IF NOT EXISTS public.project_gantt_lifecycle_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_entity_id text NOT NULL,
  project_record_id text NOT NULL,
  revision_id uuid REFERENCES public.project_gantt_revisions (id) ON DELETE SET NULL,
  action text NOT NULL,
  old_status text,
  new_status text,
  comment text,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_gantt_lifecycle_history_project
  ON public.project_gantt_lifecycle_history (
    project_entity_id, project_record_id, created_at DESC
  );

ALTER TABLE public.project_gantt_project_state
  DROP CONSTRAINT IF EXISTS project_gantt_project_state_published_fk;
ALTER TABLE public.project_gantt_project_state
  ADD CONSTRAINT project_gantt_project_state_published_fk
  FOREIGN KEY (published_gantt_revision_id)
  REFERENCES public.project_gantt_revisions (id) ON DELETE SET NULL;

ALTER TABLE public.project_gantt_project_state
  DROP CONSTRAINT IF EXISTS project_gantt_project_state_baseline_fk;
ALTER TABLE public.project_gantt_project_state
  ADD CONSTRAINT project_gantt_project_state_baseline_fk
  FOREIGN KEY (baseline_gantt_revision_id)
  REFERENCES public.project_gantt_revisions (id) ON DELETE SET NULL;

ALTER TABLE public.project_gantt_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_gantt_revision_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_gantt_lifecycle_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.project_gantt_revisions TO authenticated;
GRANT SELECT ON public.project_gantt_revision_decisions TO authenticated;
GRANT SELECT ON public.project_gantt_lifecycle_history TO authenticated;
GRANT ALL ON public.project_gantt_revisions TO service_role;
GRANT ALL ON public.project_gantt_revision_decisions TO service_role;
GRANT ALL ON public.project_gantt_lifecycle_history TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.project_gantt_revisions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_gantt_revision_decisions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.project_gantt_lifecycle_history FROM authenticated;

DROP POLICY IF EXISTS project_gantt_revisions_select ON public.project_gantt_revisions;
CREATE POLICY project_gantt_revisions_select
  ON public.project_gantt_revisions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_gantt_revision_decisions_select
  ON public.project_gantt_revision_decisions;
CREATE POLICY project_gantt_revision_decisions_select
  ON public.project_gantt_revision_decisions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_gantt_lifecycle_history_select
  ON public.project_gantt_lifecycle_history;
CREATE POLICY project_gantt_lifecycle_history_select
  ON public.project_gantt_lifecycle_history FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.project_gantt_assert_not_locked(
  p_project_entity_id text,
  p_project_record_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_gantt_revisions r
    WHERE r.project_entity_id = p_project_entity_id
      AND r.project_record_id = p_project_record_id
      AND r.status IN (
        'draft', 'leading_review', 'department_review', 'rework', 'approved'
      )
  ) THEN
    RAISE EXCEPTION 'PROJECT_GANTT_APPROVED_SNAPSHOT_LOCKED';
  END IF;
END;
$$;

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
  PERFORM public.project_gantt_assert_not_locked(
    p_project_entity_id, p_project_record_id
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
    project_entity_id, project_record_id, stage_id, name,
    task_start_date, task_due_date, row_order, planned_hours,
    department_id, department_name, status, status_color, is_done,
    assignee_id, assignee_name, assignee_role, created_by
  )
  VALUES (
    p_project_entity_id, p_project_record_id, p_stage_id,
    NULLIF(btrim(p_name), ''), p_start_date, p_due_date, next_order,
    p_planned_hours, p_department_id, p_department_name,
    COALESCE(NULLIF(btrim(p_status), ''), 'В работе'), p_status_color,
    COALESCE(p_is_done, false), p_assignee_id, p_assignee_name,
    p_assignee_role, auth.uid()
  )
  RETURNING * INTO row;

  IF row.name IS NULL THEN
    RAISE EXCEPTION 'Название работы обязательно';
  END IF;
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_project_gantt_leading_department(
  p_project_entity_id text,
  p_project_record_id text,
  p_department_id text,
  p_department_name text,
  p_expected_department_id text DEFAULT NULL
)
RETURNS public.project_gantt_project_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  state public.project_gantt_project_state%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;
  state := public.ensure_project_gantt_project_state(
    p_project_entity_id, p_project_record_id, ''
  );

  IF EXISTS (
    SELECT 1 FROM public.project_gantt_revisions r
    WHERE r.project_entity_id = p_project_entity_id
      AND r.project_record_id = p_project_record_id
      AND r.status IN ('draft', 'leading_review', 'department_review', 'rework', 'approved')
  ) THEN
    RAISE EXCEPTION 'Ведущий отдел нельзя менять при открытой ревизии';
  END IF;

  IF p_expected_department_id IS DISTINCT FROM state.leading_department_id THEN
    RAISE EXCEPTION 'Ожидаемый ведущий отдел устарел';
  END IF;

  UPDATE public.project_gantt_project_state
  SET leading_department_id = NULLIF(btrim(p_department_id), ''),
      leading_department_name = COALESCE(NULLIF(btrim(p_department_name), ''), ''),
      updated_at = now()
  WHERE project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id
  RETURNING * INTO state;

  INSERT INTO public.project_gantt_lifecycle_history (
    project_entity_id, project_record_id, action, comment, actor_id
  ) VALUES (
    p_project_entity_id, p_project_record_id, 'leading_department.change',
    state.leading_department_name, auth.uid()
  );

  RETURN state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_project_gantt_leading_department(
  text, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.start_project_gantt_revision(
  p_project_entity_id text,
  p_project_record_id text,
  p_snapshot jsonb,
  p_content_hash text,
  p_idempotency_key uuid,
  p_created_by_name text DEFAULT NULL,
  p_resubmission_mode text DEFAULT 'initial',
  p_target_department_id text DEFAULT NULL,
  p_target_department_name text DEFAULT NULL
)
RETURNS public.project_gantt_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  state public.project_gantt_project_state%ROWTYPE;
  next_revision integer;
  next_cycle integer;
  row public.project_gantt_revisions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;
  state := public.ensure_project_gantt_project_state(
    p_project_entity_id, p_project_record_id, ''
  );
  IF state.leading_department_id IS NULL THEN
    RAISE EXCEPTION 'Сначала назначьте ведущий отдел';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_gantt_revisions r
    WHERE r.project_entity_id = p_project_entity_id
      AND r.project_record_id = p_project_record_id
      AND r.status IN ('draft', 'leading_review', 'department_review', 'rework', 'approved')
  ) THEN
    RAISE EXCEPTION 'Уже есть открытая ревизия графика';
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1,
         COALESCE(MAX(cycle_number), 0) + CASE
           WHEN p_resubmission_mode = 'initial' THEN 1 ELSE 0
         END
    INTO next_revision, next_cycle
  FROM public.project_gantt_revisions
  WHERE project_entity_id = p_project_entity_id
    AND project_record_id = p_project_record_id;

  IF next_cycle < 1 THEN next_cycle := 1; END IF;
  IF p_resubmission_mode <> 'initial' THEN
    SELECT COALESCE(MAX(cycle_number), 1) INTO next_cycle
    FROM public.project_gantt_revisions
    WHERE project_entity_id = p_project_entity_id
      AND project_record_id = p_project_record_id;
  END IF;

  INSERT INTO public.project_gantt_revisions (
    project_entity_id, project_record_id, revision_number, cycle_number,
    status, resubmission_mode, target_department_id, target_department_name,
    leading_department_id, leading_department_name, content_hash, snapshot,
    created_by, created_by_name
  )
  VALUES (
    p_project_entity_id, p_project_record_id, next_revision, next_cycle,
    'draft', COALESCE(p_resubmission_mode, 'initial'),
    p_target_department_id, p_target_department_name,
    state.leading_department_id, state.leading_department_name,
    COALESCE(p_content_hash, ''), COALESCE(p_snapshot, '{}'::jsonb),
    auth.uid(), p_created_by_name
  )
  RETURNING * INTO row;

  -- Leading department decision row.
  INSERT INTO public.project_gantt_revision_decisions (
    revision_id, project_entity_id, project_record_id,
    department_id, department_name, role, required
  ) VALUES (
    row.id, p_project_entity_id, p_project_record_id,
    state.leading_department_id, COALESCE(state.leading_department_name, ''),
    'leading', true
  );

  -- Participant departments from distinct work-item departments.
  INSERT INTO public.project_gantt_revision_decisions (
    revision_id, project_entity_id, project_record_id,
    department_id, department_name, role, required
  )
  SELECT DISTINCT ON (wi.department_id)
    row.id,
    p_project_entity_id,
    p_project_record_id,
    wi.department_id,
    COALESCE(wi.department_name, ''),
    'participant',
    true
  FROM public.project_work_items wi
  WHERE wi.project_entity_id = p_project_entity_id
    AND wi.project_record_id = p_project_record_id
    AND wi.department_id IS NOT NULL
    AND wi.department_id <> state.leading_department_id
  ORDER BY wi.department_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.project_gantt_lifecycle_history (
    project_entity_id, project_record_id, revision_id, action,
    new_status, actor_id, actor_name
  ) VALUES (
    p_project_entity_id, p_project_record_id, row.id, 'revision.start',
    'draft', auth.uid(), p_created_by_name
  );

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_project_gantt_revision(
  text, text, jsonb, text, uuid, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_project_gantt_revision(
  p_revision_id uuid,
  p_idempotency_key uuid,
  p_actor_name text DEFAULT NULL
)
RETURNS public.project_gantt_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row public.project_gantt_revisions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;

  UPDATE public.project_gantt_revisions
  SET status = 'leading_review',
      submitted_by = auth.uid(),
      submitted_by_name = p_actor_name,
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_revision_id
    AND status IN ('draft', 'rework')
  RETURNING * INTO row;

  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Ревизию нельзя отправить в текущем статусе';
  END IF;

  INSERT INTO public.project_gantt_lifecycle_history (
    project_entity_id, project_record_id, revision_id, action,
    old_status, new_status, actor_id, actor_name
  ) VALUES (
    row.project_entity_id, row.project_record_id, row.id, 'revision.submit',
    'draft', 'leading_review', auth.uid(), p_actor_name
  );

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_project_gantt_revision(uuid, uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_project_gantt_revision(
  p_revision_id uuid,
  p_department_id text,
  p_decision text,
  p_comment text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS public.project_gantt_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row public.project_gantt_revisions%ROWTYPE;
  decision_row public.project_gantt_revision_decisions%ROWTYPE;
  pending_required integer;
  rejected_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Некорректное решение';
  END IF;
  IF p_decision = 'reject' AND NULLIF(btrim(COALESCE(p_comment, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Для отказа обязателен комментарий';
  END IF;

  SELECT * INTO row FROM public.project_gantt_revisions WHERE id = p_revision_id;
  IF row.id IS NULL THEN
    RAISE EXCEPTION 'Ревизия не найдена';
  END IF;

  UPDATE public.project_gantt_revision_decisions
  SET decision = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
      comment = p_comment,
      decided_by = auth.uid(),
      decided_by_name = p_actor_name,
      decided_at = now(),
      updated_at = now()
  WHERE revision_id = p_revision_id
    AND department_id = p_department_id
    AND decision = 'pending'
  RETURNING * INTO decision_row;

  IF decision_row.id IS NULL THEN
    RAISE EXCEPTION 'Решение недоступно для этого отдела';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.project_gantt_revisions
    SET status = 'rework',
        returned_at = now(),
        updated_at = now()
    WHERE id = p_revision_id
    RETURNING * INTO row;

    UPDATE public.project_gantt_revision_decisions
    SET decision = 'superseded', updated_at = now()
    WHERE revision_id = p_revision_id AND decision = 'pending';

    INSERT INTO public.project_gantt_lifecycle_history (
      project_entity_id, project_record_id, revision_id, action,
      old_status, new_status, comment, actor_id, actor_name
    ) VALUES (
      row.project_entity_id, row.project_record_id, row.id, 'revision.reject',
      'leading_review', 'rework', p_comment, auth.uid(), p_actor_name
    );
    RETURN row;
  END IF;

  -- Leading approve moves to department_review.
  IF decision_row.role = 'leading' AND row.status = 'leading_review' THEN
    UPDATE public.project_gantt_revisions
    SET status = 'department_review', updated_at = now()
    WHERE id = p_revision_id
    RETURNING * INTO row;
  END IF;

  SELECT COUNT(*) INTO pending_required
  FROM public.project_gantt_revision_decisions
  WHERE revision_id = p_revision_id
    AND required
    AND decision = 'pending';

  SELECT COUNT(*) INTO rejected_count
  FROM public.project_gantt_revision_decisions
  WHERE revision_id = p_revision_id AND decision = 'rejected';

  IF pending_required = 0 AND rejected_count = 0 THEN
    UPDATE public.project_gantt_revisions
    SET status = 'approved', approved_at = now(), updated_at = now()
    WHERE id = p_revision_id
    RETURNING * INTO row;

    -- Auto-publish on full approval.
    UPDATE public.project_gantt_revisions
    SET status = 'published',
        published_at = now(),
        published_by = auth.uid(),
        published_by_name = p_actor_name,
        updated_at = now()
    WHERE id = p_revision_id
    RETURNING * INTO row;

    UPDATE public.project_gantt_revisions
    SET status = 'superseded', updated_at = now()
    WHERE project_entity_id = row.project_entity_id
      AND project_record_id = row.project_record_id
      AND status = 'published'
      AND id <> row.id;

    UPDATE public.project_work_items
    SET is_operationally_published = true,
        published_gantt_revision_id = row.id,
        updated_at = now()
    WHERE project_entity_id = row.project_entity_id
      AND project_record_id = row.project_record_id;

    UPDATE public.project_gantt_project_state
    SET published_gantt_revision_id = row.id,
        operational_plan_state = 'published',
        baseline_gantt_revision_id = COALESCE(baseline_gantt_revision_id, row.id),
        baseline_gantt_fixed_at = COALESCE(baseline_gantt_fixed_at, now()),
        baseline_gantt_fixed_by = COALESCE(baseline_gantt_fixed_by, auth.uid()),
        baseline_gantt_fixed_by_name = COALESCE(
          baseline_gantt_fixed_by_name, p_actor_name
        ),
        updated_at = now()
    WHERE project_entity_id = row.project_entity_id
      AND project_record_id = row.project_record_id;

    INSERT INTO public.project_gantt_lifecycle_history (
      project_entity_id, project_record_id, revision_id, action,
      old_status, new_status, actor_id, actor_name
    ) VALUES (
      row.project_entity_id, row.project_record_id, row.id, 'revision.approve',
      'department_review', 'published', auth.uid(), p_actor_name
    );
  ELSE
    INSERT INTO public.project_gantt_lifecycle_history (
      project_entity_id, project_record_id, revision_id, action,
      comment, actor_id, actor_name
    ) VALUES (
      row.project_entity_id, row.project_record_id, row.id, 'revision.approve',
      p_comment, auth.uid(), p_actor_name
    );
  END IF;

  RETURN row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_project_gantt_revision(
  uuid, text, text, text, uuid, text
) TO authenticated;
