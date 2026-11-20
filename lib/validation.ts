import { z } from "zod";

import { safeHttpUrl } from "@/lib/utils";

function optionalHttpUrl(label: string) {
  return z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || safeHttpUrl(value) !== null, {
      message: `${label} must be a full URL starting with http:// or https://.`,
    });
}

// Messages here are shown to the user next to the journal form.
export const journalFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, { message: "Enter a journal title of at least 2 characters." }),
    publisher: z.string().trim().optional(),
    homepageUrl: optionalHttpUrl("Homepage URL"),
    issnPrint: z.string().trim().optional(),
    issnElectronic: z.string().trim().optional(),
    sourceType: z.enum(["rss", "crossref"], {
      message: "Choose RSS or Crossref as the source.",
    }),
    sourceUrl: optionalHttpUrl("RSS feed URL"),
    followNow: z.boolean().optional(),
  })
  .superRefine((journal, ctx) => {
    // Without these a journal saves fine and then refreshes to nothing.
    if (journal.sourceType === "rss" && !journal.sourceUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "An RSS journal needs a feed URL.",
      });
    }

    if (
      journal.sourceType === "crossref" &&
      !journal.issnElectronic &&
      !journal.issnPrint
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["issnElectronic"],
        message: "A Crossref journal needs an ISSN.",
      });
    }
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

// Messages here are shown to the user in the institution dialog.
export const institutionFormSchema = z.discriminatedUnion("choice", [
  z.object({
    choice: z.literal("preset"),
    resolverUrl: z.string().trim().min(1, { message: "Choose an institution." }),
  }),
  z.object({
    choice: z.literal("custom"),
    name: z.string().trim().max(120).optional(),
    resolverUrl: z
      .string()
      .trim()
      .min(1, { message: "Enter your library's link-resolver address." })
      .max(2000, { message: "That address is too long." })
      .refine((value) => safeHttpUrl(value) !== null, {
        message:
          "The address must be a full URL starting with http:// or https://.",
      }),
  }),
  z.object({ choice: z.literal("none") }),
]);
