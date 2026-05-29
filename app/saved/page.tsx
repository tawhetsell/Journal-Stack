import { AppShell } from "@/components/app-shell";
import { ArticleCard } from "@/components/article-card";
import { LocalStats } from "@/components/local-stats";
import { getSavedArticles } from "@/lib/articles";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const saved = await getSavedArticles();

  return (
    <AppShell
      title="Saved"
      description={site.tagline}
      descriptionProminent
      headerAside={<LocalStats />}
    >
      <div className="space-y-4">
        {saved.length > 0 ? (
          saved.map(({ article, ...savedEntry }) => (
            <ArticleCard
              key={article.id}
              article={{ ...article, savedArticle: savedEntry }}
            />
          ))
        ) : (
          <div className="card-surface rounded-[1.75rem] p-8 prose-copy">
            <h2 className="display-title text-3xl text-foreground">
              Nothing saved yet
            </h2>
            <p className="mt-3">
              Save directly from the feed or an article detail page when you want
              a lightweight reading queue.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
