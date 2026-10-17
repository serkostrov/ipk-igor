import {
  AUTOMATION_ASSIGNEE_TYPE_HINTS,
  AUTOMATION_ASSIGNEE_TYPE_LABELS,
  type AutomationAssigneeResolver,
} from "../model/assignee";
import { useRoles } from "@/entities/access";
import {
  SYSTEM_USERS_ENTITY_ID,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  getRelationRecordOptions,
  getSystemUsersEntity,
  parseEntityRelationIds,
  serializeEntityRelationIds,
  useEntityConfig,
  type Entity,
  type EntityField,
} from "@/entities/entity";
import { RelationSelect } from "@/entities/entity/ui/RelationSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

function relationFieldsForAssignee(fields: EntityField[]) {
  const relations = fields.filter((field) => field.type === "relation");
  const toUsers = relations.filter(
    (field) => getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID,
  );
  // Prefer user links; fall back to any relation if none point to Users.
  return toUsers.length > 0 ? toUsers : relations;
}

function firstRelationFieldId(fields: EntityField[]) {
  return relationFieldsForAssignee(fields)[0]?.id ?? "";
}

export function AssigneeEditor({
  value,
  fields,
  onChange,
  compact,
}: {
  value: AutomationAssigneeResolver;
  fields: Entity["fields"];
  onChange: (value: AutomationAssigneeResolver) => void;
  /** Denser layout for nested editors (e.g. notification rules). */
  compact?: boolean;
}) {
  const { entities } = useEntityConfig();
  const roles = useRoles();
  const usersEntity = getSystemUsersEntity(entities);
  const userOptions = getRelationRecordOptions(usersEntity);
  const relationOptions = relationFieldsForAssignee(fields);

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2.5"}>
      <Select
        value={value.type}
        onValueChange={(next) => {
          if (next == null) return;
          const type = String(next) as AutomationAssigneeResolver["type"];
          if (type === "field" || type === "relationFieldFanOut") {
            const fieldId =
              value.type === "field" || value.type === "relationFieldFanOut"
                ? value.fieldId
                : firstRelationFieldId(fields);
            onChange({ type, fieldId });
          } else if (type === "fixedUsers") {
            onChange({
              type,
              userIds: value.type === "fixedUsers" ? value.userIds : [],
            });
          } else if (type === "role") {
            onChange({
              type,
              roleId:
                value.type === "role" ? value.roleId : (roles[0]?.id ?? ""),
            });
          } else if (type === "recordCreator") {
            onChange({ type });
          } else {
            onChange({ type: "currentUser" });
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {AUTOMATION_ASSIGNEE_TYPE_LABELS[value.type]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(
            Object.keys(
              AUTOMATION_ASSIGNEE_TYPE_LABELS,
            ) as AutomationAssigneeResolver["type"][]
          ).map((type) => (
            <SelectItem key={type} value={type}>
              {AUTOMATION_ASSIGNEE_TYPE_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!compact ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {AUTOMATION_ASSIGNEE_TYPE_HINTS[value.type]}
        </p>
      ) : null}

      {value.type === "field" || value.type === "relationFieldFanOut" ? (
        <Select
          value={value.fieldId || undefined}
          onValueChange={(next) => {
            if (next != null) onChange({ ...value, fieldId: String(next) });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Выберите поле связи">
              {relationOptions.find((field) => field.id === value.fieldId)
                ? getEntityFieldDisplayName(
                    relationOptions.find(
                      (field) => field.id === value.fieldId,
                    )!,
                  )
                : "Выберите поле связи"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {relationOptions.length === 0 ? (
              <SelectItem value="__none" disabled>
                Нет полей связи
              </SelectItem>
            ) : (
              relationOptions.map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {getEntityFieldDisplayName(field)}
                  {getEntityRelationTargetId(field) === SYSTEM_USERS_ENTITY_ID
                    ? " · пользователи"
                    : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      ) : null}

      {value.type === "role" ? (
        <Select
          value={value.roleId || undefined}
          onValueChange={(next) => {
            if (next != null) onChange({ type: "role", roleId: String(next) });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Выберите роль">
              {roles.find((role) => role.id === value.roleId)?.name ??
                "Выберите роль"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {roles.length === 0 ? (
              <SelectItem value="__none" disabled>
                Нет ролей
              </SelectItem>
            ) : (
              roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      ) : null}

      {value.type === "fixedUsers" ? (
        <RelationSelect
          options={userOptions}
          value={serializeEntityRelationIds(value.userIds)}
          multiple
          placeholder="Выберите пользователей"
          aria-label="Пользователи"
          onChange={(next) =>
            onChange({
              type: "fixedUsers",
              userIds: parseEntityRelationIds(next),
            })
          }
        />
      ) : null}
    </div>
  );
}
