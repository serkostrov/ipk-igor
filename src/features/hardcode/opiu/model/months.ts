import { PROFIT_LOSS_MONTH_LABELS, type ProfitLossMonth } from "./types";

function monthEndIso(year: number, monthIndex: number) {
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return end.toISOString().slice(0, 10);
}

export function buildProfitLossYearMonths(year: number): ProfitLossMonth[] {
  return PROFIT_LOSS_MONTH_LABELS.map((label, monthIndex) => ({
    key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    label,
    year,
    monthIndex,
    startDate: `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`,
    endDate: monthEndIso(year, monthIndex),
  }));
}

/** Inclusive calendar months covering `[dateFrom, dateTo]`. */
export function buildProfitLossPeriodMonths(
  dateFrom: string,
  dateTo: string,
): ProfitLossMonth[] {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
  const [fromYear, fromMonth] = dateFrom.split("-").map(Number);
  const [toYear, toMonth] = dateTo.split("-").map(Number);
  if (!fromYear || !fromMonth || !toYear || !toMonth) return [];

  const result: ProfitLossMonth[] = [];
  let year = fromYear;
  let monthIndex = fromMonth - 1;
  const endYear = toYear;
  const endMonthIndex = toMonth - 1;

  while (year < endYear || (year === endYear && monthIndex <= endMonthIndex)) {
    const label =
      PROFIT_LOSS_MONTH_LABELS[monthIndex] ?? String(monthIndex + 1);
    result.push({
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      label,
      year,
      monthIndex,
      startDate: `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`,
      endDate: monthEndIso(year, monthIndex),
    });
    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
  }
  return result;
}
