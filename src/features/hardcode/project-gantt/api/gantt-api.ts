import { supabase } from "@/shared/api/supabase";
import {
  PROJECT_GANTT_ACTION_IDS,
  PROJECT_GANTT_LIMITS,
  type ProjectGanttComparison,
  type ProjectGanttSnapshot,
  type ProjectGanttStage,
  type ProjectGanttSubtask,
  type ProjectGanttWorkItem,
  type ProjectWorkItemDependency,
  type WorkItemDependencyType,
} from "../model/contracts";

function requireClient() {
  if (!supabase) throw new Error("Supabase не настроен");
  return supabase;
}

type StageRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
};

type WorkItemRow = {
  id: string;
  stage_id: string | null;
  name: string;
  task_start_date: string | null;
  task_due_date: string | null;
  row_order: number;
  planned_hours: number | null;
  department_id: string | null;
  department_name: string | null;
  status: string;
  status_color: string | null;
  is_done: boolean;
  completion_percent: number;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_role: string | null;
};

type SubtaskRow = {
  id: string;
  work_item_id: string | null;
  title: string;
  due_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_role: string | null;
  status: string;
  status_color: string | null;
  is_done: boolean;
};

type DependencyRow = {
  id: string;
  project_record_id: string;
  predecessor_work_item_id: string;
  successor_work_item_id: string;
  dependency_type: WorkItemDependencyType;
  lag_business_days: number;
};

type StateRow = {
  project_title: string;
  leading_department_id: string | null;
  leading_department_name: string | null;
  published_gantt_revision_id: string | null;
  baseline_gantt_revision_id: string | null;
  baseline_gantt_fixed_at: string | null;
  baseline_gantt_fixed_by: string | null;
  baseline_gantt_fixed_by_name: string | null;
  operational_plan_state: string;
};

function mapStage(row: StageRow): ProjectGanttStage {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    sortOrder: row.sort_order,
  };
}

function mapWorkItem(row: WorkItemRow): ProjectGanttWorkItem {
  return {
    id: row.id,
    stageId: row.stage_id,
    rowOrder: row.row_order,
    name: row.name,
    startDate: row.task_start_date,
    endDate: row.task_due_date,
    plannedHours: row.planned_hours,
    departmentName: row.department_name,
    departmentId: row.department_id,
    assignees: row.assignee_id
      ? [
          {
            id: row.assignee_id,
            name: row.assignee_name ?? "Без имени",
            role: row.assignee_role,
          },
        ]
      : [],
    status: row.status,
    statusColor: row.status_color,
    isDone: row.is_done,
    completionPercent: row.completion_percent,
  };
}

function mapSubtask(row: SubtaskRow): ProjectGanttSubtask {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    title: row.title,
    dueDate: row.due_date,
    assignee: row.assignee_id
      ? {
          id: row.assignee_id,
          name: row.assignee_name ?? "Без имени",
          role: row.assignee_role,
        }
      : null,
    status: row.status,
    statusColor: row.status_color,
    isDone: row.is_done,
  };
}

function mapDependency(row: DependencyRow): ProjectWorkItemDependency {
  return {
    id: row.id,
    projectId: row.project_record_id,
    predecessorWorkItemId: row.predecessor_work_item_id,
    successorWorkItemId: row.successor_work_item_id,
    dependencyType: row.dependency_type,
    lagBusinessDays: row.lag_business_days,
  };
}

