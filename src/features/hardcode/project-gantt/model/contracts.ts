export const WORK_ITEM_DEPENDENCY_TYPES = [
  "finish_to_start",
  "start_to_start",
  "finish_to_finish",
  "start_to_finish",
] as const;

export type WorkItemDependencyType =
  (typeof WORK_ITEM_DEPENDENCY_TYPES)[number];

export const FINISH_TO_START_DEPENDENCY_TYPE = WORK_ITEM_DEPENDENCY_TYPES[0];

export const WORK_ITEM_DEPENDENCY_TYPE_LABELS = {
  finish_to_start: "Окончание → начало",
  start_to_start: "Начало → начало",
  finish_to_finish: "Окончание → окончание",
  start_to_finish: "Начало → окончание",
} as const satisfies Record<WorkItemDependencyType, string>;

export const WORK_ITEM_DEPENDENCY_TYPE_CODES = {
  finish_to_start: "FS",
  start_to_start: "SS",
  finish_to_finish: "FF",
  start_to_finish: "SF",
} as const satisfies Record<WorkItemDependencyType, string>;

export function formatDependencyLag(lagBusinessDays: number = 0): string {
  return lagBusinessDays === 0
    ? ""
    : ` (${lagBusinessDays > 0 ? "+" : "−"}${Math.abs(lagBusinessDays)} р.д.)`;
}

export const PROJECT_GANTT_LIMITS = {
  stages: 500,
  workItems: 2_000,
  subtasks: 5_000,
  dependencies: 5_000,
} as const;

export const PROJECT_GANTT_ACTION_IDS = [
  "project_gantt.work_item.reorder",
  "project_gantt.dependency.create",
  "project_gantt.dependency.delete",
] as const;

export type ProjectGanttActionId = (typeof PROJECT_GANTT_ACTION_IDS)[number];

export const PROJECT_GANTT_REVISION_STATUSES = [
  "draft",
  "leading_review",
  "department_review",
  "rework",
  "approved",
  "published",
  "superseded",
] as const;

export type ProjectGanttRevisionStatus =
  (typeof PROJECT_GANTT_REVISION_STATUSES)[number];

export const PROJECT_GANTT_RESUBMISSION_MODES = [
  "initial",
  "targeted",
  "all",
] as const;

export type ProjectGanttResubmissionMode =
  (typeof PROJECT_GANTT_RESUBMISSION_MODES)[number];

export const PROJECT_GANTT_LIFECYCLE_COMMANDS = [
  "leading_department.change",
  "revision.start",
  "revision.submit",
  "revision.approve",
  "revision.reject",
] as const;

export type ProjectGanttLifecycleCommand =
  (typeof PROJECT_GANTT_LIFECYCLE_COMMANDS)[number];

export type ProjectGanttPerson = {
  id: string;
  name: string;
  role: string | null;
};

export type ProjectGanttProject = {
  id: string;
  title: string;
  status: string;
  startDate: string | null;
  gip: ProjectGanttPerson | null;
  manager: ProjectGanttPerson | null;
  leadingDepartment: { id: string; name: string } | null;
};

export type ProjectGanttStage = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
};

export type ProjectGanttWorkItem = {
  id: string;
  stageId: string | null;
  rowOrder: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  plannedHours: number | null;
  departmentName: string | null;
  departmentId: string | null;
  assignees: ProjectGanttPerson[];
  status: string;
  statusColor: string | null;
  isDone: boolean;
  completionPercent: number;
};

export type ProjectGanttSubtask = {
  id: string;
  workItemId: string | null;
  title: string;
  dueDate: string | null;
  assignee: ProjectGanttPerson | null;
  status: string;
  statusColor: string | null;
  isDone: boolean;
};

export type ProjectWorkItemDependency = {
  id: string;
  projectId: string;
  predecessorWorkItemId: string;
  successorWorkItemId: string;
  dependencyType: WorkItemDependencyType;
  lagBusinessDays?: number;
};

export type ProjectGanttSnapshot = {
  availableActions: ProjectGanttActionId[];
  project: ProjectGanttProject;
  stages: ProjectGanttStage[];
  workItems: ProjectGanttWorkItem[];
  subtasks: ProjectGanttSubtask[];
  dependencies: ProjectWorkItemDependency[];
  truncated: {
    stages: boolean;
    workItems: boolean;
    subtasks: boolean;
    dependencies: boolean;
  };
};

export type ProjectGanttApprovalDecision = {
  recipientId: string;
  department: { id: string; name: string };
  role: "leading" | "participant";
  required: boolean;
  decision: "pending" | "approved" | "rejected" | "superseded";
  source: "direct" | "carried" | "auto_gip_department" | null;
  carriedFromRecipientId: string | null;
  comment: string | null;
  decidedBy: ProjectGanttPerson | null;
  decidedAt: string | null;
  availableActions: Array<"approve" | "reject">;
};

export type ProjectGanttRevisionSummary = {
  id: string;
  issuanceId: string | null;
  revisionNumber: number;
  cycleNumber: number;
  status: ProjectGanttRevisionStatus;
  resubmissionMode: ProjectGanttResubmissionMode;
  targetDepartment: { id: string; name: string } | null;
  contentHash: string;
  createdBy: ProjectGanttPerson;
  submittedBy: ProjectGanttPerson | null;
  publishedBy: ProjectGanttPerson | null;
  submittedAt: string | null;
  returnedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type ProjectGanttRevisionHistoryItem = {
  revision: ProjectGanttRevisionSummary;
  decisions: ProjectGanttApprovalDecision[];
};

export type ProjectGanttBaselineFixation = {
  revisionId: string;
  revisionNumber: number;
  fixedAt: string;
  fixedBy: ProjectGanttPerson;
  evidenceHistoryId: string;
};

export type ProjectGanttLifecycleHistoryEntry = {
  id: string;
  action: string;
  oldStatus: string | null;
  newStatus: string | null;
  comment: string | null;
  actor: ProjectGanttPerson;
  createdAt: string;
};

export type ProjectGanttLifecycle = {
  projectId: string;
  leadingDepartment: { id: string; name: string } | null;
  currentRevision: ProjectGanttRevisionSummary | null;
  publishedRevision: ProjectGanttRevisionSummary | null;
  baselineFixation: ProjectGanttBaselineFixation | null;
  decisions: ProjectGanttApprovalDecision[];
  revisionHistory: ProjectGanttRevisionHistoryItem[];
  history: ProjectGanttLifecycleHistoryEntry[];
  availableCommands: ProjectGanttLifecycleCommand[];
};

export type ProjectGanttBaseline = ProjectGanttBaselineFixation & {
  snapshot: ProjectGanttSnapshot;
};

export type ProjectGanttComparison = {
  baseline: ProjectGanttBaseline | null;
  fact: ProjectGanttSnapshot;
};

export type ProjectGanttReorderDirection = "up" | "down";
