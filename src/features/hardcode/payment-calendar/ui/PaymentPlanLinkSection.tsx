import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  useEntityConfig,
  useEntityValueContext,
  type Entity,
} from "@/entities/entity";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { dateOrDash, moneyOrDash } from "../../deal-card/model/format";
import { usePaymentAllocations } from "../lib/use-payment-allocations";
import { usePaymentCalendar } from "../lib/use-payment-calendar";
import { KIND_LABELS } from "../model/labels";
import { readDdsOperationFromValues } from "../model/operation-draft";
import {
  parsePlanLinkAmount,
  planLinkKey,
  sumPlanLinks,
  type PlanLinkItem,
} from "../model/plan-links";
import type { PaymentRow } from "../model/types";

const MAX_OPTIONS = 100;

function rowKey(row: PaymentRow) {
  return `${row.stage.id}:${row.kind}`;
}

function rowTitle(row: PaymentRow) {
  const contract = row.stage.contract?.name;
  return `${contract ? `${contract} · ` : ""}${row.stage.name} · ${KIND_LABELS[row.kind]}`;
}

/**
 * «Плановое поступление» block of the ДДС form: for an incoming operation the
 * user picks the planned payments it covers - they become fact in the calendar.
 */
export function PaymentPlanLinkSection({
  entity,
  recordId,
  values,
  items,
  onChange,
}: {
  entity: Entity;
  recordId: string;
  values: Record<string, string>;
  /** `null` — untouched: show the links saved earlier. */
  items: PlanLinkItem[] | null;
  onChange: (items: PlanLinkItem[]) => void;
}) {
  const { entities } = useEntityConfig();
  const ctx = useEntityValueContext();
  const { ready, calendar } = usePaymentCalendar();
  const allocations = usePaymentAllocations();
  const [search, setSearch] = useState("");

  const saved = useMemo(
    () =>
      allocations.status === "ready"
        ? allocations.value.filter((item) => item.ddsRecordId === recordId)
        : [],
    [allocations, recordId],
  );
  const current = useMemo<PlanLinkItem[]>(
    () =>
      items ??
      saved.map((item) => ({
        stageId: item.stageId,
        partKind: item.partKind,
        amountText: String(item.amount),
      })),
    [items, saved],
  );

  const operation = useMemo(
    () => readDdsOperationFromValues(ctx, entities, entity, recordId, values),
    [ctx, entities, entity, recordId, values],
  );

  const rowByKey = useMemo(
    () => new Map((calendar?.rows ?? []).map((row) => [rowKey(row), row])),
    [calendar],
  );
  // What this operation already covers (it is part of the rows' paid amount).
  const ownSaved = useMemo(
    () => new Map(saved.map((item) => [planLinkKey(item), item.amount])),
    [saved],
  );

  const chosen = useMemo(
    () => new Set(current.map((item) => planLinkKey(item))),
    [current],
  );
  const candidates = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru");
    return (calendar?.rows ?? [])
      .filter((row) => {
        if (chosen.has(rowKey(row))) return false;
        if (row.remaining + (ownSaved.get(rowKey(row)) ?? 0) <= 0) return false;
        return (
          !needle || rowTitle(row).toLocaleLowerCase("ru").includes(needle)
        );
      })
      .sort((a, b) => {
        const mine = (row: PaymentRow) =>
          operation?.counterpartyId != null &&
          row.stage.counterparty?.id === operation.counterpartyId
            ? 0
            : 1;
        return mine(a) - mine(b);
      })
      .slice(0, MAX_OPTIONS);
  }, [calendar, chosen, operation, ownSaved, search]);

  if (!operation?.income) return null;

  const operationAmount = operation.amount;
  const linked = sumPlanLinks(current);
  const left =
    operationAmount == null
      ? null
      : Math.round((operationAmount - linked) * 100) / 100;

  function add(key: string) {
    const row = rowByKey.get(key);
    if (!row) return;
    const available = row.remaining + (ownSaved.get(key) ?? 0);
    const suggested =
      left == null ? available : Math.min(available, Math.max(left, 0));
    onChange([
      ...current,
      {
        stageId: row.stage.id,
        partKind: row.kind,
        amountText: suggested > 0 ? String(suggested) : "",
      },
    ]);
  }

  return (
    <section className="shrink-0 overflow-hidden rounded-xl border border-border bg-muted/25">
      <header className="flex h-9 items-center border-b border-border bg-foreground/[0.045] px-3.5">
        <h3 className="text-[11px] font-semibold tracking-wide text-foreground/65 uppercase">
          Плановое поступление
        </h3>
      </header>
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs text-muted-foreground">
          Привяжите поступление к плановым платежам из платёжного календаря —
          привязанная сумма станет фактической.
        </p>

        {!ready ? (
          <p className="text-xs text-muted-foreground">Загрузка плана…</p>
        ) : (
          <>
            {current.map((item) => {
              const key = planLinkKey(item);
              const row = rowByKey.get(key);
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row ? rowTitle(row) : "Плановый платёж не найден"}
                    </p>
                    {row ? (
                      <p className="text-xs text-muted-foreground">
                        План {moneyOrDash(row.amount)} · срок{" "}
                        {dateOrDash(row.dueDate)}
                      </p>
                    ) : null}
                  </div>
                  <Input
                    value={item.amountText}
                    inputMode="decimal"
                    aria-label="Сумма привязки"
                    className="h-8 w-28 text-right tabular-nums"
                    onChange={(event) =>
                      onChange(
                        current.map((entry) =>
                          planLinkKey(entry) === key
                            ? { ...entry, amountText: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Убрать привязку"
                    onClick={() =>
                      onChange(
                        current.filter((entry) => planLinkKey(entry) !== key),
                      )
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              );
            })}

            <div className="flex items-center gap-2">
              <Input
                value={search}
                placeholder="Найти договор или этап"
                aria-label="Поиск планового платежа"
                className="h-8 flex-1"
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                value=""
                onValueChange={(next) => next && add(String(next))}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 w-56"
                  aria-label="Добавить плановый платёж"
                >
                  <Plus className="size-3.5" aria-hidden />
                  <SelectValue>Добавить плановый платёж</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {candidates.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Нет подходящих платежей
                    </div>
                  ) : (
                    candidates.map((row) => (
                      <SelectItem key={rowKey(row)} value={rowKey(row)}>
                        {rowTitle(row)} · {dateOrDash(row.dueDate)} · ост.{" "}
                        {moneyOrDash(
                          row.remaining + (ownSaved.get(rowKey(row)) ?? 0),
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground tabular-nums">
              Привязано {moneyOrDash(linked)}
              {operationAmount != null
                ? ` из ${moneyOrDash(operationAmount)}`
                : ""}
              {left != null && left < 0 ? (
                <span className="text-destructive">
                  {" "}
                  · превышение суммы операции
                </span>
              ) : null}
              {current.some(
                (item) =>
                  !Number.isFinite(parsePlanLinkAmount(item.amountText)),
              ) ? (
                <span className="text-destructive"> · проверьте суммы</span>
              ) : null}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
