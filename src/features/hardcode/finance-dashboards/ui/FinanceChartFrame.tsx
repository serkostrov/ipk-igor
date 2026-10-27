import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type ChartSize = {
  width: number;
  height: number;
};

/**
 * Measures the chart host and only mounts children when size is positive.
 * Avoids recharts hangs on zero-size / hidden hosts.
 */
export function FinanceChartFrame({
  className,
  children,
}: {
  className?: string;
  children: (size: ChartSize) => ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 });

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      const width = Math.max(0, Math.floor(rect.width));
      const height = Math.max(0, Math.floor(rect.height));
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className={cn("relative w-full", className)}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}
