import type { NormalizationReviewWorkspace } from "@relink-wiki/database";
import { acceptCandidateAction, publishSnapshotAction, saveRecordDecisionAction } from "./actions";
import { loadDashboard, type DashboardPreview, type DashboardReview } from "./dashboard-data";
import { hasOwnKey } from "./review-input";
import { resolveReviewNotice } from "./review-notices";

const categoryLabels = {
  character: "캐릭터",
  weapon: "무기",
  sigil: "진",
  skill: "어빌리티",
} as const;
const reviewStateLabels = { staged: "검수 전", reviewed: "승인됨", published: "발행됨" } as const;
const diffStatusLabels = { added: "추가", changed: "변경", removed: "삭제" } as const;
const decisionLabels = { approved: "승인", rejected: "거절" } as const;
const changedFieldLabels = { id: "ID", slug: "슬러그", nameKo: "한국어 이름" } as const;
type ReadyReview = Extract<NormalizationReviewWorkspace, { status: "ready" }>;
type ReviewRecord = ReadyReview["records"][number];
type SearchParams = Record<string, string | string[] | undefined>;
interface ReviewFilters {
  category: "all" | keyof typeof categoryLabels;
  diff: "all" | keyof typeof diffStatusLabels;
  decision: "all" | "pending" | keyof typeof decisionLabels;
  page: number;
}