async function loadFactSnapshot(
  projectEntityId: string,
  projectRecordId: string,
  projectTitle: string,
  canEdit: boolean,
  scopeDepartmentId?: string | null,
): Promise<ProjectGanttSnapshot> {
  const client = requireClient();

  await client.rpc("ensure_project_gantt_project_state", {
    p_project_entity_id: projectEntityId,
    p_project_record_id: projectRecordId,
    p_project_title: projectTitle,
  });

  const [stateRes, stagesRes, itemsRes, subtasksRes, depsRes] =
    await Promise.all([
      client
        .from("project_gantt_project_state")
        .select(
          "project_title, leading_department_id, leading_department_name, published_gantt_revision_id, baseline_gantt_revision_id, baseline_gantt_fixed_at, baseline_gantt_fixed_by, baseline_gantt_fixed_by_name, operational_plan_state",
        )
        .eq("project_entity_id", projectEntityId)
        .eq("project_record_id", projectRecordId)
        .maybeSingle(),
      client
        .from("project_stages")
        .select("id, name, start_date, end_date, sort_order")
        .eq("project_entity_id", projectEntityId)
        .eq("project_record_id", projectRecordId)
        .order("sort_order", { ascending: true })
        .limit(PROJECT_GANTT_LIMITS.stages + 1),
      client
        .from("project_work_items")
        .select(
          "id, stage_id, name, task_start_date, task_due_date, row_order, planned_hours, department_id, department_name, status, status_color, is_done, completion_percent, assignee_id, assignee_name, assignee_role",
        )
        .eq("project_entity_id", projectEntityId)
        .eq("project_record_id", projectRecordId)
        .order("row_order", { ascending: true })
        .limit(PROJECT_GANTT_LIMITS.workItems + 1),
      client
        .from("project_gantt_subtasks")
        .select(
          "id, work_item_id, title, due_date, assignee_id, assignee_name, assignee_role, status, status_color, is_done",
        )
        .eq("project_entity_id", projectEntityId)
        .eq("project_record_id", projectRecordId)
        .limit(PROJECT_GANTT_LIMITS.subtasks + 1),
      client
        .from("project_work_item_dependencies")
        .select(
          "id, project_record_id, predecessor_work_item_id, successor_work_item_id, dependency_type, lag_business_days",
        )
        .eq("project_entity_id", projectEntityId)
        .eq("project_record_id", projectRecordId)
        .limit(PROJECT_GANTT_LIMITS.dependencies + 1),
    ]);

  if (stateRes.error) throw stateRes.error;
  if (stagesRes.error) throw stagesRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (subtasksRes.error) throw subtasksRes.error;
  if (depsRes.error) throw depsRes.error;

  const state = stateRes.data as StateRow | null;
  const stages = (stagesRes.data ?? []) as StageRow[];
  let workItems = (itemsRes.data ?? []) as WorkItemRow[];
  let subtasks = (subtasksRes.data ?? []) as SubtaskRow[];
  let dependencies = (depsRes.data ?? []) as DependencyRow[];

  // Department-scoped projection for review-only / dept-head roles.
  if (scopeDepartmentId) {
    const allowed = new Set(
      workItems
        .filter(
          (item) =>
            item.department_id === scopeDepartmentId ||
            item.department_name === scopeDepartmentId,
        )
        .map((item) => item.id),
    );
    workItems = workItems.filter((item) => allowed.has(item.id));
    subtasks = subtasks.filter(
      (task) => task.work_item_id != null && allowed.has(task.work_item_id),
    );
    dependencies = dependencies.filter(
      (dep) =>
        allowed.has(dep.predecessor_work_item_id) &&
        allowed.has(dep.successor_work_item_id),
    );
  }

  return {
    availableActions: canEdit ? [...PROJECT_GANTT_ACTION_IDS] : [],
    project: {
      id: projectRecordId,
      title: state?.project_title || projectTitle || "Проект",
      status:
        state?.operational_plan_state === "published"
          ? "Опубликован"
          : "Черновик",
      startDate: null,
      gip: null,
      manager: null,
      leadingDepartment:
        state?.leading_department_id != null
          ? {
              id: state.leading_department_id,
              name: state.leading_department_name ?? "",
            }
          : null,
    },
    stages: stages.slice(0, PROJECT_GANTT_LIMITS.stages).map(mapStage),
    workItems: workItems
      .slice(0, PROJECT_GANTT_LIMITS.workItems)
      .map(mapWorkItem),
    subtasks: subtasks.slice(0, PROJECT_GANTT_LIMITS.subtasks).map(mapSubtask),
    dependencies: dependencies
      .slice(0, PROJECT_GANTT_LIMITS.dependencies)
      .map(mapDependency),
    truncated: {
      stages: stages.length > PROJECT_GANTT_LIMITS.stages,
      workItems: workItems.length > PROJECT_GANTT_LIMITS.workItems,
      subtasks: subtasks.length > PROJECT_GANTT_LIMITS.subtasks,
      dependencies: dependencies.length > PROJECT_GANTT_LIMITS.dependencies,
    },
  };
}

