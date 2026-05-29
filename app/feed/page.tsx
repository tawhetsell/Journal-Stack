import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { ArticleCard } from "@/components/article-card";
import { LocalStats } from "@/components/local-stats";
import { refreshAllAction } from "@/app/actions";
import { getFeedArticles, type FeedSort } from "@/lib/articles";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

type FeedPageProps = {
  searchParams: Promise<{
    view?: string | string[];
    sort?: string | string[];
  }>;
};

function getSingleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildFeedHref(view: "journals" | "articles", sort: FeedSort) {
  const params = new URLSearchParams();

  if (view === "articles") {
    params.set("view", "articles");
  }

  if (sort === "viewed") {
    params.set("sort", "viewed");
  }

  const query = params.toString();
  return query ? `/feed?${query}` : "/feed";
}

function groupArticlesByJournal(
  articles: Awaited<ReturnType<typeof getFeedArticles>>,
) {
  const groups = new Map<
    string,
    {
      journalTitle: string;
      articles: typeof articles;
    }
  >();

  for (const article of articles) {
    const existing = groups.get(article.journalId);

    if (existing) {
      existing.articles.push(article);
      continue;
    }

    groups.set(article.journalId, {
      journalTitle: article.journal.title,
      articles: [article],
    });
  }

  return Array.from(groups.entries()).map(([journalId, group]) => ({
    journalId,
    ...group,
  }));
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const query = await searchParams;
  const viewParam = getSingleQueryValue(query.view);
  const sortParam = getSingleQueryValue(query.sort);
  const groupedView = viewParam !== "articles";
  const sortBy: FeedSort = sortParam === "viewed" ? "viewed" : "recent";
  const articles = await getFeedArticles(sortBy);
  const journalGroups = groupArticlesByJournal(articles);

  return (
    <AppShell
      title="Feed"
      description={site.tagline}
      descriptionProminent
      headerAside={<LocalStats />}
    >
      <div className="space-y-4">
        <section className="card-surface rounded-[1.75rem] p-4 sm:p-5">
          <div className="flex flex-wrap gap-3">
            <Link
              href={buildFeedHref(groupedView ? "articles" : "journals", sortBy)}
              className="rounded-full border border-line bg-surface-strong/70 px-5 py-3 text-sm font-semibold text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
            >
              {groupedView ? "Article View" : "Journal View"}
            </Link>
            <Link
              href={buildFeedHref(
                groupedView ? "journals" : "articles",
                sortBy === "recent" ? "viewed" : "recent",
              )}
              className="rounded-full border border-line bg-surface-strong/70 px-5 py-3 text-sm font-semibold text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
            >
              {sortBy === "recent" ? "Most Viewed" : "Most Recent"}
            </Link>
            <form action={refreshAllAction}>
              <button
                type="submit"
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-accent-strong"
              >
                Refresh followed journals
              </button>
            </form>
          </div>
        </section>
        {articles.length > 0 ? (
          groupedView ? (
            journalGroups.map((group) => (
              <details
                key={group.journalId}
                className="card-surface rounded-[1.75rem] p-5 sm:p-6"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.24em] text-muted">
                        Journal feed
                      </p>
                      <h2 className="display-title text-2xl text-foreground">
                        {group.journalTitle}
                      </h2>
                    </div>
                    <div className="rounded-full border border-line bg-surface-strong/70 px-4 py-2 text-sm font-semibold text-foreground">
                      {group.articles.length} article
                      {group.articles.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </summary>
                <div className="mt-5 space-y-4 border-t border-line pt-5">
                  {group.articles.map((article) => (
                    <ArticleCard key={article.id} article={article} />
                  ))}
                </div>
              </details>
            ))
          ) : (
            articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))
          )
        ) : (
          <div className="card-surface rounded-[1.75rem] p-8 prose-copy">
            <h2 className="display-title text-3xl text-foreground">
              No articles yet
            </h2>
            <p className="mt-3">
              Seed data creates journal records, not a fake inbox. Use the
              refresh button to pull live metadata from RSS or Crossref-backed
              sources, or add your own journals on the journals page.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
