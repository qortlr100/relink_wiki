# Relink Wiki

Granblue Fantasy: Relink 데이터를 로컬에서 추출·검수하고, 승인된 정보만 공개하는 pnpm 모노레포입니다.

## 요구 사항

- Node.js 22 이상
- pnpm 10.15.1

## 시작

```bash
corepack enable
pnpm install
pnpm dev:wiki
pnpm dev:admin
```

관리 도구는 기본적으로 `127.0.0.1:3100`에만 바인딩됩니다. 추출기 설정은 `.env.example`을 참고하되 실제 경로와 데이터는 커밋하지 않습니다.

## 검증

```bash
pnpm check
```

이 명령은 포맷, 린트, 타입 검사, 테스트, 두 앱의 프로덕션 빌드를 순서대로 실행합니다.
