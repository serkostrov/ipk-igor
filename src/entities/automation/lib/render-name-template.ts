/** Replace `{{fieldId}}` placeholders with record values. */
export function renderAutomationNameTemplate(
  template: string,
  values: Record<string, string | undefined>,
  fallbackName: string,
): string {
  const source = template.trim() || fallbackName;
  return source.replace(/\{\{([^}]+)\}\}/g, (_, rawId: string) => {
    const fieldId = rawId.trim();
    const value = values[fieldId];
    if (value == null || value.trim() === "") return "";
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === "string").join(", ");
      }
    } catch {
      // plain string
    }
    return value;
  });
}
