import { supabase } from "@/shared/api/supabase";
import type {
  ProjectGanttStage,
  ProjectGanttWorkItem,
} from "../model/contracts";

function requireClient() {
  if (!supabase) throw new Error("Supabase не настроен");
  return supabase;
}

export type UpsertProjectStageInput = {
  projectEntityId: string;
  projectRecordId: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  sortOrder?: number | null;
  stageId?: string | null;
};

export type UpsertProjectWorkItemInput = {
  projectEntityId: string;
  projectRecordId: string;
  name: string;
  stageId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  plannedHours?: number | null;
  departmentId?: string | null;
  departmentName?: string | null;
  status?: string | null;
  statusColor?: string | null;
  isDone?: boolean | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assigneeRole?: string | null;
  workItemId?: string | null;
};

function mapStage(row: {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
}): ProjectGanttStage {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    sortOrder: row.sort_order,
  };
}

function mapWorkItem(row: {
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
}): ProjectGanttWorkItem {
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

export async function upsertProjectGanttStage(
  input: UpsertProjectStageInput,
): Promise<ProjectGanttStage> {
  const client = requireClient();
  const { data, error } = await client.rpc("upsert_project_gantt_stage", {
    p_project_entity_id: input.projectEntityId,
    p_project_record_id: input.projectRecordId,
    p_name: input.name,
    p_start_date: input.startDate ?? null,
    p_end_date: input.endDate ?? null,
    p_sort_order: input.sortOrder ?? null,
    p_stage_id: input.stageId ?? null,
  });
  if (error) throw error;
  return mapStage(data as Parameters<typeof mapStage>[0]);
}

export async function upsertProjectGanttWorkItem(
  input: UpsertProjectWorkItemInput,
): Promise<ProjectGanttWorkItem> {
  const client = requireClient();
  const { data, error } = await client.rpc("upsert_project_gantt_work_item", {
    p_project_entity_id: input.projectEntityId,
    p_project_record_id: input.projectRecordId,
    p_name: input.name,
    p_stage_id: input.stageId ?? null,
    p_start_date: input.startDate ?? null,
    p_due_date: input.dueDate ?? null,
    p_planned_hours: input.plannedHours ?? null,
    p_department_id: input.departmentId ?? null,
    p_department_name: input.departmentName ?? null,
    p_status: input.status ?? null,
    p_status_color: input.statusColor ?? null,
    p_is_done: input.isDone ?? null,
    p_assignee_id: input.assigneeId ?? null,
    p_assignee_name: input.assigneeName ?? null,
    p_assignee_role: input.assigneeRole ?? null,
    p_work_item_id: input.workItemId ?? null,
  });
  if (error) throw error;
  return mapWorkItem(data as Parameters<typeof mapWorkItem>[0]);
}

export async function deleteProjectGanttWorkItem(input: {
  projectEntityId: string;
  projectRecordId: string;
  workItemId: string;
}): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("delete_project_gantt_work_item", {
    p_project_entity_id: input.projectEntityId,
    p_project_record_id: input.projectRecordId,
    p_work_item_id: input.workItemId,
  });
  if (error) throw error;
}
