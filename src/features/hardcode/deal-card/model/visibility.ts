import { explicitTabView, isAdminRole, type Role } from "@/entities/access";
import { DEAL_CALCULATION_TAB_ID } from "./tabs";

export type DealCardVisibility = {
  /** «Расчёт» tab, costs and profitability in the summary. */
  showFinance: boolean;
};

function normalizeRoleName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/**
 * Port of ipk-igor deal card UI policy adapted to Role.name (this CRM has no
 * role codes): finance — owner / admin / manager / finance / accountant.
 * UX only, not a security check.
 */
export function resolveDealCardVisibility(
  role: Role | null | undefined,
  entityId?: string | null,
): DealCardVisibility {
  const base = resolveDealCardVisibilityByName(role);
  if (!entityId) return base;
  const finance = explicitTabView(role, entityId, DEAL_CALCULATION_TAB_ID);
  return { showFinance: finance ?? base.showFinance };
}

function resolveDealCardVisibilityByName(
  role: Role | null | undefined,
): DealCardVisibility {
  if (isAdminRole(role)) return { showFinance: true };

  const name = normalizeRoleName(role?.name ?? "");
  const isOwner = name.includes("генеральн") && name.includes("директор");
  const isFinance = name.includes("финанс") || name.includes("бухгалтер");
  const isManager = name.includes("менеджер");

  return { showFinance: isOwner || isManager || isFinance };
}
