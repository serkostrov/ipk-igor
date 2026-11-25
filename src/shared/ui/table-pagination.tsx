import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/cn";

function getVisiblePages(current: number, total: number) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total, current]);
  for (const offset of [-1, 1]) {
    const next = current + offset;
    if (next > 1 && next < total) pages.add(next);
  }
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  for (const page of sorted) {
    const prev = result[result.length - 1];
    if (typeof prev === "number" && page - prev > 1) {
      result.push("ellipsis");
    }
    result.push(page);
  }
  return result;
}

/** Footer bar of a data table: page size, range summary and page buttons. */
export function TablePagination({
  page,
  pageSize,
  pageSizes,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  pageSizes: readonly number[];
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);
  const visiblePages = getVisiblePages(currentPage, totalPages);

  return (
    <div className="flex h-9 shrink-0 flex-wrap items-center justify-between gap-x-3 border-t border-border bg-muted px-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="shrink-0">На странице</span>
        <Select
          value={String(pageSize)}
          onValueChange={(next) => onPageSizeChange(Number(next))}
        >
          <SelectTrigger
            size="sm"
            className="h-7 w-[3.75rem] px-2 text-[11px]"
            aria-label="Записей на странице"
          >
            <SelectValue>{pageSize}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="tabular-nums">
          {total === 0 ? "0 записей" : `${from}–${to} из ${total}`}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          variant="default"
          size="icon-sm"
          className="size-7"
          disabled={currentPage <= 1}
          aria-label="Предыдущая страница"
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        {visiblePages.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="flex size-7 items-center justify-center text-[11px] text-muted-foreground"
              aria-hidden
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn(
                "size-7 text-[11px] tabular-nums text-foreground hover:bg-transparent hover:text-foreground",
                item === currentPage && "font-semibold",
              )}
              aria-label={`Страница ${item}`}
              aria-current={item === currentPage ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="default"
          size="icon-sm"
          className="size-7"
          disabled={currentPage >= totalPages}
          aria-label="Следующая страница"
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
