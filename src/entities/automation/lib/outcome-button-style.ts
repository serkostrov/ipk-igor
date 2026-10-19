import type { CSSProperties } from "react";
import { normalizeListColor } from "@/entities/entity";

/** Solid accent style for a task result button with a custom color. */
export function automationOutcomeButtonStyle(
  color: string | null | undefined,
): CSSProperties | undefined {
  const raw = color?.trim();
  if (!raw) return undefined;
  const accent = normalizeListColor(raw);
  return {
    backgroundColor: accent,
    borderColor: accent,
    color: "#fff",
  };
}

/** Soft chip style for the builder outcome list. */
export function automationOutcomeChipStyle(
  color: string | null | undefined,
  selected: boolean,
): CSSProperties | undefined {
  const raw = color?.trim();
  if (!raw) return undefined;
  const accent = normalizeListColor(raw);
  return {
    backgroundColor: `color-mix(in srgb, ${accent} ${selected ? 18 : 10}%, transparent)`,
    borderColor: `color-mix(in srgb, ${accent} ${selected ? 55 : 35}%, transparent)`,
    color: "var(--foreground)",
    boxShadow: selected
      ? `0 0 0 1px color-mix(in srgb, ${accent} 35%, transparent)`
      : undefined,
  };
}
