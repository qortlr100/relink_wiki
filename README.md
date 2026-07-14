# Relink Wiki

Granblue Fantasy: Relink 데이터를 로컬에서 추출·검수하고, 승인된 정보만 공개하는 pnpm 모노레포입니다.

## 요구 사항

- Node.js 22 이상 (권장: Node.js 24 LTS)
- pnpm 10.15.1

## 시작

```bash
corepack enable
corepack install --global pnpm@10.15.1
pnpm install --frozen-lockfile
```

Windows에서 Node.js 버전을 관리한다면 NVM for Windows로 Node.js 24 LTS를 사용하는 것을 권장합니다. Node.js 25처럼 Corepack이 기본 제공되지 않는 버전에서는 Corepack을 별도로 설치해야 할 수 있습니다.

두 애플리케이션은 별도 터미널에서 실행합니다.

```bash
pnpm dev:wiki
pnpm dev:admin
```

- 공개 위키: `http://localhost:3000`
- 로컬 관리 도구: `http://127.0.0.1:3100`

관리 도구는 기본적으로 `127.0.0.1:3100`에만 바인딩됩니다. 추출기 설정은 `.env.example`을 참고하되 실제 경로와 데이터는 커밋하지 않습니다.

## 검증

```bash
pnpm check
```

이 명령은 포맷, 린트, 타입 검사, 테스트, 두 앱의 프로덕션 빌드를 순서대로 실행합니다. 초기 기반은 Windows의 Node.js 24.15.0과 pnpm 10.15.1에서 `better-sqlite3` 네이티브 설치, 전체 검사 및 두 애플리케이션 실행까지 확인했습니다.
