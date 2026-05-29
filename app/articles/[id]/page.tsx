import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { OpenAccessIndicator } from "@/components/open-access-indicator";
import { getArticleById } from "@/lib/articles";
import { getArticleRoutes } from "@/lib/resolver";
import { formatDate, joinAuthors, parseAuthors } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ArticlePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { id } = await params;
  const article = await getArticleById(id);

  if (!article) {
    notFound();
  }

  const routes = getArticleRoutes(article);
  const authors = parseAuthors(article.authorsJson);

  return (
    <AppShell
      title={article.title}
      titleTone="page"
      description={`From ${article.journal.title}. Publisher link and institution link.`}
      aside={
        <div className="card-surface rounded-[1.75rem] p-6">
          <p className="text-sm uppercase tracking-[0.28em] text-muted">
            Metadata
          </p>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-muted">
                Journal
              </dt>
              <dd className="mt-1 text-foreground">{article.journal.title}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-muted">
                Publication date
              </dt>
              <dd className="mt-1 text-foreground">
                {formatDate(article.publicationDate)}
              </dd>
            </div>
            {article.doi ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-muted">
                  DOI
                </dt>
                <dd className="mt-1 break-all text-foreground">
                  <a
                    href={`https://doi.org/${article.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-accent"
                  >
                    {article.doi}
                  </a>
                </dd>
              </div>
            ) : null}
            {routes.openAccessUrl ? (
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-muted">
                  Access
                </dt>
                <dd className="mt-2 text-foreground">
                  <OpenAccessIndicator />
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="card-surface rounded-[1.75rem] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm leading-7 text-muted">{joinAuthors(authors)}</p>
              <div className="flex flex-wrap gap-3">
                {routes.publisherUrl ? (
                  <a
                    href={`/api/articles/${article.id}/open?target=publisher`}
                    className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-accent-strong"
                  >
                    Open journal link
                  </a>
                ) : null}
                <a
                  href={`/api/articles/${article.id}/open?target=institution`}
                  className="rounded-full border border-line bg-surface-strong/70 px-5 py-3 text-sm font-semibold text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
                >
                  Open via Institution
                </a>
              </div>
            </div>
            <div className="max-w-sm rounded-[1.5rem] border border-line bg-surface-strong/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Link note
              </p>
              <p className="mt-3 text-sm leading-7 text-muted">
                `Open journal link` takes you straight to the publisher-side
                article page. `Open via Institution` takes you to the library
                resolver page for the same article.
              </p>
            </div>
          </div>
        </section>

        <section className="card-surface rounded-[1.75rem] p-6 sm:p-8 prose-copy">
          <h2 className="display-title text-3xl text-foreground">Abstract</h2>
          {article.abstract ? (
            <p className="mt-4">{article.abstract}</p>
          ) : (
            <p className="mt-4">No abstract was captured for this article.</p>
          )}
        </section>

        <Link
          href="/feed"
          className="inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
        >
          Back to feed
        </Link>
      </div>
    </AppShell>
  );
}
