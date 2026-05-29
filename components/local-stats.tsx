import { db } from "@/lib/db";

export async function LocalStats() {
  const [followedCount, totalCount] = await Promise.all([
    db.followedJournal.count(),
    db.article.count(),
  ]);

  return (
    <div className="rounded-[1.5rem] border border-line bg-surface-strong/70 p-5">
      <p className="text-sm uppercase tracking-[0.28em] text-muted">
        Local stats
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-muted">
            Followed journals
          </dt>
          <dd className="display-title mt-1 text-3xl">{followedCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-muted">
            Cached articles
          </dt>
          <dd className="display-title mt-1 text-3xl">{totalCount}</dd>
        </div>
      </dl>
    </div>
  );
}
