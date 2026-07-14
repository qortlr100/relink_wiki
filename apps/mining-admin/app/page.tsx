export default function Home() {
  return (
    <main>
      <header>
        <p>LOCAL ONLY · 127.0.0.1</p>
        <h1>마이닝 관리</h1>
      </header>
      <section>
        <h2>구축 상태</h2>
        <dl>
          <div>
            <dt>추출기</dt>
            <dd>구성 대기</dd>
          </div>
          <div>
            <dt>검수 대기</dt>
            <dd>0건</dd>
          </div>
          <div>
            <dt>발행</dt>
            <dd>명시적 검수 후에만 가능</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
