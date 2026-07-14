"use client";

import { useMemo, useState } from "react";
import type { PublicRecord } from "@relink-wiki/domain";

interface RecordListProps {
  categoryKey: string;
  records: PublicRecord[];
}

export function RecordList({ categoryKey, records }: RecordListProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "slug">("name");
  const visibleRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    return [...records]
      .filter((record) =>
        `${record.nameKo} ${record.slug}`.toLocaleLowerCase("ko").includes(normalizedQuery),
      )
      .sort((left, right) =>
        sort === "name"
          ? left.nameKo.localeCompare(right.nameKo, "ko")
          : left.slug.localeCompare(right.slug, "en"),
      );
  }, [query, records, sort]);

  return (
    <>
      <div className="list-controls">
        <label>
          <span>목록 검색</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="이 분류에서 검색"
          />
        </label>
        <label>
          <span>정렬</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as "name" | "slug");
            }}
          >
            <option value="name">이름순</option>
            <option value="slug">식별자순</option>
          </select>
        </label>
      </div>
      <p className="result-count" aria-live="polite">
        공개 기록 {visibleRecords.length}개
      </p>
      {visibleRecords.length > 0 ? (
        <div className="record-grid">
          {visibleRecords.map((record) => (
            <a
              className="record-card"
              href={`/archive/${categoryKey}/${record.slug}`}
              key={record.id}
            >
              <span>PUBLIC RECORD</span>
              <h2>{record.nameKo}</h2>
              <code>{record.slug}</code>
              <strong>상세 보기 →</strong>
            </a>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>일치하는 기록이 없습니다.</h2>
          <p>검색어를 줄이거나 다른 이름으로 다시 찾아보세요.</p>
        </div>
      )}
    </>
  );
}
