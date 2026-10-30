import { isAdminRole, type Role } from "@/entities/access";

export type TkpReviewCostVisibility = {
  showGipCalculation: boolean;
  showDepartmentRestrictedTotals: boolean;
  showCommercialPricing: boolean;
};

function normalizeRoleName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/**
 * Port of ipk-new `review-cost-visibility` adapted to Role.name
 * (this CRM has no roleCode).
 */
export function resolveTkpReviewCostVisibility(
  role: Role | null | undefined,
): TkpReviewCostVisibility {
  if (isAdminRole(role)) {
    return {
      showGipCalculation: true,
      showDepartmentRestrictedTotals: false,
      showCommercialPricing: true,
    };
  }

  const name = normalizeRoleName(role?.name ?? "");

  if (
    name.includes("руководитель отдела") ||
    name === "руководитель" ||
    (name.includes("руковод") && name.includes("отдел"))
  ) {
    return {
      showGipCalculation: false,
      showDepartmentRestrictedTotals: true,
      showCommercialPricing: false,
    };
  }

  if (name === "гип" || (name.includes("главн") && name.includes("инженер"))) {
    return {
      showGipCalculation: true,
      showDepartmentRestrictedTotals: false,
      showCommercialPricing: false,
    };
  }

  // Manager / commercial / default with commercial access
  if (
    name.includes("менеджер") ||
    name.includes("коммерч") ||
    name.includes("продаж")
  ) {
    return {
      showGipCalculation: true,
      showDepartmentRestrictedTotals: false,
      showCommercialPricing: true,
    };
  }

  // Fallback: show GIP + commercial (employee-like full view when unnamed)
  return {
    showGipCalculation: true,
    showDepartmentRestrictedTotals: false,
    showCommercialPricing: true,
  };
}
