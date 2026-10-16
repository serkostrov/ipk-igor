import type { ReactNode } from "react";
import { AutomationBuilder } from "./AutomationBuilder";

export function AutomationSettings({ leading }: { leading?: ReactNode }) {
  return <AutomationBuilder leading={leading} />;
}
