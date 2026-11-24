import type { Role } from "@/entities/access";
import { getRoleConfigurableTabs, type Entity } from "@/entities/entity";

/** Fill missing field/tab ids as allowed; never overwrite explicit denials. */
export function backfillRoleAccessMatrices(
  role: Role,
  entities: Entity[],
): Role {
  if (role.permissions.entities === "*") return role;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  let changed = false;
  const nextEntities = role.permissions.entities.map((access) => {
    const entity = byId.get(access.entityId);
    if (!entity) return access;
    let next = access;
    if (access.fields !== "*") {
      const fields = { ...access.fields };
      let fieldsChanged = false;
      for (const field of entity.fields) {
        if (!fields[field.id]) {
          fields[field.id] = { view: true, edit: true };
          fieldsChanged = true;
        }
      }
      if (fieldsChanged) {
        next = { ...next, fields };
        changed = true;
      }
    }
    if (access.tabs != null && access.tabs !== "*") {
      const tabs = { ...access.tabs };
      let tabsChanged = false;
      for (const tab of getRoleConfigurableTabs(entity.tabs)) {
        if (!tabs[tab.id]) {
          tabs[tab.id] = { view: true, edit: true };
          tabsChanged = true;
        }
      }
      if (tabsChanged) {
        next = { ...next, tabs };
        changed = true;
      }
    }
    return next;
  });
  if (!changed) return role;
  return {
    ...role,
    permissions: { ...role.permissions, entities: nextEntities },
  };
}
