export type EntityRecordEventAction = "insert" | "update" | "delete";

/** Stored field value before/after the change (raw `field_values` strings). */
export type EntityRecordEventChange = {
  old: string | null;
  new: string | null;
};

export type EntityRecordEvent = {
  id: number;
  entityId: string;
  recordId: string;
  action: EntityRecordEventAction;
  /** Changed field ids (including tab payload keys) → old/new values. */
  changes: Record<string, EntityRecordEventChange>;
  /** Supabase Auth user id of the author; `null` — system. */
  actorId: string | null;
  createdAt: string;
};

export type EntityRecordEventsQuery = {
  recordId?: string;
  entityId?: string;
  actorId?: string;
  /** Inclusive local date `YYYY-MM-DD`. */
  from?: string;
  /** Inclusive local date `YYYY-MM-DD`. */
  to?: string;
};

export type EntityRecordEventsPage = {
  events: EntityRecordEvent[];
  hasMore: boolean;
};
