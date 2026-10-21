import { prisma } from "./prisma.js";
import { COA_CATALOG } from "./coa-catalog.js";

export async function syncCoaCatalog() {
  for (const row of COA_CATALOG) {
    await prisma.account.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        type: row.type,
        parentCode: row.parentCode ?? null,
        detailType: row.detailType ?? null,
        normalBalance: row.normalBalance ?? (["LIABILITY", "EQUITY", "INCOME"].includes(row.type) ? "CR" : "DR"),
        isControl: row.isControl ?? false,
        allowManualPosting: row.allowManualPosting ?? !row.isControl,
        isActive: true,
        reportingGroup: row.reportingGroup ?? null,
      },
      update: {
        name: row.name,
        type: row.type,
        parentCode: row.parentCode ?? null,
        detailType: row.detailType ?? null,
        normalBalance: row.normalBalance ?? undefined,
        isControl: row.isControl ?? false,
        allowManualPosting: row.allowManualPosting ?? undefined,
        reportingGroup: row.reportingGroup ?? null,
      },
    });
  }
}