export async function fetchProjectGanttComparison(input: {
  projectEntityId: string;
  projectRecordId: string;
  projectTitle: string;
  canEditSchedule?: boolean;
  /** When set, fact snapshot is limited to this department's work items. */
  scopeDepartmentId?: string | null;
}): Promise<ProjectGanttComparison> {
  const client = requireClient();
  const fact = await loadFactSnapshot(
    input.projectEntityId,
    input.projectRecordId,
    input.projectTitle,
    input.canEditSchedule ?? true,
    input.scopeDepartmentId,
  );

  const { data: state, error: stateError } = await client
    .from("project_gantt_project_state")
    .select(
      "baseline_gantt_revision_id, baseline_gantt_fixed_at, baseline_gantt_fixed_by, baseline_gantt_fixed_by_name",
    )
    .eq("project_entity_id", input.projectEntityId)
    .eq("project_record_id", input.projectRecordId)
    .maybeSingle();
  if (stateError) throw stateError;

  if (!state?.baseline_gantt_revision_id || !state.baseline_gantt_fixed_at) {
    return { baseline: null, fact };
  }

  const { data: revision, error: revisionError } = await client
    .from("project_gantt_revisions")
    .select("id, revision_number, snapshot")
    .eq("id", state.baseline_gantt_revision_id)
    .maybeSingle();
  if (revisionError) throw revisionError;
  if (!revision?.snapshot) return { baseline: null, fact };

  const snapshot = revision.snapshot as ProjectGanttSnapshot;
  return {
    baseline: {
      revisionId: revision.id,
      revisionNumber: revision.revision_number,
      fixedAt: state.baseline_gantt_fixed_at,
      fixedBy: {
        id: state.baseline_gantt_fixed_by ?? "",
        name: state.baseline_gantt_fixed_by_name ?? "Система",
        role: null,
      },
      evidenceHistoryId: revision.id,
      snapshot,
    },
    fact,
  };
}

export async function createProjectGanttDependency(input: {
  projectEntityId: string;
  projectRecordId: string;
  predecessorWorkItemId: string;
  successorWorkItemId: string;
  dependencyType: WorkItemDependencyType;
  lagBusinessDays?: number;
}): Promise<ProjectWorkItemDependency> {
  const client = requireClient();
  const { data, error } = await client.rpc("create_project_gantt_dependency", {
    p_project_entity_id: input.projectEntityId,
    p_project_record_id: input.projectRecordId,
    p_predecessor_work_item_id: input.predecessorWorkItemId,
    p_successor_work_item_id: input.successorWorkItemId,
    p_dependency_type: input.dependencyType,
    p_lag_business_days: input.lagBusinessDays ?? 0,
  });
  if (error) throw error;
  const row = data as DependencyRow;
  return mapDependency(row);
}

export async function deleteProjectGanttDependency(input: {
  projectEntityId: string;
  projectRecordId: string;
  dependencyId: string;
}): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("delete_project_gantt_dependency", {
    p_project_entity_id: input.projectEntityId,
    p_project_record_id: input.projectRecordId,
    p_dependency_id: input.dependencyId,
  });
  if (error) throw error;
}

export async function reorderProjectGanttWorkItem(input: {
  projectEntityId: string;
  projectRecordId: string;
  workItemId: string;
  stageId: string | null;
  direction: "up" | "down";
  expectedOrder: string[];
  idempotencyKey: string;
}): Promise<{ changed: boolean; workItemOrder: string[]; replayed: boolean }> {
  const client = requireClient();
  const { data, error } = await client.rpc("reorder_project_gantt_work_item", {
    p_project_entity_id: input.projectEntityId,
    p_project_record_id: input.projectRecordId,
    p_work_item_id: input.workItemId,
    p_stage_id: input.stageId,
    p_direction: input.direction,
    p_expected_order: input.expectedOrder,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const result = data as {
    changed: boolean;
    workItemOrder: string[];
    replayed: boolean;
  };
  return result;
}

export async function rescheduleProjectGanttWorkItem(input: {
  projectEntityId: string;
  projectRecordId: string;
  workItemId: string;
  newStartDate: string | null;
  newEndDate: string | null;
  idempotencyKey: string;
}): Promise<{ changedCount: number; replayed: boolean }> {
  const client = requireClient();
  const { data, error } = await client.rpc(
    "reschedule_project_gantt_work_item",
    {
      p_project_entity_id: input.projectEntityId,
      p_project_record_id: input.projectRecordId,
      p_work_item_id: input.workItemId,
      p_new_start_date: input.newStartDate,
      p_new_end_date: input.newEndDate,
      p_idempotency_key: input.idempotencyKey,
    },
  );
  if (error) throw error;
  const result = data as { changedCount: number; replayed: boolean };
  return result;
}
