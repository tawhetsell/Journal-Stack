CREATE TABLE IF NOT EXISTS "Journal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "issnPrint" TEXT,
    "issnElectronic" TEXT,
    "publisher" TEXT,
    "homepageUrl" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceConfig" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "doi" TEXT,
    "title" TEXT NOT NULL,
    "abstract" TEXT,
    "publicationDate" DATETIME,
    "authorsJson" TEXT,
    "publisherLandingUrl" TEXT,
    "openAccessUrl" TEXT,
    "directPdfUrl" TEXT,
    "sourcePayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Article_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "FollowedJournal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowedJournal_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SavedArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" DATETIME,
    CONSTRAINT "SavedArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AccessAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selectedRoute" TEXT NOT NULL,
    "resolvedUrl" TEXT,
    "outcome" TEXT NOT NULL,
    CONSTRAINT "AccessAttempt_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Journal_title_key" ON "Journal"("title");
CREATE UNIQUE INDEX IF NOT EXISTS "Article_sourceId_key" ON "Article"("sourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Article_doi_key" ON "Article"("doi");
CREATE INDEX IF NOT EXISTS "Article_journalId_publicationDate_idx" ON "Article"("journalId", "publicationDate");
CREATE UNIQUE INDEX IF NOT EXISTS "FollowedJournal_journalId_key" ON "FollowedJournal"("journalId");
CREATE UNIQUE INDEX IF NOT EXISTS "SavedArticle_articleId_key" ON "SavedArticle"("articleId");
CREATE INDEX IF NOT EXISTS "AccessAttempt_articleId_attemptedAt_idx" ON "AccessAttempt"("articleId", "attemptedAt");
