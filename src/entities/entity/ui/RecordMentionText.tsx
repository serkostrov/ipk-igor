import { useMemo } from "react";
import { cn } from "@/shared/lib/cn";
import {
  listMentionableUsers,
  splitRecordMentionSegments,
} from "../lib/record-mentions";
import type { Entity } from "../model/types";

type RecordMentionTextProps = {
  text: string;
  entities: readonly Entity[];
  className?: string;
};

/** Renders note text with `@имя` mentions highlighted. */
export function RecordMentionText({
  text,
  entities,
  className,
}: RecordMentionTextProps) {
  const users = useMemo(() => listMentionableUsers(entities), [entities]);
  const segments = useMemo(
    () => splitRecordMentionSegments(text, users),
    [text, users],
  );

  return (
    <p className={cn("whitespace-pre-wrap", className)}>
      {segments.map((segment, index) =>
        segment.kind === "mention" ? (
          <span
            key={`${segment.userId}-${index}`}
            className="rounded-sm bg-primary/10 px-0.5 font-medium text-primary"
          >
            {segment.value}
          </span>
        ) : (
          <span key={`t-${index}`}>{segment.value}</span>
        ),
      )}
    </p>
  );
}
