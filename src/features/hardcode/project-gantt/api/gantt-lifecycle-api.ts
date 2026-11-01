import { supabase } from "@/shared/api/supabase";
import type {
  ProjectGanttLifecycle,
  ProjectGanttLifecycleCommand,
  ProjectGanttRevisionStatus,
  ProjectGanttResubmissionMode,
  ProjectGanttSnapshot,
} from "../model/contracts";

function requireClient() {
  if (!supabase) throw new Error("Supabase не настроен");
  return supabase;
}

type RevisionRow = {
  id: string;
  revision_number: number;
  cycle_number: number;
  status: ProjectGanttRevisionStatus;
  resubmission_mode: ProjectGanttResubmissionMode;
  target_department_id: string | null;
  target_department_name: string | null;
  content_hash: string;
  created_by: string | null;
  created_by_name: string | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  published_by: string | null;
  published_by_name: string | null;
  submitted_at: string | null;
  returned_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
};

type DecisionRow = {
  id: string;
  revision_id: string;
  department_id: string;
  department_name: string;
  role: "leading" | "participant";
  required: boolean;
  decision: "pending" | "approved" | "rejected" | "superseded";
  comment: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
};

type HistoryRow = {
  id: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  comment: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

function mapRevision(row: RevisionRow) {
  return {
    id: row.id,
    issuanceId: null,
    revisionNumber: row.revision_number,
    cycleNumber: row.cycle_number,
    status: row.status,
    resubmissionMode: row.resubmission_mode,
    targetDepartment:
      row.target_department_id != null
        ? {
            id: row.target_department_id,
            name: row.target_department_name ?? "",
          }
        : null,
    contentHash: row.content_hash,
    createdBy: {
      id: row.created_by ?? "",
      name: row.created_by_name ?? "Система",
      role: null,
    },
    submittedBy: row.submitted_by
      ? {
          id: row.submitted_by,
          name: row.submitted_by_name ?? "Система",
          role: null,
        }
      : null,
    publishedBy: row.published_by
      ? {
          id: row.published_by,
          name: row.published_by_name ?? "Система",
          role: null,
        }
      : null,
    submittedAt: row.submitted_at,
    returnedAt: row.returned_at,
    approvedAt: row.approved_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function mapDecision(row: DecisionRow, canDecide: boolean) {
  return {
    recipientId: row.id,
    department: { id: row.department_id, name: row.department_name },
    role: row.role,
    required: row.required,
    decision: row.decision,
    source: "direct" as const,
    carriedFromRecipientId: null,
    comment: row.comment,
    decidedBy: row.decided_by
      ? {
          id: row.decided_by,
          name: row.decided_by_name ?? "Система",
          role: null,
        }
      : null,
    decidedAt: row.decided_at,
    availableActions:
      canDecide && row.decision === "pending"
        ? (["approve", "reject"] as Array<"approve" | "reject">)
        : [],
  };
}

function resolveAvailableCommands(input: {
  leadingDepartmentId: string | null;
  currentStatus: ProjectGanttRevisionStatus | null;
  canManage: boolean;
  hasPendingDecision: boolean;
}): ProjectGanttLifecycleCommand[] {
  if (!input.canManage) return [];
  const commands: ProjectGanttLifecycleCommand[] = [];
  if (!input.currentStatus) {
    commands.push("leading_department.change");
    if (input.leadingDepartmentId) commands.push("revision.start");
    return commands;
  }
  if (input.currentStatus === "draft" || input.currentStatus === "rework") {
    commands.push("revision.submit");
  }
  if (
    input.currentStatus === "leading_review" ||
    input.currentStatus === "department_review"
  ) {
    if (input.hasPendingDecision) {
      commands.push("revision.approve", "revision.reject");
    }
  }
  if (
    input.currentStatus === "published" ||
    input.currentStatus === "superseded"
  ) {
    commands.push("leading_department.change", "revision.start");
  }
  return commands;
}

export async function fetchProjectGanttLifecycle(input: {
  projectEntityId: string;
  projectRecordId: string;
  canManageLifecycle?: boolean;
}): Promise<ProjectGanttLifecycle> {
  const client = requireClient();
  const canManage = input.canManageLifecycle ?? false;

  const [stateRes, revisionsRes, historyRes] = await Promise.all([
    client
      .from("project_gantt_project_state")
      .select(
        "leading_department_id, leading_department_name, published_gantt_revision_id, baseline_gantt_revision_id, baseline_gantt_fixed_at, baseline_gantt_fixed_by, baseline_gantt_fixed_by_name",
      )
      .eq("project_entity_id", input.projectEntityId)
      .eq("project_record_id", input.projectRecordId)
      .maybeSingle(),
    client
      .from("project_gantt_revisions")
      .select(
        "id, revision_number, cycle_number, status, resubmission_mode, target_department_id, target_department_name, content_hash, created_by, created_by_name, submitted_by, submitted_by_name, published_by, published_by_name, submitted_at, returned_at, approved_at, published_at, created_at",
      )
      .eq("project_entity_id", input.projectEntityId)
      .eq("project_record_id", input.projectRecordId)
      .order("revision_number", { ascending: false }),
    client
      .from("project_gantt_lifecycle_history")
      .select(
        "id, action, old_status, new_status, comment, actor_id, actor_name, created_at",
      )
      .eq("project_entity_id", input.projectEntityId)
      .eq("project_record_id", input.projectRecordId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (stateRes.error) throw stateRes.error;
  if (revisionsRes.error) throw revisionsRes.error;
  if (historyRes.error) throw historyRes.error;

  const state = stateRes.data;
  const revisions = (revisionsRes.data ?? []) as RevisionRow[];
  const history = (historyRes.data ?? []) as HistoryRow[];

  const current = revisions.find((row) =>
    [
      "draft",
      "leading_review",
      "department_review",
      "rework",
      "approved",
    ].includes(row.status),
  );
  const published =
    revisions.find((row) => row.id === state?.published_gantt_revision_id) ??
    revisions.find((row) => row.status === "published") ??
    null;

  let decisions: ReturnType<typeof mapDecision>[] = [];
  if (current) {
    const { data: decisionRows, error } = await client
      .from("project_gantt_revision_decisions")
      .select(
        "id, revision_id, department_id, department_name, role, required, decision, comment, decided_by, decided_by_name, decided_at",
      )
      .eq("revision_id", current.id);
    if (error) throw error;
    decisions = ((decisionRows ?? []) as DecisionRow[]).map((row) =>
      mapDecision(row, canManage),
    );
  }

  const revisionHistory = [];
  for (const revision of revisions.slice(0, 20)) {
    const { data: decisionRows, error } = await client
      .from("project_gantt_revision_decisions")
      .select(
        "id, revision_id, department_id, department_name, role, required, decision, comment, decided_by, decided_by_name, decided_at",
      )
      .eq("revision_id", revision.id);
    if (error) throw error;
    revisionHistory.push({
      revision: mapRevision(revision),
      decisions: ((decisionRows ?? []) as DecisionRow[]).map((row) =>
        mapDecision(row, false),
      ),
    });
  }

  return {
    projectId: input.projectRecordId,
    leadingDepartment:
      state?.leading_department_id != null
        ? {
            id: state.leading_department_id,
            name: state.leading_department_name ?? "",
          }
        : null,
    currentRevision: current ? mapRevision(current) : null,
    publishedRevision: published ? mapRevision(published) : null,
    baselineFixation:
      state?.baseline_gantt_revision_id && state.baseline_gantt_fixed_at
        ? {
            revisionId: state.baseline_gantt_revision_id,
            revisionNumber:
              revisions.find((r) => r.id === state.baseline_gantt_revision_id)
                ?.revision_number ?? 0,
            fixedAt: state.baseline_gantt_fixed_at,
            fixedBy: {
              id: state.baseline_gantt_fixed_by ?? "",
              name: state.baseline_gantt_fixed_by_name ?? "Система",
              role: null,
            },
            evidenceHistoryId: state.baseline_gantt_revision_id,
          }
        : null,
    decisions,
    revisionHistory,
    history: history.map((row) => ({
      id: row.id,
      action: row.action,
      oldStatus: row.old_status,
      newStatus: row.new_status,
      comment: row.comment,
      actor: {
        id: row.actor_id ?? "",
        name: row.actor_name ?? "Система",
        role: null,
      },
      createdAt: row.created_at,
    })),
    availableCommands: resolveAvailableCommands({
      leadingDepartmentId: state?.leading_department_id ?? null,
      currentStatus: current?.status ?? null,
      canManage,
      hasPendingDecision: decisions.some((d) => d.decision === "pending"),
    }),
  };
}

export async function setProjectGanttLeadingDepartment(input: {
  projectEntityId: string;
  projectRecordId: string;
  departmentId: string;
  departmentName: string;
  expectedDepartmentId?: string | null;
}): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("set_project_gantt_leading_department", {
    p_project_entity_id: input.projectEntityId,
    p_project_record_id: input.projectRecordId,
    p_department_id: input.departmentId,
    p_department_name: input.departmentName,
    p_expected_department_id: input.expectedDepartmentId ?? null,
  });
  if (error) throw error;
}

export async function startProjectGanttRevision(input: {
  projectEntityId: string;
  projectRecordId: string;
  snapshot: ProjectGanttSnapshot;
  contentHash: string;
  idempotencyKey: string;
  createdByName?: string | null;
  resubmissionMode?: ProjectGanttResubmissionMode;
  targetDepartmentId?: string | null;
  targetDepartmentName?: string | null;
}): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("start_project_gantt_revision", {
    p_project_entity_id: input.projectEntityId,
    p_project_record_id: input.projectRecordId,
    p_snapshot: input.snapshot,
    p_content_hash: input.contentHash,
    p_idempotency_key: input.idempotencyKey,
    p_created_by_name: input.createdByName ?? null,
    p_resubmission_mode: input.resubmissionMode ?? "initial",
    p_target_department_id: input.targetDepartmentId ?? null,
    p_target_department_name: input.targetDepartmentName ?? null,
  });
  if (error) throw error;
}

export async function submitProjectGanttRevision(input: {
  revisionId: string;
  idempotencyKey: string;
  actorName?: string | null;
}): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("submit_project_gantt_revision", {
    p_revision_id: input.revisionId,
    p_idempotency_key: input.idempotencyKey,
    p_actor_name: input.actorName ?? null,
  });
  if (error) throw error;
}

export async function decideProjectGanttRevision(input: {
  revisionId: string;
  departmentId: string;
  decision: "approve" | "reject";
  comment?: string | null;
  idempotencyKey: string;
  actorName?: string | null;
}): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("decide_project_gantt_revision", {
    p_revision_id: input.revisionId,
    p_department_id: input.departmentId,
    p_decision: input.decision,
    p_comment: input.comment ?? null,
    p_idempotency_key: input.idempotencyKey,
    p_actor_name: input.actorName ?? null,
  });
  if (error) throw error;
}
