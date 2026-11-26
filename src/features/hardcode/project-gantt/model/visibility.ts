import {
  explicitTabEdit,
  explicitTabView,
  isAdminRole,
  type Role,
} from "@/entities/access";
import { PROJECT_GANTT_HARDCODE_TAB_ID } from "./gantt-tab";

export type ProjectGanttVisibility = {
  /** Show the График tab on project records. */
  showGanttTab: boolean;
  /**
   * Restrict a **Projects** record page to the «График» tab only
   * (department-head review). Never apply on other entities — there is no
   * gantt hardcode tab there, and filtering would hide every real tab
   * (e.g. «Расчёты отделов» on «Разбор ТКП»).
   */
  ganttReviewOnly: boolean;
  /** Can mutate schedule (deps, reorder, work items). */
  canEditSchedule: boolean;
  /** Can run lifecycle commands. */
  canManageLifecycle: boolean;
  /**
   * When set, fact snapshot is limited to this department id/name
   * (dept-head review projection).
   */
  scopeDepartmentId: string | null;
};

function normalizeRoleName(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

/**
 * Role gates for project gantt. Admins and managers get full access;
 * department heads can review; others see read-only chart when tab is shown.
 */
export function resolveProjectGanttVisibility(
  role: Role | null | undefined,
  entityId?: string | null,
): ProjectGanttVisibility {
  const base = resolveProjectGanttVisibilityByName(role);
  if (!entityId) return base;
  const view = explicitTabView(role, entityId, PROJECT_GANTT_HARDCODE_TAB_ID);
  const edit = explicitTabEdit(role, entityId, PROJECT_GANTT_HARDCODE_TAB_ID);
  if (view == null && edit == null) return base;
  return {
    ...base,
    showGanttTab: view ?? base.showGanttTab,
    ganttReviewOnly: view === false ? false : base.ganttReviewOnly,
    canEditSchedule: edit ?? base.canEditSchedule,
  };
}

function resolveProjectGanttVisibilityByName(
  role: Role | null | undefined,
): ProjectGanttVisibility {
  if (isAdminRole(role)) {
    return {
      showGanttTab: true,
      ganttReviewOnly: false,
      canEditSchedule: true,
      canManageLifecycle: true,
      scopeDepartmentId: null,
    };
  }

  const name = normalizeRoleName(role?.name ?? "");
  const isManager =
    name.includes("менеджер") ||
    name.includes("гип") ||
    (name.includes("руковод") && name.includes("проект"));
  const isDeptHead =
    name.includes("руководитель отдела") ||
    (name.includes("руковод") && name.includes("отдел"));

  if (isManager) {
    return {
      showGanttTab: true,
      ganttReviewOnly: false,
      canEditSchedule: true,
      canManageLifecycle: true,
      scopeDepartmentId: null,
    };
  }

  if (isDeptHead) {
    return {
      showGanttTab: true,
      ganttReviewOnly: true,
      canEditSchedule: false,
      canManageLifecycle: true,
      // Soft scope key from role name; refined when dept catalog is wired.
      scopeDepartmentId: null,
    };
  }

  return {
    showGanttTab: true,
    ganttReviewOnly: false,
    canEditSchedule: false,
    canManageLifecycle: false,
    scopeDepartmentId: null,
  };
}
