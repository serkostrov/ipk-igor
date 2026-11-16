import { canEntity, useCurrentRole } from "@/entities/access";
import { splitMessengerText } from "@/entities/messenger";
import { cn } from "@/shared/lib/cn";

export function MessengerMessageBody({
  text,
  className,
  onOpenRecord,
}: {
  text: string;
  className?: string;
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const role = useCurrentRole();
  const parts = splitMessengerText(text);

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) => {
        if (part.type === "text") {
          return <span key={index}>{part.value}</span>;
        }
        const location = part.location;
        if (
          location?.type === "record" &&
          onOpenRecord &&
          canEntity(role, location.entityId, "read")
        ) {
          return (
            <button
              key={index}
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => onOpenRecord(location.entityId, location.recordId)}
            >
              {part.value}
            </button>
          );
        }
        if (part.href.startsWith("http")) {
          return (
            <a
              key={index}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              {part.value}
            </a>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </span>
  );
}
