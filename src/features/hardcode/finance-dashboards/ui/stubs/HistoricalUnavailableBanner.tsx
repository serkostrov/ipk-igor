import { DashboardState } from "../shared";

export function HistoricalUnavailableBanner({
  kind,
}: {
  kind: "lus" | "lus-historical" | "opiu-historical";
}) {
  const label =
    kind === "lus"
      ? "Данные ЛУС пока не подключены в ipk"
      : kind === "lus-historical"
        ? "Данные исторического ЛУС пока не подключены в ipk"
        : "Данные исторического ОПиУ пока не подключены в ipk";

  return <DashboardState>{label}. Показатели и графики пустые.</DashboardState>;
}
