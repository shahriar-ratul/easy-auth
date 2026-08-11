import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";

export function Modal({
  title,
  description,
  isOpen,
  onClose,
  children,
}: {
  title: string;
  description: string;
  isOpen: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={isOpen} onClose={onClose} title={title} description={description}>
      {children}
    </Dialog>
  );
}
