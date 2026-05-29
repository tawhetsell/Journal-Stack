import Link from "next/link";
import type { Article, Journal, SavedArticle } from "@prisma/client";

import { OpenAccessIndicator } from "@/components/open-access-indicator";
import { getArticleRoutes } from "@/lib/resolver";
import { formatDate, joinAuthors, parseAuthors } from "@/lib/utils";

type ArticleCardProps = {
  article: Article & {
    journal: Journal;
    savedArticle: SavedArticle | null;
  };
};

export function ArticleCard({ article }: ArticleCardProps) {
  const routes = getArticleRoutes(article);
  const authors = parseAuthors(article.authorsJson);

  return (
    <article className="card-surface rounded-[1.5rem] p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{article.journal.title}</span>
              <span className="h-1 w-1 rounded-full bg-line" />
              <span>{formatDate(article.publicationDate)}</span>
              {routes.openAccessUrl ? (
                <>
                  <span className="h-1 w-1 rounded-full bg-line" />
                  <OpenAccessIndicator compact />
                </>
              ) : null}
            </div>
            <h2 className="display-title text-2xl leading-tight text-foreground">
              <Link href={`/articles/${article.id}`} className="hover:text-accent">
                {article.title}
              </Link>
            </h2>
          </div>
        </div>

        <p className="text-sm leading-6 text-muted">{joinAuthors(authors)}</p>

        {article.abstract ? (
          <p className="line-clamp-3 text-sm leading-7 text-muted">
            {article.abstract}
          </p>
        ) : (
          <p className="text-sm italic text-muted">No abstract stored yet.</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {routes.publisherUrl ? (
            <a
              href={`/api/articles/${article.id}/open?target=publisher`}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-accent-strong"
            >
              Open journal link
            </a>
          ) : null}
          <a
            href={`/api/articles/${article.id}/open?target=institution`}
            className="rounded-full border border-line bg-surface-strong/70 px-4 py-2 text-sm font-semibold text-foreground hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
          >
            Open via Institution
          </a>
        </div>
      </div>
    </article>
  );
}
