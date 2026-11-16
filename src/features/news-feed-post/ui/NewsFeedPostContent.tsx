import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { findLegalEntitiesEntity, useEntityConfig } from "@/entities/entity";
import {
  formatFeedFileSize,
  getFeedFileUrl,
  isFeedImageAttachment,
  resolveLegalEntityLabel,
  type FeedAttachment,
  type FeedPost,
  useNewsFeedIsAdminViewer,
} from "@/entities/news-feed";
import { NewsFeedPollBlock } from "./NewsFeedPollBlock";

function FeedAttachmentThumb({
  attachment,
  large,
}: {
  attachment: FeedAttachment;
  large?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = isFeedImageAttachment(
    attachment.mimeType,
    attachment.extension,
  );

  useEffect(() => {
    let cancelled = false;
    void getFeedFileUrl(attachment.storagePath)
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.storagePath]);

  if (isImage && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-xl border border-border/80 bg-muted/20"
      >
        <img
          src={url}
          alt={attachment.fileName}
          className={
            large
              ? "max-h-[28rem] w-full object-cover"
              : "max-h-80 w-full object-cover"
          }
        />
      </a>
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/10 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
      onClick={(event) => {
        if (!url) event.preventDefault();
      }}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatFeedFileSize(attachment.sizeBytes)}
      </span>
    </a>
  );
}

export function NewsFeedPostContent({
  post,
  titleAs = "h2",
  largeMedia = false,
  meta,
}: {
  post: FeedPost;
  titleAs?: "h1" | "h2";
  largeMedia?: boolean;
  /** Author / date block aligned to the right of the title. */
  meta?: ReactNode;
}) {
  const { entities } = useEntityConfig();
  const isAdminViewer = useNewsFeedIsAdminViewer();
  const legalEntitiesEntity = useMemo(
    () => findLegalEntitiesEntity(entities),
    [entities],
  );

  const externalLinks = post.links.filter((link) => link.kind === "external");
  const formLinks = post.links.filter((link) => link.kind === "google_form");
  const imageAttachments = post.attachments.filter((item) =>
    isFeedImageAttachment(item.mimeType, item.extension),
  );
  const fileAttachments = post.attachments.filter(
    (item) => !isFeedImageAttachment(item.mimeType, item.extension),
  );

  const TitleTag = titleAs;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <TitleTag
            className={
              titleAs === "h1"
                ? "min-w-0 flex-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
                : "min-w-0 flex-1 text-xl font-semibold tracking-tight text-foreground"
            }
          >
            {post.title}
          </TitleTag>
          {meta ? <div className="shrink-0 text-right">{meta}</div> : null}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 md:text-[15px]">
          {post.body}
        </p>
      </div>

      {isAdminViewer ? (
        <div className="flex flex-wrap gap-1.5">
          {post.targetsAll ? (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
              Все юрлица
            </span>
          ) : (
            post.legalEntityIds.map((id) => (
              <span
                key={id}
                className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {resolveLegalEntityLabel(
                  entities,
                  id,
                  legalEntitiesEntity?.id ?? null,
                )}
              </span>
            ))
          )}
        </div>
      ) : null}

      {imageAttachments.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {imageAttachments.map((item) => (
            <FeedAttachmentThumb
              key={item.id}
              attachment={item}
              large={largeMedia}
            />
          ))}
        </div>
      ) : null}

      {fileAttachments.length > 0 ? (
        <div className="space-y-1.5">
          {fileAttachments.map((item) => (
            <FeedAttachmentThumb key={item.id} attachment={item} />
          ))}
        </div>
      ) : null}

      {externalLinks.length > 0 ? (
        <div className="space-y-1.5">
          {externalLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/10 px-3 py-2.5 text-sm text-primary transition-colors hover:bg-muted/30"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">
                {link.title.trim() || link.url}
              </span>
            </a>
          ))}
        </div>
      ) : null}

      {formLinks.length > 0 ? (
        <div className="space-y-2">
          {formLinks.map((link) => (
            <div
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/15 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Google Form</p>
                <p className="truncate text-sm font-medium">
                  {link.title.trim() || "Форма"}
                </p>
              </div>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-sm shadow-xs hover:bg-muted"
              >
                Перейти к заполнению
              </a>
            </div>
          ))}
        </div>
      ) : null}

      {post.poll ? (
        <NewsFeedPollBlock postId={post.id} poll={post.poll} />
      ) : null}
    </div>
  );
}
