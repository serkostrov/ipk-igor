import {
  businessDaysUntil,
  extractIsoDate,
  todayIsoDate,
} from "@/shared/lib/business-days";
import { pluralRu } from "@/shared/lib/plural";
import { isEntityListOptionFinal } from "./list-process";
import type { Entity, EntityField, EntityRecord } from "./types";
import { getEntityListOption, resolveEntityListFieldOptions } from "./types";

export type EntityDeadlineStatus =
  "none" | "done" | "overdue" | "today" | "soon" | "preliminary" | "normal";

export type EntityDeadlineState = {
  status: EntityDeadlineStatus;
  /** Business days left for `soon` (1–3). */
  daysLeft: number | null;
};

const SOON_BUSINESS_DAYS = 3;

export function getEntityDeadlineLabel(state: EntityDeadlineState): string {
  switch (state.status) {
    case "overdue":
      return "Просрочено";
    case "today":
      return "Сегодня";
    case "soon":
      return `${state.daysLeft} ${pluralRu(state.daysLeft ?? 0, "день", "дня", "дней")}`;
    case "preliminary":
      return "Предварительно";
    case "done":
      return "Готово";
    case "normal":
      return "В срок";
    default:
      return "Нет срока";
  }
}

/** Whether the record is done by the deadline settings of `field`. */
export function isEntityDeadlineDone(
  entity: Pick<Entity, "fields">,
  record: EntityRecord,
  field: EntityField,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields">>,
): boolean {
  const config = field.deadline;
  if (!config) return false;
  if (config.doneBooleanFieldId) {
    if (record.values[config.doneBooleanFieldId] === "true") return true;
  }
  if (config.doneListFieldId) {
    const listField = entity.fields.find(
      (item) => item.id === config.doneListFieldId,
    );
    if (listField?.type === "list") {
      const option = getEntityListOption(
        resolveEntityListFieldOptions(listField, entities),
        record.values[listField.id],
      );
      if (isEntityListOptionFinal(option)) return true;
    }
  }
  return false;
}

/** Computed due status of a date field with «Контроль срока». */
export function getEntityDeadlineState(
  entity: Pick<Entity, "fields">,
  record: EntityRecord,
  field: EntityField,
  entities: ReadonlyArray<Pick<Entity, "id" | "fields">>,
  today: string = todayIsoDate(),
): EntityDeadlineState {
  const date = extractIsoDate(record.values[field.id]);
  if (!date) return { status: "none", daysLeft: null };
  if (isEntityDeadlineDone(entity, record, field, entities)) {
    return { status: "done", daysLeft: null };
  }
  if (date < today) return { status: "overdue", daysLeft: null };
  if (date === today) return { status: "today", daysLeft: 0 };
  const daysLeft = businessDaysUntil(date, today);
  if (daysLeft != null && daysLeft >= 1 && daysLeft <= SOON_BUSINESS_DAYS) {
    return { status: "soon", daysLeft };
  }
  const preliminaryId = field.deadline?.preliminaryFieldId;
  if (preliminaryId && record.values[preliminaryId] === "true") {
    return { status: "preliminary", daysLeft };
  }
  return { status: "normal", daysLeft };
}
