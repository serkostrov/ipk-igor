/** Stored in `AutomationTaskTemplate.materials` — no extra DB column. */
export const AUTOMATION_REQUIRE_TIME_TRACKING = "requireTimeTracking";

export function automationRequiresTimeTracking(
  materials: string[] | undefined | null,
): boolean {
  return (materials ?? []).includes(AUTOMATION_REQUIRE_TIME_TRACKING);
}

export function setAutomationRequireTimeTracking(
  materials: string[],
  required: boolean,
): string[] {
  const next = materials.filter(
    (item) => item !== AUTOMATION_REQUIRE_TIME_TRACKING,
  );
  if (required) next.push(AUTOMATION_REQUIRE_TIME_TRACKING);
  return next;
}
