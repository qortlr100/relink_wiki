"use client";

import { useMemo, useState } from "react";
import {
  catalogRecords,
  categories,
  getRecordHref,
  publicSnapshot as snapshot,
} from "./archive/catalog";

export default function Home() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("ko");
  const results = useMemo(
    () =>
      normalizedQuery.length === 0
        ? []
        : catalogRecords.filter((record) =>
            `${record.nameKo} ${record.slug} ${record.categoryLabel}`
              .toLocaleLowerCase("ko")
              .includes(normalizedQuery),
          ),
    [normalizedQuery],
  );

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Relink Wiki 홈">
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          <span>RELINK ARCHIVE</span>
        </a>
        <nav aria-label="주요 메뉴">
          <a href="#archive">아카이브</a>
          <a href="#snapshot">데이터 정보</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow">SKY-ISLAND ARCHIVE</p>
        <h1>
          하늘의 기록을
          <br />
          한곳에서 탐색하세요.
        </h1>
        <p className="hero-copy">
          검수와 공개 승인을 마친 Granblue Fantasy: Relink 데이터만 제공하는 읽기 전용 위키입니다.
        </p>
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">전체 검색</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="캐릭터, 무기, 진, 스킬 검색"
          />
          <kbd>/</kbd>
        </label>
        {normalizedQuery.length > 0 && (
          <div className="search-results" aria-live="polite">
            <p>
              {results.length > 0
                ? `${String(results.length)}개의 기록을 찾았습니다.`
                : "일치하는 공개 기록이 없습니다."}
            </p>
            {results.map((record) => (
              <a href={getRecordHref(record)} key={record.id}>
                <span>{record.categoryLabel}</span>
                <strong>{record.nameKo}</strong>
                <small>{record.slug}</small>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="archive" id="archive">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BROWSE THE ARCHIVE</p>
            <h2>분류별 탐색</h2>
          </div>
          <p>현재 공개된 샘플 기록 {catalogRecords.length}개</p>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <a className="category-card" href={`/archive/${category.key}`} key={category.key}>
              <span className="category-symbol" aria-hidden="true">
                {category.symbol}
              </span>
              <div>
                <h3>{category.label}</h3>
                <p>{category.description}</p>
              </div>
              <strong>
                {snapshot[category.key].length}
                <small> records</small>
              </strong>
            </a>
          ))}
        </div>
      </section>

      <section className="snapshot" id="snapshot">
        <div>
          <p className="eyebrow">PUBLIC SNAPSHOT</p>
          <h2>검수된 정보만 공개합니다.</h2>
        </div>
        <dl>
          <div>
            <dt>콘텐츠 리비전</dt>
            <dd>{snapshot.contentRevision}</dd>
          </div>
          <div>
            <dt>생성 시각</dt>
            <dd>
              <time dateTime={snapshot.generatedAt}>2026. 7. 14.</time>
            </dd>
          </div>
          <div>
            <dt>스키마 버전</dt>
            <dd>v{snapshot.schemaVersion}</dd>
          </div>
        </dl>
      </section>

      <footer>
        <span>RELINK ARCHIVE</span>
        <p>비공개 추출 데이터와 로컬 경로는 이 사이트에 포함되지 않습니다.</p>
      </footer>
    </main>
  );
}
