import { cache } from "react";

import { db } from "@/lib/db";
import type { Institution, InstitutionSetting } from "@/lib/institutions";
import { safeHttpUrl } from "@/lib/utils";

const INSTITUTION_KEY = "institution";

// Read once per request; every page asks for it through AppShell.
export const getInstitutionSetting = cache(
  async (): Promise<InstitutionSetting> => {
    try {
      const row = await db.appSetting.findUnique({
        where: { key: INSTITUTION_KEY },
      });

      if (!row) {
        return { status: "unset" };
      }

      const saved = JSON.parse(row.value) as Partial<Institution> & {
        none?: boolean;
      };

      if (saved.none) {
        return { status: "none" };
      }

      const resolverUrl = safeHttpUrl(saved.resolverUrl);

      if (resolverUrl && typeof saved.name === "string" && saved.name.trim()) {
        return {
          status: "set",
          institution: { name: saved.name.trim(), resolverUrl },
        };
      }
    } catch {
      // A database that has not been migrated yet has no settings table, and a
      // hand-edited value may not parse. Either way, act as if nothing is set
      // so the app keeps working and simply asks again.
    }

    return { status: "unset" };
  },
);

// `null` records that the user has no institution to route through.
export async function saveInstitutionSetting(institution: Institution | null) {
  const value = JSON.stringify(institution ?? { none: true });

  await db.appSetting.upsert({
    where: { key: INSTITUTION_KEY },
    update: { value },
    create: { key: INSTITUTION_KEY, value },
  });
}
