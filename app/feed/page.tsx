import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { ArticleCard } from "@/components/article-card";
import { LocalStats } from "@/components/local-stats";
import { RefreshButton } from "@/components/refresh-button";
import {
  getFeedArticles,
  getFeedJournalGroups,
  type FeedSort,
} from "@/lib/articles";
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

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const query = await searchParams;
  const viewParam = getSingleQueryValue(query.view);
  const sortParam = getSingleQueryValue(query.sort);
  const groupedView = viewParam !== "articles";
  const sortBy: FeedSort = sortParam === "viewed" ? "viewed" : "recent";
  // Each view has its own query: Journal View takes the top articles per
  // journal, Article View the top articles overall.
  const journalGroups = groupedView ? await getFeedJournalGroups(sortBy) : [];
  const articles = groupedView ? [] : await getFeedArticles(sortBy);
  const hasArticles = groupedView
    ? journalGroups.length > 0
    : articles.length > 0;

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
            <RefreshButton
              label="Refresh followed journals"
              className="rounded-full bg-accent-fill px-5 py-3 text-sm font-semibold text-on-accent hover:-translate-y-0.5 hover:bg-accent-fill-strong"
            />
          </div>
        </section>
        {hasArticles ? (
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
                      {group.articles.length < group.totalArticles
                        ? `${sortBy === "viewed" ? "Top" : "Latest"} ${group.articles.length} of ${group.totalArticles}`
                        : `${group.totalArticles} article${group.totalArticles === 1 ? "" : "s"}`}
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
