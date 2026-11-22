import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { addCalendarDays, todayIsoDate } from "@/shared/lib/business-days";
import {
  getRelationRecordOptions,
  getEntityDisplayName,
  getSystemUsersEntity,
  RelationSelect,
  serializeEntityRelationIds,
  parseEntityRelationIds,
  useEntityConfig,
  useEntityValueContext,
  usePageRecordScope,
} from "@/entities/entity";
import { RecordHistoryTable } from "./RecordHistoryTable";
import { EntityHistoryTable } from "./EntityHistoryTable";

const ALL = "__all__";

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.id === value);
  return (
    <Select
      value={value || ALL}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(String(next) === ALL ? "" : String(next));
      }}
    >
      <SelectTrigger className="h-9 w-48" aria-label={label}>
        <SelectValue>
          <span className="truncate">
            <span className="text-muted-foreground">{label}:</span>{" "}
            {selected?.label ?? "все"}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Все</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type HistoryPageProps = {
  onOpenRecord?: (entityId: string, recordId: string) => void;
};

export function HistoryPage({ onOpenRecord }: HistoryPageProps) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const today = todayIsoDate();
  const [from, setFrom] = useState(() => addCalendarDays(today, -30));
  const [to, setTo] = useState(today);
  const [userRecordId, setUserRecordId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [kind, setKind] = useState<"record" | "entity">("record");
  const [recordId, setRecordId] = useState("");

  const users = getSystemUsersEntity(entities);
  const actorId =
    (users
      ? valueContext
          .getRecords(users.id)
          .find((record) => record.id === userRecordId)
      : undefined
    )?.authUserId ?? undefined;
  const entity = entities.find((item) => item.id === entityId);
  // Load records for the filtered entity (+ Users for actor names). Events
  // referencing other entities fall back to id-priming via the value context.
  usePageRecordScope([entityId, users?.id ?? ""]);
  const query = { from, to, actorId, entityId: entityId || undefined };
  const hasFilters = Boolean(userRecordId || entityId || recordId);

  return (
    <Tabs
      value={kind}
      onValueChange={(next) => {
        if (next === "entity" || next === "record") {
          setKind(next);
          setRecordId("");
        }
      }}
      className="min-h-0 flex-1 gap-3 overflow-hidden p-8"
    >
      <div className="flex shrink-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          История изменений
        </h1>
        <p className="text-sm text-muted-foreground">
          Кто, когда и что поменял в записях и сущностях.
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <TabsList aria-label="История изменений">
          <TabsTrigger value="record">Записи</TabsTrigger>
          <TabsTrigger value="entity">Сущности</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-1.5">
          <DatePicker
            value={from}
            placeholder="С"
            aria-label="С даты"
            className="h-9 w-[8.5rem]"
            onChange={setFrom}
          />
          <span className="text-xs text-muted-foreground" aria-hidden>
            —
          </span>
          <DatePicker
            value={to}
            placeholder="По"
            aria-label="По дату"
            className="h-9 w-[8.5rem]"
            onChange={setTo}
          />
        </div>
        <FilterSelect
          label="Пользователь"
          value={userRecordId}
          options={getRelationRecordOptions(users)}
          onChange={setUserRecordId}
        />
        <FilterSelect
          label="Сущность"
          value={entityId}
          options={entities
            .map((item) => ({ id: item.id, label: getEntityDisplayName(item) }))
            .sort((a, b) => a.label.localeCompare(b.label, "ru"))}
          onChange={(next) => {
            setEntityId(next);
            setRecordId("");
          }}
        />
        {entity && kind === "record" ? (
          <RelationSelect
            options={getRelationRecordOptions(entity)}
            value={recordId ? serializeEntityRelationIds([recordId]) : ""}
            placeholder="Любая запись"
            aria-label="Запись"
            className="h-9 w-56"
            onChange={(next) =>
              setRecordId(parseEntityRelationIds(next)[0] ?? "")
            }
          />
        ) : null}
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setUserRecordId("");
              setEntityId("");
              setRecordId("");
            }}
          >
            <X />
            Сбросить
          </Button>
        ) : null}
      </div>

      <TabsContent key={kind} value={kind} className="flex min-h-0 flex-col">
        {kind === "record" ? (
          <RecordHistoryTable
            query={{ ...query, recordId: recordId || undefined }}
            onOpenRecord={onOpenRecord}
          />
        ) : (
          <EntityHistoryTable query={query} />
        )}
      </TabsContent>
    </Tabs>
  );
}
