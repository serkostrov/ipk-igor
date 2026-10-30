import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PROJECT_TIMEZONE } from "@/shared/config/project-time";
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
    timeZone: PROJECT_TIMEZONE,
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
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
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
        label="РЭТРО-бонус"
        value={fmtMoney(calculation.retroAmount)}
      />
      <PricingValue
        label="РЭТРО × 1,2"
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
        strong
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
        wide
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
      <p className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
        Ревизий цены пока нет.
      </p>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-xl border border-border/70"
      data-testid="review-price-history-table"
    >
      <table className="w-full min-w-[1200px] text-xs">
        <thead className="bg-muted/40 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2.5">Ревизия</th>
            <th className="px-3 py-2.5">Дата и автор</th>
            <th className="px-3 py-2.5">Режим</th>
            <th className="px-3 py-2.5 text-right">База</th>
            <th className="px-3 py-2.5 text-right">Эфф. коэфф.</th>
            <th className="px-3 py-2.5 text-right">Чистая прибыль</th>
            <th className="px-3 py-2.5 text-right">Рентабельность</th>
            <th className="px-3 py-2.5 text-right">Налог</th>
            <th className="px-3 py-2.5 text-right">РЭТРО</th>
            <th className="px-3 py-2.5 text-right">РЭТРО × 1,2</th>
            <th className="px-3 py-2.5 text-right">Без НДС</th>
            <th className="px-3 py-2.5 text-right">НДС</th>
            <th className="px-3 py-2.5 text-right">С НДС</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const calculation = entry.calculation;
            return (
              <tr
                key={entry.id}
                className="border-t border-border/60 align-top hover:bg-muted/20"
              >
                <td className="px-3 py-2.5 font-medium">
                  {entry.revisionNumber == null
                    ? "—"
                    : `#${entry.revisionNumber}`}
                </td>
                <td className="px-3 py-2.5">
                  {fmtDateTime(entry.createdAt)}
                  <div className="text-muted-foreground">
                    {entry.createdByName ?? "—"}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {tkpSalePriceModeLabel(entry.priceMode)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.costWithFixed) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {calculation?.effectiveCoefficient ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.netProfit) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {calculation
                    ? `${calculation.profitabilityPercent.toLocaleString("ru-RU")}%`
                    : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.profitTaxAmount) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.retroAmount) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.retroWithFactor) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.totalBeforeVat) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {calculation ? fmtMoney(calculation.vatAmount) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
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
  onSubmitForApproval,
  pendingNewPriceVersion = false,
  approvalRevisionId = null,
  approvalSubmittedAt = null,
}: {
  basis: ReviewGipCommercialBasis;
  canEdit: boolean;
  latestRevision?: TkpPriceRevisionSummary | null;
  history: TkpPriceRevisionSummary[];
  onSaveRevision: (input: CommercialPricingPanelSaveInput) => Promise<void>;
  onStartNewPriceVersion?: () => Promise<void>;
  /** Generate document from latest revision and send to approval chain. */
  onSubmitForApproval?: (
    revision: TkpPriceRevisionSummary,
  ) => Promise<void>;
  pendingNewPriceVersion?: boolean;
  approvalRevisionId?: string | null;
  approvalSubmittedAt?: string | null;
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
  const [submittingApproval, setSubmittingApproval] = useState(false);

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

  async function handleSubmitForApproval() {
    if (!onSubmitForApproval || !latestRevision?.calculation) return;
    setSubmittingApproval(true);
    try {
      await onSubmitForApproval(latestRevision);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSubmittingApproval(false);
    }
  }

  const modeLabel =
    mode === "coefficient"
      ? tkpSalePriceModeLabel("coefficient")
      : tkpSalePriceModeLabel("manual");
  const approvalMatchesLatest =
    latestRevision != null &&
    approvalRevisionId != null &&
    approvalRevisionId === latestRevision.id;
  const canSubmitApproval =
    canEdit &&
    Boolean(onSubmitForApproval) &&
    Boolean(latestRevision?.calculation) &&
    !pendingNewPriceVersion;

  return (
    <section
      id="review-sale-price"
      className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Цена ТКП
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Предпросмотр на клиенте · каждое сохранение — новая ревизия · НДС{" "}
            {TKP_COMMERCIAL_VAT_RATE}%
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canSubmitApproval ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={() => void handleSubmitForApproval()}
              disabled={submittingApproval || !canEdit}
              data-testid="submit-tkp-document-approval"
            >
              {submittingApproval
                ? "Формирование…"
                : approvalMatchesLatest
                  ? "Отправить снова"
                  : "Документ на согласование"}
            </Button>
          ) : null}
          {onStartNewPriceVersion && !pendingNewPriceVersion ? (
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => void handleStartNewPriceVersion()}
              disabled={startingVersion || !canEdit}
              data-testid="start-customer-price-revision"
            >
              {startingVersion ? "Создание…" : "Новая версия цены"}
            </Button>
          ) : null}
        </div>
      </header>

      {approvalMatchesLatest && approvalSubmittedAt ? (
        <p
          className="border-b border-border/70 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-950 dark:text-emerald-100 sm:px-5"
          data-testid="tkp-approval-submitted-banner"
        >
          Документ по текущей ревизии сформирован и отправлен на согласование
          {` · ${fmtDateTime(approvalSubmittedAt)}`}.
        </p>
      ) : null}

      {pendingNewPriceVersion ? (
        <p className="border-b border-border/70 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          Сохранение создаст цену N+1. Перед финализацией убедитесь, что
          комплекты файлов ТКП соответствуют новой цене.
        </p>
      ) : null}

      <div className="space-y-4 p-3 sm:p-4">
        {visibleCalculation ? (
          <CommercialCalculationMetrics calculation={visibleCalculation} />
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-6 text-center text-xs text-muted-foreground">
            {priceEditorVisible
              ? "Укажите параметры цены ниже — расчёт появится здесь."
              : "Сохранённый расчёт цены отсутствует."}
          </div>
        )}
      </div>

      {priceEditorVisible ? (
        <footer className="space-y-3 border-t border-border/70 bg-muted/25 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-foreground">
              Параметры цены
            </p>
            <SalePriceModeFields mode={mode} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Режим</Label>
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
                <SelectTrigger
                  aria-label="Режим цены"
                  className="h-9 w-full bg-background"
                >
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
                <Label
                  htmlFor="tkp-price-coefficient"
                  className="text-xs font-medium"
                >
                  Коммерческий коэффициент
                </Label>
                <Input
                  id="tkp-price-coefficient"
                  aria-label="Коммерческий коэффициент"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  inputMode="decimal"
                  className="h-9 bg-background tabular-nums"
                  value={coefficient}
                  onChange={(event) => setCoefficient(event.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label
                  htmlFor="tkp-price-manual"
                  className="text-xs font-medium"
                >
                  Базовая цена без НДС, ₽
                </Label>
                <Input
                  id="tkp-price-manual"
                  aria-label="Базовая цена без НДС"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className="h-9 bg-background tabular-nums"
                  value={manualTotalBeforeVat}
                  onChange={(event) =>
                    setManualTotalBeforeVat(event.target.value)
                  }
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="tkp-price-retro" className="text-xs font-medium">
                РЭТРО-бонус, ₽
              </Label>
              <Input
                id="tkp-price-retro"
                aria-label="Сумма РЭТРО-бонуса"
                type="number"
                min="0"
                max={TKP_COMMERCIAL_MAX_MONEY}
                step="0.01"
                inputMode="decimal"
                className="h-9 bg-background tabular-nums"
                value={retroAmount}
                onChange={(event) => setRetroAmount(event.target.value)}
              />
            </div>
          </div>
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
              size="sm"
              className="h-9"
              onClick={() => void handleSave()}
              disabled={input === null || !preview.calculation || saving}
            >
              {saving
                ? "Сохранение…"
                : pendingNewPriceVersion
                  ? "Создать версию цены"
                  : "Сохранить ревизию"}
            </Button>
          </div>
        </footer>
      ) : null}

      <div className="space-y-2.5 border-t border-border/70 px-4 py-3.5 sm:px-5">
        <h3 className="text-sm font-medium text-foreground">История цен</h3>
        <CommercialPriceHistoryTable entries={history} />
      </div>
    </section>
  );
}
