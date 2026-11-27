import {
  canEntity,
  filterVisibleEntityRecords,
  useCurrentRole,
} from "@/entities/access";
import {
  getCurrentUserRecordId,
  getEntityRecordById,
  useEntityConfig,
  useEntityValueContext,
} from "@/entities/entity";
import {
  useNotificationInbox,
  type Notification,
} from "@/entities/notification";
import { getSessionUser } from "@/entities/session";
import { useAsyncValue } from "@/shared/hooks/use-async-value";

/** Inbox rows whose record the current role is allowed to see. */
export function useVisibleNotifications(): Notification[] {
  const inbox = useNotificationInbox();
  const { entities } = useEntityConfig();
  const role = useCurrentRole();
  const valueContext = useEntityValueContext();
  const visible = useAsyncValue(async () => {
    const authUserId = getSessionUser()?.id ?? null;
    const currentUserRecordId = getCurrentUserRecordId();
    const kept: Notification[] = [];
    for (const item of inbox) {
      if (!item.entityId || !item.recordId) {
        kept.push(item);
        continue;
      }
      const entity = entities.find((entry) => entry.id === item.entityId);
      if (!entity || !canEntity(role, entity.id, "read")) continue;
      const record = await getEntityRecordById(entity, item.recordId);
      if (!record) continue;
      const rows = await filterVisibleEntityRecords(role, entity, [record], {
        entities,
        authUserId,
        currentUserRecordId,
        valueContext,
      });
      if (rows.length > 0) kept.push(item);
    }
    return kept;
  }, [entities, inbox, role, valueContext]);
  if (visible.status === "error") throw visible.error;
  return visible.status === "ready" ? visible.value : [];
}
