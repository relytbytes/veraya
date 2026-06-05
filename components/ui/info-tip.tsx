"use client";

import * as Popover from "@radix-ui/react-popover";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A subtle "(i)" affordance that explains a metric in a sentence or two. Doubles
 * as a live pitch aid — tap it in a demo to show the mechanic behind a number.
 */
export function InfoTip({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={title ? `How "${title}" works` : "How this works"}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center justify-center align-middle text-gray-300 transition-colors hover:text-teal-500 focus:outline-none focus-visible:text-teal-500",
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          onClick={(e) => e.stopPropagation()}
          className="z-50 w-[260px] rounded-xl border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          {title && <p className="mb-1 font-semibold text-gray-900">{title}</p>}
          {children}
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
