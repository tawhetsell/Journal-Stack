"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { findInstitutionPreset } from "@/lib/institutions";
import { refreshFollowedJournals } from "@/lib/refresh";
import { saveInstitutionSetting } from "@/lib/settings";
import type { ActionResult, RefreshSummary } from "@/lib/types";
import { institutionFormSchema, journalFormSchema } from "@/lib/validation";

function cleanOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseJournalForm(formData: FormData) {
  return journalFormSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    publisher: cleanOptional(formData.get("publisher")),
    homepageUrl: cleanOptional(formData.get("homepageUrl")),
    issnPrint: cleanOptional(formData.get("issnPrint")),
    issnElectronic: cleanOptional(formData.get("issnElectronic")),
    sourceType: String(formData.get("sourceType") ?? ""),
    sourceUrl: cleanOptional(formData.get("sourceUrl")),
    followNow: formData.get("followNow") === "on",
  });
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export async function createJournalAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseJournalForm(formData);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Journal form data is invalid.",
    };
  }

  const { followNow, ...journalData } = parsed.data;

  // Titles are unique. Adding one that exists used to overwrite that journal.
  const duplicate = await db.journal.findUnique({
    where: { title: journalData.title },
  });

  if (duplicate) {
    return {
      ok: false,
      error: `"${journalData.title}" is already in your journals. Use Edit on it to make changes.`,
    };
  }

  const journal = await db.journal.create({
    data: {
      ...journalData,
      publisher: journalData.publisher ?? null,
      homepageUrl: journalData.homepageUrl ?? null,
      sourceUrl: journalData.sourceUrl ?? null,
      issnPrint: journalData.issnPrint ?? null,
      issnElectronic: journalData.issnElectronic ?? null,
      active: true,
    },
  });

  if (followNow) {
    await db.followedJournal.upsert({
      where: { journalId: journal.id },
      update: {},
      create: { journalId: journal.id },
    });
  }

  revalidatePath("/journals");
  revalidatePath("/feed");

  return { ok: true };
}

export async function updateJournalAction(
  formData: FormData,
): Promise<ActionResult> {
  const journalId = String(formData.get("journalId") ?? "");

  if (!journalId) {
    return { ok: false, error: "Missing journal id." };
  }

  const parsed = parseJournalForm(formData);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Journal form data is invalid.",
    };
  }

  const { followNow, ...journalData } = parsed.data;

  const existing = await db.journal.findUnique({ where: { id: journalId } });

  if (!existing) {
    return { ok: false, error: "That journal no longer exists." };
  }

  const duplicate = await db.journal.findFirst({
    where: { title: journalData.title, id: { not: journalId } },
  });

  if (duplicate) {
    return {
      ok: false,
      error: `Another journal is already titled "${journalData.title}".`,
    };
  }

  await db.journal.update({
    where: { id: journalId },
    data: {
      ...journalData,
      publisher: journalData.publisher ?? null,
      homepageUrl: journalData.homepageUrl ?? null,
      sourceUrl: journalData.sourceUrl ?? null,
      issnPrint: journalData.issnPrint ?? null,
      issnElectronic: journalData.issnElectronic ?? null,
    },
  });

  // The follow checkbox is authoritative in edit mode.
  if (followNow) {
    await db.followedJournal.upsert({
      where: { journalId },
      update: {},
      create: { journalId },
    });
  } else {
    await db.followedJournal.deleteMany({ where: { journalId } });
  }

  revalidatePath("/journals");
  revalidatePath("/feed");

  return { ok: true };
}

export async function deleteJournalAction(formData: FormData) {
  const journalId = String(formData.get("journalId") ?? "");

  if (!journalId) {
    return;
  }

  await db.journal.delete({ where: { id: journalId } });

  revalidatePath("/journals");
  revalidatePath("/feed");
}

export async function toggleFollowAction(formData: FormData) {
  const journalId = String(formData.get("journalId") ?? "");

  if (!journalId) {
    return;
  }

  const existing = await db.followedJournal.findUnique({
    where: { journalId },
  });

  if (existing) {
    await db.followedJournal.delete({ where: { journalId } });
  } else {
    await db.followedJournal.create({ data: { journalId } });
  }

  revalidatePath("/journals");
  revalidatePath("/feed");
}

export async function toggleSaveAction(formData: FormData) {
  const articleId = String(formData.get("articleId") ?? "");

  if (!articleId) {
    return;
  }

  // deleteMany does not throw when a double-click already removed the row.
  const removed = await db.savedArticle.deleteMany({ where: { articleId } });

  if (removed.count === 0) {
    await db.savedArticle.upsert({
      where: { articleId },
      update: {},
      create: { articleId },
    });
  }

  revalidatePath("/feed");
  revalidatePath("/saved");
  revalidatePath(`/articles/${articleId}`);
}

async function runRefresh(journalId?: string): Promise<RefreshSummary> {
  const { results } = await refreshFollowedJournals(journalId);

  revalidatePath("/feed");
  revalidatePath("/journals");

  if (results.length === 0) {
    return {
      failed: false,
      message: journalId
        ? "That journal no longer exists."
        : "No followed journals to refresh.",
    };
  }

  const failures = results.filter((result) => result.error);
  const created = results.reduce((sum, result) => sum + result.created, 0);
  const fetched = results.reduce((sum, result) => sum + result.total, 0);
  const parts: string[] = [];

  if (failures.length < results.length) {
    parts.push(
      fetched === 0
        ? "No articles were returned by the source."
        : `Checked ${plural(results.length - failures.length, "journal")}: ${plural(created, "new article")}.`,
    );
  }

  if (failures.length > 0) {
    const details = failures
      .map((result) => `${result.title} (${result.error})`)
      .join("; ");
    parts.push(`${plural(failures.length, "journal")} failed: ${details}.`);
  }

  return { failed: failures.length > 0, message: parts.join(" ") };
}

export async function refreshAllAction(): Promise<RefreshSummary> {
  return runRefresh();
}

export async function refreshJournalAction(
  formData: FormData,
): Promise<RefreshSummary> {
  const journalId = String(formData.get("journalId") ?? "");

  if (!journalId) {
    return { failed: true, message: "Missing journal id." };
  }

  return runRefresh(journalId);
}

// Called from the institution dialog, which shows the returned error inline.
export async function saveInstitutionAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = institutionFormSchema.safeParse({
    choice: String(formData.get("choice") ?? ""),
    name: cleanOptional(formData.get("name")),
    resolverUrl: String(formData.get("resolverUrl") ?? ""),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Choose one of the options.",
    };
  }

  const form = parsed.data;
  let institution = null;

  if (form.choice === "preset") {
    institution = findInstitutionPreset(form.resolverUrl) ?? null;

    if (!institution) {
      return { ok: false, error: "Choose an institution from the list." };
    }
  } else if (form.choice === "custom") {
    institution = {
      name: form.name || "My institution",
      resolverUrl: form.resolverUrl,
    };
  }

  try {
    await saveInstitutionSetting(institution);
  } catch {
    return {
      ok: false,
      error:
        "The setting could not be saved. If you run Journal Stack from source, run \"npm run db:migrate\" and try again.",
    };
  }

  // Every page shows or hides "Open via Institution" based on this.
  revalidatePath("/", "layout");

  return { ok: true };
}
