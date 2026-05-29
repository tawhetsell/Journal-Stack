"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { refreshFollowedJournals } from "@/lib/refresh";
import { journalFormSchema } from "@/lib/validation";

function cleanOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function createJournalAction(formData: FormData) {
  const parsed = journalFormSchema.safeParse({
    title: formData.get("title"),
    publisher: cleanOptional(formData.get("publisher")),
    homepageUrl: cleanOptional(formData.get("homepageUrl")),
    issnPrint: cleanOptional(formData.get("issnPrint")),
    issnElectronic: cleanOptional(formData.get("issnElectronic")),
    sourceType: formData.get("sourceType"),
    sourceUrl: cleanOptional(formData.get("sourceUrl")),
    followNow: formData.get("followNow") === "on",
  });

  if (!parsed.success) {
    throw new Error("Journal form data is invalid.");
  }

  const { followNow, ...journalData } = parsed.data;

  const journal = await db.journal.upsert({
    where: { title: journalData.title },
    update: {
      ...journalData,
      publisher: journalData.publisher ?? null,
      homepageUrl: journalData.homepageUrl ?? null,
      sourceUrl: journalData.sourceUrl ?? null,
      issnPrint: journalData.issnPrint ?? null,
      issnElectronic: journalData.issnElectronic ?? null,
      active: true,
    },
    create: {
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
}

export async function updateJournalAction(formData: FormData) {
  const journalId = String(formData.get("journalId") ?? "");

  if (!journalId) {
    throw new Error("Missing journal id.");
  }

  const parsed = journalFormSchema.safeParse({
    title: formData.get("title"),
    publisher: cleanOptional(formData.get("publisher")),
    homepageUrl: cleanOptional(formData.get("homepageUrl")),
    issnPrint: cleanOptional(formData.get("issnPrint")),
    issnElectronic: cleanOptional(formData.get("issnElectronic")),
    sourceType: formData.get("sourceType"),
    sourceUrl: cleanOptional(formData.get("sourceUrl")),
    followNow: formData.get("followNow") === "on",
  });

  if (!parsed.success) {
    throw new Error("Journal form data is invalid.");
  }

  const { followNow, ...journalData } = parsed.data;

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

  const existing = await db.savedArticle.findUnique({
    where: { articleId },
  });

  if (existing) {
    await db.savedArticle.delete({ where: { articleId } });
  } else {
    await db.savedArticle.create({ data: { articleId } });
  }

  revalidatePath("/feed");
  revalidatePath("/saved");
  revalidatePath(`/articles/${articleId}`);
}

export async function refreshAllAction() {
  await refreshFollowedJournals();
  revalidatePath("/feed");
  revalidatePath("/journals");
}

export async function refreshJournalAction(formData: FormData) {
  const journalId = String(formData.get("journalId") ?? "");

  if (!journalId) {
    return;
  }

  await refreshFollowedJournals(journalId);
  revalidatePath("/feed");
  revalidatePath("/journals");
}
