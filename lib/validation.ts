import { z } from "zod";

export const journalFormSchema = z.object({
  title: z.string().trim().min(2),
  publisher: z.string().trim().optional(),
  homepageUrl: z.string().trim().url().optional().or(z.literal("")),
  issnPrint: z.string().trim().optional(),
  issnElectronic: z.string().trim().optional(),
  sourceType: z.enum(["rss", "crossref"]),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  followNow: z.boolean().optional(),
});

export const refreshRequestSchema = z.object({
  journalId: z.string().trim().optional(),
});

export const resolveRequestSchema = z.object({
  articleId: z.string().trim().optional(),
  doi: z.string().trim().optional(),
  title: z.string().trim().optional(),
  journalTitle: z.string().trim().optional(),
});
