import { useEffect, useState } from "react";
import { fetchMessageReads } from "@/entities/messenger";
import { getSystemUserNameByAuthId, useEntityConfig } from "@/entities/entity";

export function MessengerReadReceipts({
  messageId,
  className,
}: {
  messageId: string;
  className?: string;
}) {
  const { entities } = useEntityConfig();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMessageReads(messageId)
      .then((rows) => {
        if (cancelled || rows.length === 0) {
          if (!cancelled) setLabel(null);
          return;
        }
        const names = rows
          .map(
            (row) =>
              getSystemUserNameByAuthId(entities, row.userId) ??
              row.userId.slice(0, 6),
          )
          .slice(0, 5);
        const extra =
          rows.length > names.length ? ` +${rows.length - names.length}` : "";
        setLabel(`Прочитали: ${names.join(", ")}${extra}`);
      })
      .catch(() => {
        if (!cancelled) setLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [messageId, entities]);

  if (!label) return null;
  return (
    <span className={className} title={label}>
      · {label}
    </span>
  );
}