function ReviewNavigationFields({ filters }: Readonly<{ filters: ReviewFilters }>) {
  return (
    <>
      <input type="hidden" name="returnCategory" value={filters.category} />
      <input type="hidden" name="returnDiff" value={filters.diff} />
      <input type="hidden" name="returnDecision" value={filters.decision} />
      <input type="hidden" name="returnPage" value={filters.page} />
    </>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function total(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(searchParams: SearchParams): ReviewFilters {
  const category = singleParam(searchParams.category);
  const diff = singleParam(searchParams.diff);
  const decision = singleParam(searchParams.decision);
  const page = Number(singleParam(searchParams.page));
  return {
    category: hasOwnKey(categoryLabels, category) ? category : "all",
    diff: hasOwnKey(diffStatusLabels, diff) ? diff : "all",
    decision: decision === "pending" || hasOwnKey(decisionLabels, decision) ? decision : "all",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function HashValue({ children }: Readonly<{ children: string }>) {
  return <code className="hash-value">{children}</code>;
}

function PreviewPanel({ preview }: Readonly<{ preview: DashboardPreview }>) {
  if (preview.status === "unavailable") {
    return <p className="empty-state">{preview.message}</p>;
  }
  return (
    <div className="preview-layout">
      <div>
        <span className={`status-badge ${preview.status}`}>
          {preview.status === "ready" ? "미리보기 준비됨" : "현재 발행본"}
        </span>
        <p className="field-label">콘텐츠 리비전</p>
        <HashValue>{preview.contentRevision}</HashValue>
      </div>
      <dl className="compact-counts">
        {Object.entries(preview.recordCounts).map(([category, count]) => (
          <div key={category}>
            <dt>{categoryLabels[category.slice(0, -1) as keyof typeof categoryLabels]}</dt>
            <dd>{count.toLocaleString("ko-KR")}건</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RecordValue({
  label,
  value,
}: Readonly<{ label: string; value: ReviewRecord["baseline"] }>) {
  return (
    <div className="record-value">
      <p>{label}</p>
      {!value ? (
        <span className="value-empty">해당 없음</span>
      ) : (
        <dl>
          <div>
            <dt>ID</dt>
            <dd>{value.id}</dd>
          </div>
          <div>
            <dt>슬러그</dt>
            <dd>{value.slug}</dd>
          </div>
          <div>
            <dt>한국어 이름</dt>
            <dd>{value.nameKo}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function pageHref(filters: ReviewFilters, page: number): string {
  const query = new URLSearchParams();
  if (filters.category !== "all") query.set("category", filters.category);
  if (filters.diff !== "all") query.set("diff", filters.diff);
  if (filters.decision !== "all") query.set("decision", filters.decision);
  if (page > 1) query.set("page", String(page));
  const serialized = query.toString();
  return `${serialized ? `/?${serialized}` : "/"}#review`;
}

function ReviewPanel({
  review,
  filters,
}: Readonly<{ review: DashboardReview; filters: ReviewFilters }>) {
  if (review.status === "empty" || review.status === "unavailable") {
    return <p className="empty-state">{review.message}</p>;
  }
  const filteredRecords = review.records.filter((record) => {
    const decision = record.decision ?? "pending";
    return (
      (filters.category === "all" || record.category === filters.category) &&
      (filters.diff === "all" || record.status === filters.diff) &&
      (filters.decision === "all" || decision === filters.decision)
    );
  });
  const pageSize = 30;
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const currentPage = Math.min(filters.page, pageCount);
  const pageRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="review-workspace">
      <div className="review-summary-grid" aria-label="변경 비교 요약">
        {Object.entries(review.summary).map(([status, count]) => (
          <div key={status}>
            <span>
              {status === "unchanged"
                ? "동일"
                : diffStatusLabels[status as keyof typeof diffStatusLabels]}
            </span>
            <strong>{count.toLocaleString("ko-KR")}</strong>
          </div>
        ))}
      </div>
      <div className="decision-strip">
        <span>
          대기 <b>{review.decisionSummary.pending.toLocaleString("ko-KR")}</b>
        </span>
        <span className="approved">
          승인 <b>{review.decisionSummary.approved.toLocaleString("ko-KR")}</b>
        </span>
        <span className="rejected">
          거절 <b>{review.decisionSummary.rejected.toLocaleString("ko-KR")}</b>
        </span>
      </div>
      <form className="review-filters" method="get">
        <label>
          카테고리
          <select name="category" defaultValue={filters.category}>
            <option value="all">전체</option>
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          변경 유형
          <select name="diff" defaultValue={filters.diff}>
            <option value="all">전체</option>
            {Object.entries(diffStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          검수 상태
          <select name="decision" defaultValue={filters.decision}>
            <option value="all">전체</option>
            <option value="pending">대기</option>
            <option value="approved">승인</option>
            <option value="rejected">거절</option>
          </select>
        </label>
        <button className="secondary-button" type="submit">
          필터 적용
        </button>
      </form>
      <p className="candidate-meta">
        최신 후보 · 스키마 v{review.schemaVersion} · {formatDate(review.candidateNormalizedAt)} ·
        변경 검수 {review.records.length.toLocaleString("ko-KR")}건
      </p>
      {pageRecords.length === 0 ? (
        <p className="empty-state">선택한 필터에 해당하는 변경 레코드가 없습니다.</p>
      ) : (
        <div className="record-review-list">
          {pageRecords.map((record) => (
            <article
              className={`record-review-card ${record.decision ?? "pending"}`}
              key={record.recordIndex}
            >
              <div className="record-review-heading">
                <div>
                  <span className={`diff-badge ${record.status}`}>
                    {diffStatusLabels[record.status]}
                  </span>
                  <strong>{categoryLabels[record.category]}</strong>
                </div>
                <span className={`decision-badge ${record.decision ?? "pending"}`}>
                  {record.decision ? decisionLabels[record.decision] : "검수 대기"}
                </span>
              </div>
              {record.changedFields.length > 0 && (
                <p className="changed-fields">
                  변경 필드:{" "}
                  {record.changedFields.map((field) => changedFieldLabels[field]).join(", ")}
                </p>
              )}
              <div className="record-diff-grid">
                <RecordValue label="이전 baseline" value={record.baseline} />
                <RecordValue label="최신 후보" value={record.candidate} />
              </div>
              <form action={saveRecordDecisionAction} className="decision-form">
                <ReviewNavigationFields filters={{ ...filters, page: currentPage }} />
                <input
                  type="hidden"
                  name="comparisonFingerprint"
                  value={review.comparisonFingerprint}
                />
                <input type="hidden" name="recordIndex" value={record.recordIndex} />
                <label>
                  검수 메모 <span>선택 · 500자 이내</span>
                  <textarea name="note" defaultValue={record.note ?? ""} maxLength={500} rows={2} />
                </label>
                <div className="decision-actions">
                  <button className="reject-button" type="submit" name="decision" value="rejected">
                    거절 저장
                  </button>
                  <button className="approve-button" type="submit" name="decision" value="approved">
                    승인 저장
                  </button>
                </div>
              </form>
            </article>
          ))}
        </div>
      )}
      {pageCount > 1 && (
        <nav className="pagination" aria-label="레코드 검수 페이지">
          <a
            aria-disabled={currentPage === 1}
            href={pageHref(filters, Math.max(1, currentPage - 1))}
          >
            이전
          </a>
          <span>
            {currentPage} / {pageCount}
          </span>
          <a
            aria-disabled={currentPage === pageCount}
            href={pageHref(filters, Math.min(pageCount, currentPage + 1))}
          >
            다음
          </a>
        </nav>
      )}
    </div>
  );
}

function OperationPanel({
  review,
  preview,
  filters,
}: Readonly<{
  review: DashboardReview;
  preview: DashboardPreview;
  filters: ReviewFilters;
}>) {
  const readyReview = review.status === "ready" ? review : null;
  return (
    <div className="operation-grid">
      <article className="operation-card">
        <p className="section-kicker">ACCEPT BASELINE</p>
        <h3>검수 완료 후보 승인</h3>
        <p>
          모든 변경 레코드가 승인되고 거절이 없어야 합니다. 승인 직전 검증한 NAS 백업 증빙을
          입력하세요.
        </p>
        {!readyReview ? (
          <p className="operation-gate">승인할 staged 후보가 없습니다.</p>
        ) : !readyReview.canAccept ? (
          <p className="operation-gate danger">
            대기 {readyReview.decisionSummary.pending}건 · 거절{" "}
            {readyReview.decisionSummary.rejected}건을 먼저 해소하세요.
          </p>
        ) : (
          <form action={acceptCandidateAction} className="operation-form">
            <ReviewNavigationFields filters={filters} />
            <input
              type="hidden"
              name="comparisonFingerprint"
              value={readyReview.comparisonFingerprint}
            />
            <label>
              백업 참조
              <input name="backupReference" placeholder="NAS-YYYYMMDDTHHMMSSZ" required />
            </label>
            <label>
              백업 완료 시각
              <input name="backupCreatedAt" placeholder="2026-07-17T10:00:00.000Z" required />
            </label>
            <label>
              백업 SHA-256
              <input name="backupSha256" pattern="[0-9a-f]{64}" required />
            </label>
            <label>
              확인 문구
              <input
                name="confirmation"
                placeholder="ACCEPT_FULLY_REVIEWED_NORMALIZATION_V1"
                required
              />
            </label>
            <button className="approve-button wide" type="submit">
              백업 확인 후 후보 승인
            </button>
          </form>
        )}
      </article>
      <article className="operation-card publication-card">
        <p className="section-kicker">EXPLICIT PUBLICATION</p>
        <h3>검토된 snapshot 발행</h3>
        <p>
          비공개 발행 요청 파일에 고정된 snapshot SHA-256, content revision, 새 NAS 백업과 출력
          위치를 다시 검증합니다.
        </p>
        {preview.status === "unavailable" ? (
          <p className="operation-gate">{preview.message}</p>
        ) : (
          <form action={publishSnapshotAction} className="operation-form">
            <ReviewNavigationFields filters={filters} />
            <p className="revision-preview">
              대상 리비전 <HashValue>{preview.contentRevision}</HashValue>
            </p>
            <label>
              확인 문구
              <input
                name="confirmation"
                placeholder="PUBLISH_REVIEWED_PUBLIC_SNAPSHOT_V1"
                required
              />
            </label>
            <button className="publication-button wide" type="submit">
              후보 파일 및 publication 이력 발행
            </button>
          </form>
        )}
        <p className="boundary-note">
          체크인 snapshot 교체, Git 작업, Sites 배포와 공개 전환은 실행하지 않습니다.
        </p>
      </article>
    </div>
  );
}

export default async function Home({
  searchParams,
}: Readonly<{ searchParams?: Promise<SearchParams> }>) {
  const params = (await searchParams) ?? {};
  const filters = parseFilters(params);
  const notice = resolveReviewNotice(params.notice);
  const state = loadDashboard();

  if (state.kind === "error") {
    return (
      <main className="error-page">
        <header className="masthead">
          <p className="eyebrow">LOCAL REVIEW CONSOLE</p>
          <div className="local-mark">
            <span />
            127.0.0.1 전용
          </div>
        </header>
        <section className="error-panel" aria-labelledby="error-title">
          <p className="error-code">{state.code}</p>
          <h1 id="error-title">{state.title}</h1>
          <p>{state.message}</p>
          <div className="safety-note">
            경로와 데이터베이스 내부 값은 이 화면에 표시되지 않습니다.
          </div>
        </section>
      </main>
    );
  }

  const { dashboard, preview, review } = state;
  const baseline = dashboard.currentBaseline;
  const publication = dashboard.currentPublication;
  return (
    <main>
      <header className="masthead">
        <div>
          <p className="eyebrow">LOCAL REVIEW CONSOLE</p>
          <h1>검수 및 발행</h1>
          <p className="lede">
            정규화 변경을 레코드별로 확인하고, 백업 gate를 거쳐 승인과 발행을 명시적으로 실행합니다.
          </p>
        </div>
        <div className="local-mark">
          <span />
          127.0.0.1 전용
        </div>
      </header>

      {notice && (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.message}
        </div>
      )}

      <section className="summary-grid" aria-label="검수 요약">
        <article className="metric-card accent">
          <p>데이터베이스</p>
          <strong>로컬 SQLite</strong>
          <span>쓰기 gate 활성</span>
        </article>
        <article className="metric-card">
          <p>정규화 실행</p>
          <strong>{dashboard.normalizationRuns.length.toLocaleString("ko-KR")}</strong>
          <span>전체 실행</span>
        </article>
        <article className="metric-card">
          <p>현재 baseline</p>
          <strong>{baseline ? `v${String(baseline.schemaVersion)}` : "없음"}</strong>
          <span>{baseline ? formatDate(baseline.acceptedAt) : "승인 대기"}</span>
        </article>
        <article className="metric-card">
          <p>Publication</p>
          <strong>{publication ? "발행됨" : "미발행"}</strong>
          <span>{publication ? formatDate(publication.publishedAt) : "명시적 발행 대기"}</span>
        </article>
      </section>

      <section className="panel" aria-labelledby="baseline-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">ACCEPTED BASELINE</p>
            <h2 id="baseline-title">승인 경계</h2>
          </div>
          {baseline && <span className="status-badge ready">검수 승인됨</span>}
        </div>
        {!baseline ? (
          <p className="empty-state">승인된 normalization baseline이 없습니다.</p>
        ) : (
          <div className="baseline-layout">
            <dl className="detail-list">
              <div>
                <dt>승인 시각</dt>
                <dd>{formatDate(baseline.acceptedAt)}</dd>
              </div>
              <div>
                <dt>백업 참조</dt>
                <dd>{baseline.backup.reference}</dd>
              </div>
              <div>
                <dt>백업 생성</dt>
                <dd>{formatDate(baseline.backup.createdAt)}</dd>
              </div>
              <div className="stacked">
                <dt>백업 SHA-256</dt>
                <dd>
                  <HashValue>{baseline.backup.sha256}</HashValue>
                </dd>
              </div>
            </dl>
            <div>
              <p className="field-label">카테고리 수량</p>
              <dl className="category-counts">
                {Object.entries(baseline.categoryCounts).map(([category, count]) => (
                  <div key={category}>
                    <dt>{categoryLabels[category as keyof typeof categoryLabels]}</dt>
                    <dd>{count.toLocaleString("ko-KR")}</dd>
                  </div>
                ))}
              </dl>
              <p className="field-label state-label">Review state</p>
              <div className="state-pills">
                {Object.entries(baseline.reviewStateCounts).map(([reviewState, count]) => (
                  <span key={reviewState}>
                    {reviewStateLabels[reviewState as keyof typeof reviewStateLabels]}{" "}
                    <b>{count.toLocaleString("ko-KR")}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="panel" id="review" aria-labelledby="review-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">RECORD REVIEW</p>
            <h2 id="review-title">변경 비교 및 레코드 검수</h2>
          </div>
          <div className="section-actions">
            <span className="muted">공개 allowlist 필드만 표시</span>
            {review.status === "ready" && (
              <a className="report-download" href="/change-report" download>
                Markdown 보고서
              </a>
            )}
          </div>
        </div>
        <ReviewPanel review={review} filters={filters} />
      </section>

      <section className="panel" aria-labelledby="preview-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">PUBLIC ALLOWLIST</p>
            <h2 id="preview-title">스냅샷 미리보기</h2>
          </div>
        </div>
        <PreviewPanel preview={preview} />
      </section>

      <section className="panel operations-panel" aria-labelledby="operations-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">GATED OPERATIONS</p>
            <h2 id="operations-title">승인 및 발행</h2>
          </div>
          <span className="status-badge warning">명시적 확인 필요</span>
        </div>
        <OperationPanel review={review} preview={preview} filters={filters} />
      </section>

      <section className="panel" aria-labelledby="runs-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">NORMALIZATION RUNS</p>
            <h2 id="runs-title">최근 실행</h2>
          </div>
          <span className="muted">최신순</span>
        </div>
        {dashboard.normalizationRuns.length === 0 ? (
          <p className="empty-state">정규화 실행이 아직 없습니다.</p>
        ) : (
          <div className="run-list">
            {dashboard.normalizationRuns.map((run, index) => (
              <article className="run-row" key={`${run.normalizedAt}-${String(index)}`}>
                <div>
                  <p>{formatDate(run.normalizedAt)}</p>
                  <span>
                    스키마 v{run.schemaVersion}
                    {run.isCurrentBaseline ? " · 현재 baseline" : ""}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>전체</dt>
                    <dd>{total(run.categoryCounts).toLocaleString("ko-KR")}</dd>
                  </div>
                  {Object.entries(run.reviewStateCounts).map(([reviewState, count]) => (
                    <div key={reviewState}>
                      <dt>{reviewStateLabels[reviewState as keyof typeof reviewStateLabels]}</dt>
                      <dd>{count.toLocaleString("ko-KR")}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <span>LOCAL WRITE GATED</span> 승인과 발행은 검수·백업·동시성 검증을 모두 통과한 경우에만
        실행됩니다.
      </footer>
    </main>
  );
}
