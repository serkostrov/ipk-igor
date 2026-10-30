import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { ReviewGipCommercialBasis } from "../../tkp-gip-cost/model/gip-cost";
import {
  calculateTkpCommercialV7,
  TKP_COMMERCIAL_MAX_MONEY,
  TKP_COMMERCIAL_VAT_RATE,
  tkpSalePriceModeLabel,
  type TkpCommercialCalculation,
  type TkpCommercialPriceFields,
  type TkpSalePriceMode,
} from "../model/commercial";
import {
  baseBeforeRetroRows,
  fmtMoney,
  formatPercent,
  netProfitRows,
  profitTaxRows,
  totalBeforeVatRows,
} from "../model/metric-rows";
import type { TkpPriceRevisionSummary } from "../model/types";
import {
  CommercialMetricDetails,
  FormulaBreakdown,
  HistoricalGipBreakdownNotice,
  PricingValue,
} from "./CommercialMetricDetails";

function numberInput(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function finiteNonNegative(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= TKP_COMMERCIAL_MAX_MONEY
    ? parsed
    : null;
}

function finitePositive(value: string): number | null {
  const parsed = finiteNonNegative(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function fmtDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildPriceInput(
  mode: TkpSalePriceMode,
  coefficient: string,
  manualTotalBeforeVat: string,
  retroAmount: string,
): TkpCommercialPriceFields | null {
  const parsedRetroAmount = retroAmount.trim()
    ? finiteNonNegative(retroAmount)
    : 0;
  if (parsedRetroAmount == null) return null;
  if (mode === "coefficient") {
    const saleCoefficient = finitePositive(coefficient);
    return saleCoefficient == null
      ? null
      : { mode, saleCoefficient, retroAmount: parsedRetroAmount };
  }
  const parsedManualTotal = finitePositive(manualTotalBeforeVat);
  return parsedManualTotal == null
    ? null
    : {
        mode,
        manualTotalBeforeVat: parsedManualTotal,
        retroAmount: parsedRetroAmount,
      };
}

function SalePriceModeFields({ mode }: { mode: TkpSalePriceMode }) {
  return (
    <p
      className="text-[11px] text-muted-foreground"
      data-testid={`sale-price-mode-${mode}`}
    >
      {mode === "coefficient"
        ? "Цена рассчитывается по коммерческому коэффициенту."
        : "Укажите базовую цену без НДС и без РЭТРО; эффективный коэффициент рассчитается автоматически."}{" "}
      РЭТРО с коэффициентом 1,2 прибавляется после базового расчёта. НДС
      фиксирован: {TKP_COMMERCIAL_VAT_RATE}%. В чистую прибыль подрядные работы
      входят наценкой: вычитается сумма по договору с подрядчиком.
    </p>
  );
}

export function CommercialCalculationMetrics({
  calculation,
}: {
  calculation: TkpCommercialCalculation;
}) {
  return (
    <div
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      data-testid="review-commercial-price-metrics"
    >
      <CommercialMetricDetails
        metricKey="cost-with-fixed"
        label="Базовая себестоимость"
        value={fmtMoney(calculation.costWithFixed)}
      >
        <FormulaBreakdown
          rows={[
            {
              label: "Себестоимость с FIX из расчёта ГИПа",
              value: fmtMoney(calculation.costWithFixed),
            },
            {
              label: "Базовая себестоимость",
              value: fmtMoney(calculation.costWithFixed),
            },
          ]}
        />
        <HistoricalGipBreakdownNotice />
      </CommercialMetricDetails>
      <PricingValue
        label="Эффективный коэффициент"
        value={String(calculation.effectiveCoefficient)}
      />
      <CommercialMetricDetails
        metricKey="net-profit"
        label="Чистая прибыль"
        value={fmtMoney(calculation.netProfit)}
      >
        <FormulaBreakdown rows={netProfitRows(calculation)} />
      </CommercialMetricDetails>
      <CommercialMetricDetails
        metricKey="profitability"
        label="Рентабельность"
        value={formatPercent(calculation.profitabilityPercent)}
      >
        <FormulaBreakdown
          rows={[
            { label: "Чистая прибыль", value: fmtMoney(calculation.netProfit) },
            {
              label: "Цена без НДС",
              value: fmtMoney(calculation.totalBeforeVat),
            },
            {
              label: "Отношение прибыли к цене без НДС",
              value: formatPercent(calculation.profitabilityPercent),
            },
          ]}
        />
      </CommercialMetricDetails>
      <CommercialMetricDetails
        metricKey="base-before-retro"
        label="База без РЭТРО"
        value={fmtMoney(calculation.baseTotalBeforeVat)}
      >
        <FormulaBreakdown rows={baseBeforeRetroRows(calculation)} />
      </CommercialMetricDetails>
      <PricingValue
        label="Сумма РЭТРО-бонуса"
        value={fmtMoney(calculation.retroAmount)}
      />
      <PricingValue
        label="РЭТРО с коэффициентом 1,2"
        value={fmtMoney(calculation.retroWithFactor)}
      />
      <CommercialMetricDetails
        metricKey="profit-tax"
        label={`Налог ${calculation.profitTaxRate}%`}
        value={fmtMoney(calculation.profitTaxAmount)}
      >
        <FormulaBreakdown rows={profitTaxRows(calculation)} />
      </CommercialMetricDetails>
      <CommercialMetricDetails
        metricKey="total-before-vat"
        label="Цена без НДС"
        value={fmtMoney(calculation.totalBeforeVat)}
      >
        <FormulaBreakdown rows={totalBeforeVatRows(calculation)} />
      </CommercialMetricDetails>
      <CommercialMetricDetails
        metricKey="vat"
        label={`НДС ${calculation.vatRate}%`}
        value={fmtMoney(calculation.vatAmount)}
      >
        <FormulaBreakdown
          rows={[
            {
              label: "Цена без НДС",
              value: fmtMoney(calculation.totalBeforeVat),
            },
            { label: "Ставка НДС", value: formatPercent(calculation.vatRate) },
            {
              label: `НДС ${calculation.vatRate}%`,
              value: fmtMoney(calculation.vatAmount),
            },
          ]}
        />
      </CommercialMetricDetails>
      <CommercialMetricDetails
        metricKey="total-with-vat"
        label="Цена с НДС"
        value={fmtMoney(calculation.totalWithVat)}
        strong
      >
        <FormulaBreakdown
          rows={[
            {
              label: "Цена без НДС",
              value: fmtMoney(calculation.totalBeforeVat),
            },
            {
              label: `НДС ${calculation.vatRate}%`,
              value: fmtMoney(calculation.vatAmount),
            },
            { label: "Цена с НДС", value: fmtMoney(calculation.totalWithVat) },
          ]}
        />
      </CommercialMetricDetails>
    </div>
  );
}

export function CommercialPriceHistoryTable({
  entries,
}: {
  entries: TkpPriceRevisionSummary[];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Ревизий цены пока нет.</p>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-md border"
      data-testid="review-price-history-table"
    >
      <table className="w-full min-w-[1200px] text-xs">
        <thead className="bg-muted/40 text-left">
          <tr>
            <th className="p-2">Ревизия</th>
            <th className="p-2">Дата и автор</th>
            <th className="p-2">Режим</th>
            <th className="p-2 text-right">База</th>
            <th className="p-2 text-right">Эфф. коэффициент</th>
            <th className="p-2 text-right">Чистая прибыль</th>
            <th className="p-2 text-right">Рентабельность</th>
            <th className="p-2 text-right">Налог</th>
            <th className="p-2 text-right">РЭТРО</th>
            <th className="p-2 text-right">РЭТРО × 1,2</th>
            <th className="p-2 text-right">Без НДС</th>
            <th className="p-2 text-right">НДС</th>
            <th className="p-2 text-right">С НДС</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const calculation = entry.calculation;
            return (
              <tr key={entry.id} className="border-t align-top">
                <td className="p-2 font-medium">
                  {entry.revisionNumber == null
                    ? "—"
                    : `#${entry.revisionNumber}`}
                </td>
                <td className="p-2">
                  {fmtDateTime(entry.createdAt)}
                  <div className="text-muted-foreground">
                    {entry.createdByName ?? "—"}
                  </div>
                </td>
                <td className="p-2">
                  {tkpSalePriceModeLabel(entry.priceMode)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.costWithFixed) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {calculation?.effectiveCoefficient ?? "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.netProfit) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {calculation
                    ? `${calculation.profitabilityPercent.toLocaleString("ru-RU")}%`
                    : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.profitTaxAmount) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.retroAmount) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.retroWithFactor) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.totalBeforeVat) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.vatAmount) : "—"}
                </td>
                <td className="p-2 text-right font-medium tabular-nums">
                  {calculation ? fmtMoney(calculation.totalWithVat) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type CommercialPricingPanelSaveInput = TkpCommercialPriceFields & {
  calculation: TkpCommercialCalculation;
};

export function CommercialPricingPanel({
  basis,
  canEdit,
  latestRevision = null,
  history,
  onSaveRevision,
  onStartNewPriceVersion,
  pendingNewPriceVersion = false,
}: {
  basis: ReviewGipCommercialBasis;
  canEdit: boolean;
  latestRevision?: TkpPriceRevisionSummary | null;
  history: TkpPriceRevisionSummary[];
  onSaveRevision: (input: CommercialPricingPanelSaveInput) => Promise<void>;
  onStartNewPriceVersion?: () => Promise<void>;
  pendingNewPriceVersion?: boolean;
}) {
  const [mode, setMode] = useState<TkpSalePriceMode>(
    latestRevision?.priceMode ?? "coefficient",
  );
  const [coefficient, setCoefficient] = useState(
    numberInput(
      latestRevision?.saleCoefficient ??
        latestRevision?.calculation?.inputCoefficient ??
        1,
    ),
  );
  const [manualTotalBeforeVat, setManualTotalBeforeVat] = useState(
    numberInput(
      latestRevision?.manualTotalBeforeVat ??
        latestRevision?.calculation?.manualTotalBeforeVat ??
        latestRevision?.calculation?.baseTotalBeforeVat,
    ),
  );
  const [retroAmount, setRetroAmount] = useState(
    numberInput(
      latestRevision?.retroAmount ??
        latestRevision?.calculation?.retroAmount ??
        0,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [startingVersion, setStartingVersion] = useState(false);

  const input = useMemo(
    () => buildPriceInput(mode, coefficient, manualTotalBeforeVat, retroAmount),
    [coefficient, manualTotalBeforeVat, mode, retroAmount],
  );

  const preview = useMemo(() => {
    if (!input)
      return {
        calculation: null as TkpCommercialCalculation | null,
        error: null as string | null,
      };
    try {
      return {
        calculation: calculateTkpCommercialV7({ ...input, basis }),
        error: null,
      };
    } catch (err) {
      return {
        calculation: null,
        error:
          err instanceof Error ? err.message : "Не удалось рассчитать цену",
      };
    }
  }, [basis, input]);

  const visibleCalculation =
    preview.calculation ?? latestRevision?.calculation ?? null;
  const priceEditorVisible = canEdit || pendingNewPriceVersion;

  async function handleSave() {
    if (!input || !preview.calculation) return;
    setSaving(true);
    try {
      await onSaveRevision({ ...input, calculation: preview.calculation });
      toast.success("Новая неизменяемая ревизия цены сохранена");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleStartNewPriceVersion() {
    if (!onStartNewPriceVersion) return;
    setStartingVersion(true);
    try {
      await onStartNewPriceVersion();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setStartingVersion(false);
    }
  }

  const modeLabel =
    mode === "coefficient"
      ? tkpSalePriceModeLabel("coefficient")
      : tkpSalePriceModeLabel("manual");

  return (
    <section
      id="review-sale-price"
      className="scroll-mt-4 space-y-4 rounded-md border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Цена ТКП</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Предпросмотр считается на клиенте. Каждое сохранение создаёт
            отдельную неизменяемую ревизию; НДС всегда {TKP_COMMERCIAL_VAT_RATE}
            %.
          </p>
        </div>
        {onStartNewPriceVersion && !pendingNewPriceVersion ? (
          <Button
            type="button"
            size="sm"
            onClick={() => void handleStartNewPriceVersion()}
            disabled={startingVersion || !canEdit}
            data-testid="start-customer-price-revision"
          >
            {startingVersion ? "Создание…" : "Новая версия цены"}
          </Button>
        ) : null}
      </div>

      {pendingNewPriceVersion ? (
        <p className="text-xs text-muted-foreground">
          Сохранение создаст цену N+1. Перед финализацией убедитесь, что
          комплекты файлов ТКП соответствуют новой цене.
        </p>
      ) : null}

      {priceEditorVisible ? (
        <div className="space-y-3 rounded-md border bg-muted/20 p-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Режим цены</Label>
              <Select
                value={mode}
                onValueChange={(next) => {
                  if (next == null) return;
                  const value = String(next);
                  if (value === "coefficient" || value === "manual") {
                    setMode(value);
                  }
                }}
              >
                <SelectTrigger aria-label="Режим цены" className="w-full">
                  <SelectValue>{modeLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coefficient">
                    {tkpSalePriceModeLabel("coefficient")}
                  </SelectItem>
                  <SelectItem value="manual">
                    {tkpSalePriceModeLabel("manual")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "coefficient" ? (
              <div className="space-y-1.5">
                <Label htmlFor="tkp-price-coefficient" className="text-xs">
                  Коммерческий коэффициент
                </Label>
                <Input
                  id="tkp-price-coefficient"
                  aria-label="Коммерческий коэффициент"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={coefficient}
                  onChange={(event) => setCoefficient(event.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="tkp-price-manual" className="text-xs">
                  Базовая цена без НДС (без РЭТРО), ₽
                </Label>
                <Input
                  id="tkp-price-manual"
                  aria-label="Базовая цена без НДС"
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualTotalBeforeVat}
                  onChange={(event) =>
                    setManualTotalBeforeVat(event.target.value)
                  }
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="tkp-price-retro" className="text-xs">
                Сумма РЭТРО-бонуса, ₽
              </Label>
              <Input
                id="tkp-price-retro"
                aria-label="Сумма РЭТРО-бонуса"
                type="number"
                min="0"
                max={TKP_COMMERCIAL_MAX_MONEY}
                step="0.01"
                value={retroAmount}
                onChange={(event) => setRetroAmount(event.target.value)}
              />
            </div>
          </div>
          <SalePriceModeFields mode={mode} />
          {input === null ? (
            <p className="text-xs text-destructive">
              Укажите корректные значения цены и РЭТРО-бонуса.
            </p>
          ) : null}
          {preview.error ? (
            <p className="text-xs text-destructive" role="alert">
              {preview.error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={input === null || !preview.calculation || saving}
            >
              {saving
                ? "Сохранение…"
                : pendingNewPriceVersion
                  ? "Создать версию цены"
                  : "Сохранить новую ревизию"}
            </Button>
          </div>
        </div>
      ) : null}

      {visibleCalculation ? (
        <CommercialCalculationMetrics calculation={visibleCalculation} />
      ) : (
        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
          {priceEditorVisible
            ? "Укажите цену, чтобы получить расчёт."
            : "Сохранённый расчёт цены отсутствует."}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-medium">История цен</h3>
        <CommercialPriceHistoryTable entries={history} />
      </div>
    </section>
  );
}
