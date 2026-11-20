"use client";

import { useState } from "react";

import { refreshAllAction, refreshJournalAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import type { RefreshSummary } from "@/lib/types";

type RefreshButtonProps = {
  label: string;
  className: string;
  // Omit to refresh every followed journal.
  journalId?: string;
};

export function RefreshButton({
  label,
  className,
  journalId,
}: RefreshButtonProps) {
  const [summary, setSummary] = useState<RefreshSummary | null>(null);

  async function handleRefresh(formData: FormData) {
    setSummary(null);
    setSummary(
      journalId
        ? await refreshJournalAction(formData)
        : await refreshAllAction(),
    );
  }

  return (
    <form action={handleRefresh} className="flex flex-wrap items-center gap-3">
      {journalId ? (
        <input type="hidden" name="journalId" value={journalId} />
      ) : null}
      <SubmitButton pendingLabel="Refreshing…" className={className}>
        {label}
      </SubmitButton>
      {summary ? (
        <p
          role="status"
          className={`max-w-xl text-sm ${summary.failed ? "text-danger" : "text-muted"}`}
        >
          {summary.message}
        </p>
      ) : null}
    </form>
  );
}
