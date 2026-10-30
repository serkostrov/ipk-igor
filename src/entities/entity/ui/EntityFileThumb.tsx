import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";
import {
  getEntityFilePreviewKind,
  resolveEntityFileUrl,
} from "../lib/file-preview";
import { EntityFileIcon } from "./EntityFileIcon";

type EntityFileThumbProps = {
  name: string;
  mimeType?: string;
  storagePath?: string;
  dataUrl?: string;
  className?: string;
  iconClassName?: string;
  iconSizeClassName?: string;
};

export function EntityFileThumb({
  name,
  mimeType,
  storagePath,
  dataUrl,
  className,
  iconClassName,
  iconSizeClassName,
}: EntityFileThumbProps) {
  const kind = getEntityFilePreviewKind({ name, mimeType });
  const localSrc = dataUrl?.trim() || null;
  const path = storagePath?.trim() || null;
  const [remote, setRemote] = useState<{ path: string; url: string } | null>(
    null,
  );
  const [failedPath, setFailedPath] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "image" || localSrc || !path) return;

    let cancelled = false;
    void resolveEntityFileUrl({ storagePath: path, dataUrl })
      .then((url) => {
        if (!cancelled) setRemote({ path, url });
      })
      .catch(() => {
        if (!cancelled) setFailedPath(path);
      });

    return () => {
      cancelled = true;
    };
  }, [kind, localSrc, path, dataUrl]);

  const remoteSrc = remote?.path === path ? remote.url : null;
  const failed = failedPath != null && failedPath === (localSrc ?? path);
  const src = localSrc ?? remoteSrc;

  if (kind === "image" && src && !failed) {
    return (
      <span
        className={cn(
          "flex size-8 shrink-0 overflow-hidden rounded-md bg-muted/50 ring-1 ring-border/60",
          className,
        )}
      >
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailedPath(localSrc ?? path)}
        />
      </span>
    );
  }

  return (
    <EntityFileIcon
      name={name}
      mimeType={mimeType}
      className={className}
      iconClassName={cn(iconSizeClassName, iconClassName)}
    />
  );
}
