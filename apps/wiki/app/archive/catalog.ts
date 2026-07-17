import type { PublicRecord } from "@relink-wiki/domain";
import publicSnapshotInput from "../../public/data/public-snapshot.v1.json";
import { loadPublicSnapshot } from "./public-snapshot";

export const publicSnapshot = loadPublicSnapshot(publicSnapshotInput);

export const categories = [
  { key: "characters", label: "캐릭터", symbol: "✦", description: "플레이어블 캐릭터와 전투 역할" },
  { key: "weapons", label: "무기", symbol: "◇", description: "무기 유형과 핵심 능력치" },
  { key: "sigils", label: "진", symbol: "✧", description: "진 효과와 장착 조건" },
  { key: "skills", label: "스킬·어빌리티", symbol: "✺", description: "전투 기술과 관련 캐릭터" },
] as const;

export type CategoryKey = (typeof categories)[number]["key"];

export type CatalogRecord = PublicRecord & {
  categoryKey: CategoryKey;
  categoryLabel: string;
};

// Preserve extracted rows in the public snapshot while withholding records that do not yet have a
// meaningful reader-facing presentation contract from archive navigation.
const hiddenCatalogRecordIds = new Set<string>(["character-pl000b"]);

export function getCategoryRecords(categoryKey: CategoryKey) {
  return publicSnapshot[categoryKey].filter((record) => !hiddenCatalogRecordIds.has(record.id));
}

export const catalogRecords: CatalogRecord[] = categories.flatMap((category) =>
  getCategoryRecords(category.key).map((record) => ({
    ...record,
    categoryKey: category.key,
    categoryLabel: category.label,
  })),
);

export function isCategoryKey(value: string): value is CategoryKey {
  return categories.some((category) => category.key === value);
}

export function getCategory(categoryKey: CategoryKey) {
  const category = categories.find((candidate) => candidate.key === categoryKey);
  if (!category) {
    throw new Error(`Unsupported public category: ${categoryKey}`);
  }
  return category;
}

export function getRecord(categoryKey: CategoryKey, slug: string) {
  return getCategoryRecords(categoryKey).find((record) => record.slug === slug);
}

export function getRecordHref(record: Pick<CatalogRecord, "categoryKey" | "slug">) {
  return `/archive/${record.categoryKey}/${record.slug}`;
}
