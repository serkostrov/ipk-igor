import { isAdminRole, type Role } from "@/entities/access";

export type DealCardVisibility = {
  /** «Расчёт» tab, costs and profitability in the summary. */
  showFinance: boolean;
  /** «Создать проект» from the deal. */
  canCreateProject: boolean;
};

function normalizeRoleName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/**
 * Port of ipk-igor deal card UI policies adapted to Role.name (this CRM has
 * no role codes): finance — owner / admin / manager / finance / accountant;
 * project creation — owner / admin / manager. UX only, not a security check.
 */
export function resolveDealCardVisibility(
  role: Role | null | undefined,
): DealCardVisibility {
  if (isAdminRole(role)) return { showFinance: true, canCreateProject: true };

  const name = normalizeRoleName(role?.name ?? "");
  const isOwner = name.includes("генеральн") && name.includes("директор");
  const isFinance = name.includes("финанс") || name.includes("бухгалтер");
  const isManager = name.includes("менеджер") && !isFinance;

  return {
    showFinance: isOwner || isManager || isFinance,
    canCreateProject: isOwner || isManager,
  };
}
