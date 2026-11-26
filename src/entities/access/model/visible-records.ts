import {
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityRecords,
  getEntityValueContext,
  type Entity,
} from "@/entities/entity";
import { getSessionUser } from "@/entities/session";
import { getCurrentRole } from "../store/access-store";
import { filterVisibleEntityRecords } from "./permissions";

/**
 * Records of `entity` the current role may see.
 * Display adapters use this so a dashboard cannot sum rows the list would hide.
 */
export async function readVisibleEntityRecords(
  entity: Entity,
): Promise<readonly Entity["records"][number][]> {
  const entities = getEntityConfig().entities;
  const records = await getEntityRecords(entity);
  return filterVisibleEntityRecords(getCurrentRole(), entity, records, {
    entities,
    authUserId: getSessionUser()?.id ?? null,
    currentUserRecordId: getCurrentUserRecordId(),
    valueContext: getEntityValueContext(entities),
  });
}
