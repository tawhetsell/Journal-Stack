"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
};

// Must be rendered inside the <form> whose action it reports on.
export function SubmitButton({
  children,
  pendingLabel,
  className = "",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-60`.trim()}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
