import { getCategory, getRecord, isCategoryKey } from "../../catalog";

interface RecordPageProps {
  params: Promise<{ category: string; slug: string }>;
}

export default async function RecordPage({ params }: RecordPageProps) {
  const { category, slug } = await params;
  if (!isCategoryKey(category)) {
    return <MissingRecord />;
  }
  const record = getRecord(category, slug);
  if (!record) {
    return <MissingRecord category={category} />;
  }
  const categoryInfo = getCategory(category);

  return (
    <main className="inner-page detail-page">
      <a className="back-link" href={`/archive/${category}`}>
        ← {categoryInfo.label} 목록
      </a>
      <article className="record-detail">
        <div>
          <p className="eyebrow">{categoryInfo.label} · PUBLIC RECORD</p>
          <h1>{record.nameKo}</h1>
          <p className="detail-lead">현재 공개 스냅샷에서 검수 완료된 기본 식별 정보입니다.</p>
        </div>
        <dl>
          <div>
            <dt>공개 ID</dt>
            <dd>{record.id}</dd>
          </div>
          <div>
            <dt>슬러그</dt>
            <dd>{record.slug}</dd>
          </div>
          <div>
            <dt>검수 상태</dt>
            <dd>공개 완료</dd>
          </div>
        </dl>
      </article>
      <aside className="detail-note">
        실제 추출 데이터 계약이 확정되면 핵심 수치와 관련 기록 연결이 이곳에 추가됩니다.
      </aside>
    </main>
  );
}

function MissingRecord({ category }: { category?: string }) {
  return (
    <main className="inner-page">
      <a className="back-link" href={category ? `/archive/${category}` : "/#archive"}>
        ← 아카이브로 돌아가기
      </a>
      <section className="empty-state prominent">
        <p className="eyebrow">RECORD NOT FOUND</p>
        <h1>공개 기록을 찾을 수 없습니다.</h1>
        <p>주소가 잘못되었거나 현재 스냅샷에 포함되지 않은 기록입니다.</p>
      </section>
    </main>
  );
}
