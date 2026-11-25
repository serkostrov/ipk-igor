import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { dateOrDash, moneyOrDash } from "../../deal-card/model/format";
import { DealRecordLink } from "../../deal-card/ui/shared";
import type { UnallocatedReceipt } from "../model/types";
import { tableHeadClass } from "./table-styles";
import type { OpenRecord } from "./types";

/** Incoming DDS operations that no planned payment covers. */
export function UnallocatedTable({
  items,
  ddsEntityId,
  onOpenRecord,
}: {
  items: readonly UnallocatedReceipt[];
  ddsEntityId: string | undefined;
  onOpenRecord?: OpenRecord;
}) {
  return (
    <Table className="text-[13px]" containerClassName="overflow-visible">
      <TableHeader>
        <TableRow className="border-0 hover:bg-transparent">
          <TableHead className={tableHeadClass}>Дата</TableHead>
          <TableHead className={tableHeadClass}>Операция ДДС</TableHead>
          <TableHead className={tableHeadClass}>Нераспределено</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(({ receipt, amount }) => (
          <TableRow key={receipt.id}>
            <TableCell>{dateOrDash(receipt.date)}</TableCell>
            <TableCell>
              <DealRecordLink
                entityId={ddsEntityId}
                recordId={receipt.id}
                title={receipt.title}
                onOpenRelation={onOpenRecord}
              />
            </TableCell>
            <TableCell className="tabular-nums">
              {moneyOrDash(amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
