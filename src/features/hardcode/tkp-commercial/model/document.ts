/**
 * Build a printable commercial TKP document from a saved price revision.
 * HTML is used as the portable document format (no PDF dependency).
 */

import { PROJECT_TIMEZONE } from "@/shared/config/project-time";
import {
  tkpSalePriceModeLabel,
  type TkpCommercialCalculation,
} from "./commercial";
import {
  baseBeforeRetroRows,
  fmtMoney,
  formatPercent,
  netProfitRows,
  profitTaxRows,
  totalBeforeVatRows,
} from "./metric-rows";
import type { TkpPriceRevisionSummary } from "./types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: PROJECT_TIMEZONE,
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function rowsTable(
  title: string,
  rows: Array<{ label: string; value: string }>,
) {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td class="num">${escapeHtml(row.value)}</td></tr>`,
    )
    .join("");
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <table>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

function highlightCards(calculation: TkpCommercialCalculation): string {
  const cards = [
    { label: "Итого без НДС", value: fmtMoney(calculation.totalBeforeVat) },
    {
      label: `НДС ${calculation.vatRate}%`,
      value: fmtMoney(calculation.vatAmount),
    },
    { label: "Итого с НДС", value: fmtMoney(calculation.totalWithVat) },
    {
      label: "Чистая прибыль",
      value: fmtMoney(calculation.netProfit),
    },
    {
      label: "Рентабельность",
      value: formatPercent(calculation.profitabilityPercent),
    },
    {
      label: "Эфф. коэффициент",
      value: calculation.effectiveCoefficient.toLocaleString("ru-RU", {
        maximumFractionDigits: 4,
      }),
    },
  ];
  return `
    <div class="cards">
      ${cards
        .map(
          (card) => `
        <div class="card">
          <div class="card-label">${escapeHtml(card.label)}</div>
          <div class="card-value">${escapeHtml(card.value)}</div>
        </div>`,
        )
        .join("")}
    </div>`;
}

export type TkpCommercialDocumentInput = {
  recordTitle: string;
  revision: TkpPriceRevisionSummary;
  generatedAt?: Date;
};

/** Self-contained HTML document suitable for upload / print. */
export function buildTkpCommercialDocumentHtml(
  input: TkpCommercialDocumentInput,
): string {
  const calculation = input.revision.calculation;
  if (!calculation) {
    throw new Error("У ревизии цены нет расчёта");
  }

  const generatedAt = input.generatedAt ?? new Date();
  const revisionLabel =
    input.revision.revisionNumber != null
      ? `№${input.revision.revisionNumber}`
      : input.revision.id.slice(0, 8);
  const title = `ТКП — ${input.recordTitle.trim() || "Без названия"}`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 32px;
      color: #111;
      background: #fff;
      line-height: 1.45;
    }
    h1 { font-size: 22px; margin: 0 0 6px; }
    h2 { font-size: 14px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; color: #444; }
    .meta { color: #666; font-size: 13px; margin-bottom: 20px; }
    .meta div { margin: 2px 0; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 10px;
      margin: 16px 0 8px;
    }
    .card {
      border: 1px solid #e5e5e5;
      border-radius: 10px;
      padding: 12px 14px;
      background: #fafafa;
    }
    .card-label { font-size: 11px; color: #666; margin-bottom: 4px; }
    .card-value { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    footer { margin-top: 28px; font-size: 11px; color: #888; }
    @media print {
      body { padding: 12mm; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <div>Ревизия цены: ${escapeHtml(revisionLabel)}</div>
      <div>Режим: ${escapeHtml(tkpSalePriceModeLabel(input.revision.priceMode))}</div>
      <div>Создана: ${escapeHtml(fmtDateTime(input.revision.createdAt))}${
        input.revision.createdByName
          ? ` · ${escapeHtml(input.revision.createdByName)}`
          : ""
      }</div>
      <div>Документ сформирован: ${escapeHtml(fmtDateTime(generatedAt))}</div>
    </div>
  </header>

  ${highlightCards(calculation)}
  ${rowsTable("База до РЭТРО", baseBeforeRetroRows(calculation))}
  ${rowsTable("Налог на прибыль", profitTaxRows(calculation))}
  ${rowsTable("Чистая прибыль", netProfitRows(calculation))}
  ${rowsTable("Итоговая цена", totalBeforeVatRows(calculation))}

  <footer>
    Документ сформирован автоматически на основе неизменяемой ревизии цены ТКП.
    Формула: ${escapeHtml(calculation.formulaVersion)}.
  </footer>
</body>
</html>`;
}

export function buildTkpCommercialDocumentFileName(
  revision: TkpPriceRevisionSummary,
  recordTitle: string,
): string {
  const safeTitle = recordTitle
    .trim()
    .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
    .replace(/\s+/g, "_")
    .slice(0, 48);
  const rev =
    revision.revisionNumber != null
      ? `v${revision.revisionNumber}`
      : revision.id.slice(0, 8);
  const base = safeTitle ? `TKP_${safeTitle}_${rev}` : `TKP_${rev}`;
  return `${base}.html`;
}

export function buildTkpCommercialDocumentFile(
  input: TkpCommercialDocumentInput,
): File {
  const html = buildTkpCommercialDocumentHtml(input);
  const name = buildTkpCommercialDocumentFileName(
    input.revision,
    input.recordTitle,
  );
  return new File([html], name, { type: "text/html;charset=utf-8" });
}
