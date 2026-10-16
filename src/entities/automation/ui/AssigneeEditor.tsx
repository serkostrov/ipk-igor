import {
  AUTOMATION_ASSIGNEE_TYPE_LABELS,
  type AutomationAssigneeResolver,
} from "../model/assignee";
import { getEntityFieldDisplayName, type Entity } from "@/entities/entity";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

export function AssigneeEditor({
  value,
  fields,
  onChange,
}: {
  value: AutomationAssigneeResolver;
  fields: Entity["fields"];
  onChange: (value: AutomationAssigneeResolver) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={value.type}
        onValueChange={(next) => {
          if (next == null) return;
          const type = String(next) as AutomationAssigneeResolver["type"];
          if (type === "field" || type === "relationFieldFanOut") {
            onChange({ type, fieldId: fields[0]?.id ?? "" });
          } else if (type === "fixedUsers") {
            onChange({ type, userIds: [] });
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
      {value.type === "field" || value.type === "relationFieldFanOut" ? (
        <Select
          value={value.fieldId}
          onValueChange={(next) => {
            if (next != null) onChange({ ...value, fieldId: String(next) });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {fields.find((field) => field.id === value.fieldId)
                ? getEntityFieldDisplayName(
                    fields.find((field) => field.id === value.fieldId)!,
                  )
                : "Выберите поле"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {fields
              .filter((field) => field.type === "relation")
              .map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {getEntityFieldDisplayName(field)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      ) : null}
      {value.type === "fixedUsers" ? (
        <Input
          placeholder="ID пользователей через запятую"
          value={value.userIds.join(", ")}
          onChange={(event) =>
            onChange({
              type: "fixedUsers",
              userIds: event.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
      ) : null}
    </div>
  );
}
