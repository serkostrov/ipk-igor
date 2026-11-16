import { useState } from "react";
import { toast } from "sonner";
import { submitNewsFeedPollVote, type FeedPoll } from "@/entities/news-feed";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";

export function NewsFeedPollBlock({
  postId,
  poll,
}: {
  postId: string;
  poll: FeedPoll;
}) {
  const [selected, setSelected] = useState<string[]>(poll.myOptionIds);
  const [busy, setBusy] = useState(false);
  const canVote = !poll.hasVoted && !poll.ended;

  function toggleOption(optionId: string) {
    if (!canVote) return;
    if (poll.allowMultiple) {
      setSelected((current) =>
        current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      );
      return;
    }
    setSelected([optionId]);
  }

  async function handleVote() {
    if (selected.length === 0) {
      toast.error("Выберите вариант ответа");
      return;
    }
    setBusy(true);
    try {
      await submitNewsFeedPollVote(postId, poll.id, selected);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось проголосовать",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{poll.question}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {poll.ended
            ? "Опрос завершён"
            : poll.allowMultiple
              ? "Можно выбрать несколько вариантов"
              : "Выберите один вариант"}
        </p>
      </div>

      <ul className="space-y-2">
        {poll.options.map((option) => {
          const percent =
            poll.showResults && poll.totalVotes > 0
              ? Math.round((option.voteCount / poll.totalVotes) * 100)
              : 0;
          const isSelected = canVote
            ? selected.includes(option.id)
            : option.selected;

          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={!canVote || busy}
                onClick={() => toggleOption(option.id)}
                className={cn(
                  "relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  isSelected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-muted/50",
                  !canVote && "cursor-default",
                )}
              >
                {poll.showResults ? (
                  <span
                    className="absolute inset-y-0 left-0 bg-primary/10"
                    style={{ width: `${percent}%` }}
                  />
                ) : null}
                <span className="relative flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center border border-border",
                        poll.allowMultiple ? "rounded-[3px]" : "rounded-full",
                        isSelected &&
                          "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {isSelected ? (
                        <span className="size-1.5 rounded-full bg-current" />
                      ) : null}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </span>
                  {poll.showResults ? (
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {option.voteCount} · {percent}%
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {canVote ? (
        <Button
          type="button"
          size="sm"
          disabled={busy || selected.length === 0}
          onClick={() => void handleVote()}
        >
          Голосовать
        </Button>
      ) : poll.showResults ? (
        <p className="text-xs text-muted-foreground">
          Всего голосов: {poll.totalVotes}
        </p>
      ) : null}
    </div>
  );
}
