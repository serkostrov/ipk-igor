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

const NOTE_LINK_CLASS =
  "break-all font-medium text-primary underline-offset-2 hover:underline";

/** Renders note text with `@имя` mentions and clickable URLs. */
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
      {segments.map((segment, index) => {
        if (segment.kind === "mention") {
          return (
            <span
              key={`${segment.userId}-${index}`}
              className="rounded-sm bg-primary/10 px-0.5 font-medium text-primary"
            >
              {segment.value}
            </span>
          );
        }
        if (segment.kind === "link") {
          return (
            <a
              key={`l-${index}`}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              className={NOTE_LINK_CLASS}
            >
              {segment.value}
            </a>
          );
        }
        return <span key={`t-${index}`}>{segment.value}</span>;
      })}
    </p>
  );
}
