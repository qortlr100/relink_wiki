import { RecordList } from "./record-list";
import { getCategory, isCategoryKey, publicSnapshot } from "../catalog";

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  if (!isCategoryKey(category)) {
    return (
      <main className="inner-page">
        <a className="back-link" href="/#archive">
          ← 아카이브 홈
        </a>
        <section className="empty-state prominent">
          <p className="eyebrow">UNKNOWN CATEGORY</p>
          <h1>존재하지 않는 분류입니다.</h1>
          <p>캐릭터, 무기, 진, 스킬 분류에서 다시 탐색해 주세요.</p>
        </section>
      </main>
    );
  }

  const categoryInfo = getCategory(category);
  return (
    <main className="inner-page">
      <a className="back-link" href="/#archive">
        ← 아카이브 홈
      </a>
      <header className="page-heading">
        <span className="category-symbol" aria-hidden="true">
          {categoryInfo.symbol}
        </span>
        <div>
          <p className="eyebrow">ARCHIVE CATEGORY</p>
          <h1>{categoryInfo.label}</h1>
          <p>{categoryInfo.description}</p>
        </div>
      </header>
      <RecordList categoryKey={category} records={publicSnapshot[category]} />
    </main>
  );
}
