import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Minimal shadcn-style modal built on the native <dialog> element — no extra dependency needed. */
export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className={cn(
        "m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5 p-6">
        <h3 className="text-lg font-semibold leading-none tracking-tight">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="px-6 pb-6">{children}</div>
    </dialog>
  );
}
