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
        Сохраните коммерческий расчёт, затем загрузите файлы ТКП в строке новой
        ревизии в «Истории цен»
        {latestRevisionId
          ? " — они будут привязаны к сохранённой ревизии."
          : "."}{" "}
        После загрузки согласование запустит автоматизация.
      </p>
    </div>
  );
}
