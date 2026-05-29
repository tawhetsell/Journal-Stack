"use client";

import { deleteJournalAction } from "@/app/actions";

export function DeleteJournalButton({
  journalId,
  title,
}: {
  journalId: string;
  title: string;
}) {
  return (
    <form
      action={deleteJournalAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Delete "${title}"? This also removes its cached articles and saved items.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="journalId" value={journalId} />
      <button
        type="submit"
        className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-red-500 hover:-translate-y-0.5 hover:border-red-400/50"
      >
        Delete
      </button>
    </form>
  );
}
