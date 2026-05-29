"use client";

import { useState } from "react";

import { createJournalAction, updateJournalAction } from "@/app/actions";

export type JournalFormValues = {
  id?: string;
  title?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  issnElectronic?: string | null;
  issnPrint?: string | null;
  publisher?: string | null;
  homepageUrl?: string | null;
  followed?: boolean;
};

const inputClass =
  "rounded-2xl border border-line bg-surface-strong/70 px-4 py-3 text-sm outline-none focus:border-accent";
const labelClass =
  "text-xs font-semibold uppercase tracking-[0.18em] text-muted";

export function JournalForm({ journal }: { journal?: JournalFormValues }) {
  const isEdit = Boolean(journal?.id);

  const [sourceType, setSourceType] = useState(journal?.sourceType ?? "rss");
  const [title, setTitle] = useState(journal?.title ?? "");
  const [sourceUrl, setSourceUrl] = useState(journal?.sourceUrl ?? "");
  const [issnElectronic, setIssnElectronic] = useState(
    journal?.issnElectronic ?? "",
  );
  const [issnPrint, setIssnPrint] = useState(journal?.issnPrint ?? "");
  const [publisher, setPublisher] = useState(journal?.publisher ?? "");
  const [homepageUrl, setHomepageUrl] = useState(journal?.homepageUrl ?? "");
  const [showMore, setShowMore] = useState(false);

  const [lookupStatus, setLookupStatus] = useState<
    "idle" | "loading" | "error" | "done"
  >("idle");
  const [lookupMessage, setLookupMessage] = useState("");

  const isRss = sourceType === "rss";

  async function handleLookup() {
    setLookupStatus("loading");
    setLookupMessage("");

    const params = new URLSearchParams({ type: sourceType });
    if (isRss) {
      params.set("url", sourceUrl);
    } else {
      params.set("issn", issnElectronic || issnPrint);
    }

    try {
      const res = await fetch(`/api/journal-lookup?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setLookupStatus("error");
        setLookupMessage(data.error ?? "Lookup failed.");
        return;
      }

      if (data.title && !title.trim()) setTitle(data.title);
      if (data.publisher) setPublisher(data.publisher);
      if (data.homepageUrl) setHomepageUrl(data.homepageUrl);
      if (data.issnPrint) setIssnPrint(data.issnPrint);
      if (data.issnElectronic) setIssnElectronic(data.issnElectronic);

      setShowMore(true);
      setLookupStatus("done");
      setLookupMessage("Filled in what we could find. Review below, then save.");
    } catch {
      setLookupStatus("error");
      setLookupMessage("Lookup failed. Check the value and try again.");
    }
  }

  return (
    <form
      action={isEdit ? updateJournalAction : createJournalAction}
      className="grid w-full gap-4"
    >
      {isEdit ? (
        <input type="hidden" name="journalId" value={journal?.id} />
      ) : null}

      {/* 1. Title */}
      <label className="grid gap-1.5">
        <span className={labelClass}>Journal title (required)</span>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Public Administration Review"
          className={inputClass}
          required
        />
      </label>

      {/* 2. Source type */}
      <label className="grid gap-1.5">
        <span className={labelClass}>How should we pull articles?</span>
        <select
          name="sourceType"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          className={inputClass}
        >
          <option value="rss">RSS feed</option>
          <option value="crossref">Crossref (by ISSN)</option>
        </select>
      </label>

      {/* 3. Primary source identifier + lookup */}
      {isRss ? (
        <label className="grid gap-1.5">
          <span className={labelClass}>RSS feed URL (required for RSS)</span>
          <input
            name="sourceUrl"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://onlinelibrary.wiley.com/feed/15406210/most-recent"
            className={inputClass}
          />
        </label>
      ) : (
        <label className="grid gap-1.5">
          <span className={labelClass}>
            Electronic ISSN (required for Crossref)
          </span>
          <input
            name="issnElectronic"
            value={issnElectronic}
            onChange={(e) => setIssnElectronic(e.target.value)}
            placeholder="1540-6210"
            className={inputClass}
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleLookup}
          disabled={lookupStatus === "loading"}
          className="rounded-full border border-line bg-surface-strong/70 px-4 py-2 text-sm font-semibold text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent disabled:opacity-50"
        >
          {lookupStatus === "loading" ? "Looking up…" : "Look up journal details"}
        </button>
        {lookupMessage ? (
          <span
            className={`text-sm ${lookupStatus === "error" ? "text-red-500" : "text-muted"}`}
          >
            {lookupMessage}
          </span>
        ) : null}
      </div>

      {/* 4. Optional extra details (kept in DOM so they always submit) */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="justify-self-start text-sm font-semibold text-accent hover:underline"
      >
        {showMore ? "Hide extra details" : "More details (optional)"}
      </button>

      <div className={showMore ? "grid gap-4 sm:grid-cols-2" : "hidden"}>
        <label className="grid gap-1.5">
          <span className={labelClass}>Publisher</span>
          <input
            name="publisher"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1.5">
          <span className={labelClass}>Homepage URL</span>
          <input
            name="homepageUrl"
            value={homepageUrl}
            onChange={(e) => setHomepageUrl(e.target.value)}
            className={inputClass}
          />
        </label>
        {/* The non-primary ISSN lives here so each field appears once. */}
        {isRss ? (
          <label className="grid gap-1.5">
            <span className={labelClass}>Electronic ISSN</span>
            <input
              name="issnElectronic"
              value={issnElectronic}
              onChange={(e) => setIssnElectronic(e.target.value)}
              className={inputClass}
            />
          </label>
        ) : null}
        <label className="grid gap-1.5">
          <span className={labelClass}>Print ISSN</span>
          <input
            name="issnPrint"
            value={issnPrint}
            onChange={(e) => setIssnPrint(e.target.value)}
            className={inputClass}
          />
        </label>
        {/* Keep the RSS URL in the payload when using Crossref, and vice
            versa, so switching source type never silently drops a value. */}
        {isRss ? null : (
          <input type="hidden" name="sourceUrl" value={sourceUrl} />
        )}
      </div>

      {/* 5. Follow toggle */}
      <label className="flex items-center gap-3 rounded-2xl border border-line bg-surface-strong/70 px-4 py-3 text-sm text-foreground">
        <input
          type="checkbox"
          name="followNow"
          defaultChecked={journal?.followed ?? !isEdit}
          className="accent-[var(--accent)]"
        />
        Follow this journal (show its articles in the feed)
      </label>

      <button
        type="submit"
        className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-accent-strong"
      >
        {isEdit ? "Save changes" : "Add journal"}
      </button>
    </form>
  );
}
