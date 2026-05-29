import Link from "next/link";

import { refreshJournalAction, toggleFollowAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { DeleteJournalButton } from "@/components/delete-journal-button";
import { JournalForm, type JournalFormValues } from "@/components/journal-form";
import { LocalStats } from "@/components/local-stats";
import { getJournalDirectory } from "@/lib/journals";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

type JournalsPageProps = {
  searchParams: Promise<{ edit?: string | string[] }>;
};

function getSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function JournalsPage({
  searchParams,
}: JournalsPageProps) {
  const journals = await getJournalDirectory();
  const editId = getSingle((await searchParams).edit);
  const editing = editId
    ? journals.find((journal) => journal.id === editId)
    : undefined;

  const editValues: JournalFormValues | undefined = editing
    ? {
        id: editing.id,
        title: editing.title,
        sourceType: editing.sourceType,
        sourceUrl: editing.sourceUrl,
        issnElectronic: editing.issnElectronic,
        issnPrint: editing.issnPrint,
        publisher: editing.publisher,
        homepageUrl: editing.homepageUrl,
        followed: Boolean(editing.follow),
      }
    : undefined;

  return (
    <AppShell
      title="Journals"
      description={site.tagline}
      descriptionProminent
      headerAside={<LocalStats />}
    >
      <div className="space-y-6">
        <section className="card-surface rounded-[1.75rem] p-6 sm:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <p className="text-sm uppercase tracking-[0.28em] text-muted">
                {editing ? "Edit journal" : "Add a journal"}
              </p>
              <h2 className="display-title mt-3 text-3xl">
                {editing ? editing.title : "Add journal"}
              </h2>
              {editing ? (
                <div className="mt-3 space-y-3 text-sm leading-7 text-muted">
                  <p>Update this journal&apos;s details, then save changes.</p>
                  <Link
                    href="/journals"
                    className="inline-flex rounded-full border border-line px-4 py-2 text-xs font-semibold text-foreground hover:border-accent/40 hover:text-accent"
                  >
                    Cancel editing
                  </Link>
                </div>
              ) : (
                <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-7 text-muted">
                  <li>Enter the journal title.</li>
                  <li>
                    Pick how to pull articles: an <strong>RSS feed URL</strong>,
                    or <strong>Crossref</strong> using the journal&apos;s ISSN.
                  </li>
                  <li>
                    Use <strong>Look up journal details</strong> to auto-fill
                    publisher, homepage, and ISSNs.
                  </li>
                  <li>Save, then refresh the journal to pull its articles.</li>
                </ol>
              )}
            </div>
            <div className="w-full lg:max-w-xl">
              <JournalForm journal={editValues} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {journals.map((journal) => (
            <article
              key={journal.id}
              className="card-surface rounded-[1.5rem] p-5 sm:p-6"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="display-title text-2xl">{journal.title}</h3>
                    <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                      {journal.sourceType}
                    </span>
                    {journal.follow ? (
                      <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                        Followed
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted">
                    {journal.publisher || "Publisher not set"} ·{" "}
                    {journal._count.articles} cached articles
                  </p>
                  <div className="space-y-1 text-sm text-muted">
                    {journal.sourceUrl ? <p>Source: {journal.sourceUrl}</p> : null}
                    {journal.issnElectronic || journal.issnPrint ? (
                      <p>
                        ISSN: {[journal.issnElectronic, journal.issnPrint]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <form action={toggleFollowAction}>
                    <input type="hidden" name="journalId" value={journal.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-accent-strong"
                    >
                      {journal.follow ? "Unfollow" : "Follow"}
                    </button>
                  </form>
                  <form action={refreshJournalAction}>
                    <input type="hidden" name="journalId" value={journal.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
                    >
                      Refresh source
                    </button>
                  </form>
                  <Link
                    href={`/journals?edit=${journal.id}`}
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
                  >
                    Edit
                  </Link>
                  <DeleteJournalButton
                    journalId={journal.id}
                    title={journal.title}
                  />
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
