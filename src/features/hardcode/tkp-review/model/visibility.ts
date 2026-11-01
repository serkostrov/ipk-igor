import { isAdminRole, type Role } from "@/entities/access";

export type TkpReviewCostVisibility = {
  /** Full «Расчёт ГИПа» block (hidden for department heads). */
  showGipCalculation: boolean;
  /**
   * Scope linked «Расчёты отделов» to the viewer’s departments
   * (department-head role). Does not show the GIP summary itself.
   */
  showDepartmentRestrictedTotals: boolean;
  /** View «Цена ТКП» (metrics + history). */
  showCommercialPricing: boolean;
  /**
   * Author «Параметры цены» / new revisions — manager & sysadmin only,
   * and only while creating a price version (enforced in the panel).
   */
  canEditCommercialPricing: boolean;
};

function normalizeRoleName(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/** Role is a department head («руководитель отдела»). */
export function isTkpDepartmentHeadRole(
  role: Role | null | undefined,
): boolean {
  if (isAdminRole(role)) return false;
  const name = normalizeRoleName(role?.name ?? "");
  return (
    name.includes("руководитель отдела") ||
    name === "руководитель" ||
    (name.includes("руковод") && name.includes("отдел"))
  );
}

function isTkpCommercialPricingEditorRole(
  role: Role | null | undefined,
): boolean {
  if (isAdminRole(role)) return true;
  const name = normalizeRoleName(role?.name ?? "");
  return (
    name.includes("менеджер") ||
    name.includes("коммерч") ||
    name.includes("продаж")
  );
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
      canEditCommercialPricing: true,
    };
  }

  if (isTkpDepartmentHeadRole(role)) {
    return {
      showGipCalculation: false,
      showDepartmentRestrictedTotals: true,
      showCommercialPricing: false,
      canEditCommercialPricing: false,
    };
  }

  const name = normalizeRoleName(role?.name ?? "");
  const canEditCommercialPricing = isTkpCommercialPricingEditorRole(role);

  // «Цена ТКП» — всем, кроме руководителей отделов (выше).
  if (name === "гип" || (name.includes("главн") && name.includes("инженер"))) {
    return {
      showGipCalculation: true,
      showDepartmentRestrictedTotals: false,
      showCommercialPricing: true,
      canEditCommercialPricing: false,
    };
  }

  if (canEditCommercialPricing) {
    return {
      showGipCalculation: true,
      showDepartmentRestrictedTotals: false,
      showCommercialPricing: true,
      canEditCommercialPricing: true,
    };
  }

  return {
    showGipCalculation: true,
    showDepartmentRestrictedTotals: false,
    showCommercialPricing: true,
    canEditCommercialPricing: false,
  };
}
