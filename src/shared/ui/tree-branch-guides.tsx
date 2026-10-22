import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type TreeBranchTone = "default" | "sidebar";

type TreeBranchGuidesProps = {
  isFirst?: boolean;
  isLast?: boolean;
  /**
   * Left offset of the stem (border-l / 1px line).
   * Must equal the horizontal center of the parent chevron / icon.
   */
  className?: string;
  /**
   * Horizontal arm length to the right of the stem.
   * Keep short enough that the arm ends before child content.
   */
  armClassName?: string;
  tone?: TreeBranchTone;
  /**
   * Fixed Y of the elbow from the top of the row (px).
   * Use when the row can grow taller than one line (nested groups).
   * When omitted, the elbow sits at 50% of the container height.
   */
  elbowTopPx?: number;
};

const TONE_BORDER: Record<TreeBranchTone, string> = {
  default: "border-border",
  sidebar: "border-sidebar-foreground/25",
};

const TONE_STEM: Record<TreeBranchTone, string> = {
  default: "bg-border",
  sidebar: "bg-sidebar-foreground/25",
};

const FIRST_EXTEND = 10;
/** Overlap continuing stem into the elbow so row joints don't gap. */
const SEAL = 1;

/**
 * Rounded L-elbow only — no separate sharp stem/arm through the joint.
 * Non-last rows continue the vertical stem below the curve.
 */
export function TreeBranchGuides({
  isFirst = false,
  isLast = false,
  className,
  armClassName = "w-2",
  tone = "default",
  elbowTopPx,
}: TreeBranchGuidesProps) {
  const border = TONE_BORDER[tone];
  const stem = TONE_STEM[tone];

  if (elbowTopPx != null) {
    return (
      <>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute rounded-bl-[6px] border-b border-l",
            armClassName,
            border,
            className,
          )}
          style={{
            top: isFirst ? -FIRST_EXTEND : 0,
            height: isFirst ? elbowTopPx + FIRST_EXTEND : elbowTopPx,
          }}
        />
        {!isLast ? (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-0 w-px",
              stem,
              className,
            )}
            style={{ top: elbowTopPx - SEAL }}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute rounded-bl-[6px] border-b border-l",
          armClassName,
          border,
          isFirst ? "-top-2.5 h-[calc(50%+10px)]" : "top-0 h-1/2",
          className,
        )}
      />
      {!isLast ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-0 w-px",
            stem,
            className,
          )}
          style={{ top: `calc(50% - ${SEAL}px)` }}
        />
      ) : null}
    </>
  );
}

/** Child row wrapper with rounded tree elbow (sidebar / pickers). */
export function TreeBranchRow({
  isFirst = false,
  isLast = false,
  tone = "default",
  insetClassName = "ml-3",
  /** Padding before child content — must clear stem + arm + gap. */
  contentClassName = "pl-3.5",
  /** Defaults to center of a 36px row. */
  elbowTopPx = 18,
  children,
}: {
  isFirst?: boolean;
  isLast?: boolean;
  tone?: TreeBranchTone;
  insetClassName?: string;
  contentClassName?: string;
  elbowTopPx?: number;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative min-h-9", insetClassName)}>
      <TreeBranchGuides
        isFirst={isFirst}
        isLast={isLast}
        className="left-0"
        armClassName="w-2"
        tone={tone}
        elbowTopPx={elbowTopPx}
      />
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </div>
  );
}
