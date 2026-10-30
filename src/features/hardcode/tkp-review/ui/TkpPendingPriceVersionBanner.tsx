export function TkpPendingPriceVersionBanner({
  latestRevisionId,
}: {
  latestRevisionId: string | null;
}) {
  return (
    <div
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100"
      data-testid="tkp-pending-new-price-version"
    >
      <p className="font-medium">Новая версия цены</p>
      <p className="mt-0.5 text-muted-foreground">
        Сохраните коммерческий расчёт, затем сформируйте документ кнопкой
        «Документ на согласование» или загрузите файл ТКП вручную
        {latestRevisionId
          ? " — он будет привязан к новой ревизии цены."
          : "."}
      </p>
    </div>
  );
}
