"use client";

import Link from "next/link";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

// Safety net for anything a page or server action throws unexpectedly.
// Expected problems (form validation, refresh failures) are shown inline.
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card-surface prose-copy max-w-xl rounded-[1.75rem] p-8">
        <h1 className="display-title text-3xl text-foreground">
          Something went wrong
        </h1>
        <p className="mt-3">
          Journal Stack hit an unexpected error. Your journals and saved
          articles are untouched.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-accent-fill px-5 py-3 text-sm font-semibold text-on-accent hover:-translate-y-0.5 hover:bg-accent-fill-strong"
          >
            Try again
          </button>
          <Link
            href="/feed"
            className="rounded-full border border-line px-5 py-3 text-sm font-semibold text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
          >
            Back to feed
          </Link>
        </div>
      </div>
    </div>
  );
}
