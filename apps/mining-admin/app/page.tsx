import { loadDashboard, type DashboardPreview } from "./dashboard-data";

const categoryLabels = {
  character: "캐릭터",
  weapon: "무기",
  sigil: "진",
  skill: "어빌리티",
} as const;
const reviewStateLabels = { staged: "검수 전", reviewed: "승인됨", published: "발행됨" } as const;

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

export default function Home() {
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

  const { dashboard, preview } = state;
  const baseline = dashboard.currentBaseline;
  const publication = dashboard.currentPublication;
  return (
    <main>
      <header className="masthead">
        <div>
          <p className="eyebrow">LOCAL REVIEW CONSOLE</p>
          <h1>검수 현황</h1>
          <p className="lede">정규화부터 공개 후보까지, 로컬 데이터의 현재 경계를 확인합니다.</p>
        </div>
        <div className="local-mark">
          <span />
          127.0.0.1 전용
        </div>
      </header>

      <section className="summary-grid" aria-label="검수 요약">
        <article className="metric-card accent">
          <p>데이터베이스</p>
          <strong>읽기 전용</strong>
          <span>연결 정상</span>
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

      <section className="panel" aria-labelledby="preview-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">PUBLIC ALLOWLIST</p>
            <h2 id="preview-title">스냅샷 미리보기</h2>
          </div>
        </div>
        <PreviewPanel preview={preview} />
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
        <span>READ ONLY</span> 승인 및 발행 작업은 이 화면에서 수행할 수 없습니다.
      </footer>
    </main>
  );
}
