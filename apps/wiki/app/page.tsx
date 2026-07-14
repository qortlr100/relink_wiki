import { publicSnapshotSchema } from "@relink-wiki/domain";
const emptySnapshot = publicSnapshotSchema.parse({
  schemaVersion: 1,
  contentRevision: "bootstrap",
  generatedAt: "2026-07-14T00:00:00.000Z",
  sourceRevision: "unpublished",
  characters: [],
});
export default function Home() {
  return (
    <main>
      <p className="eyebrow">SKY-ISLAND ARCHIVE</p>
      <h1>Relink Wiki</h1>
      <p>검수된 Granblue Fantasy: Relink 데이터를 탐색하는 공개 위키입니다.</p>
      <section>
        <h2>아카이브 준비 중</h2>
        <p>
          현재 공개된 캐릭터 {emptySnapshot.characters.length}명 · 내부 추출 데이터는 이 사이트에
          포함되지 않습니다.
        </p>
      </section>
    </main>
  );
}
