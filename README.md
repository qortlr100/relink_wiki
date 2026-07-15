# Relink Wiki

Granblue Fantasy: Relink 데이터를 로컬에서 추출·검수하고, 승인된 정보만 공개하는 pnpm 모노레포입니다.

## 현재 구현 범위

- 공개 위키는 검증된 버전 1 정적 JSON 스냅샷에서 캐릭터, 무기, 진, 스킬의 검색·목록·상세 화면을 제공합니다. 저장소에 포함된 스냅샷은 UI 검증용 샘플이며 실제 게임 데이터 발행본이 아닙니다.
- 로컬 마이닝 관리 도구는 `127.0.0.1:3100`에만 바인딩되는 최소 화면만 구현되어 있습니다. 추출 실행, 변경점 검수, 리뷰와 발행 UI는 아직 연결되지 않았습니다.
- 추출기 패키지는 GBFRDataTools `2.0.0` 실행 전 점검, 후보 SQLite의 private staging import, 명시적 매핑 기반 normalization, 한국어 메시지 조인 범위 검증을 지원합니다.
- 데이터베이스 패키지는 두 private normalization 실행의 공개 후보 필드를 읽기 전용으로 비교하고, NAS 백업 증빙과 baseline 동시성 확인을 거친 명시적 승인을 영속화합니다. 새 정규화 레코드는 `staged`, 승인된 baseline 레코드는 `reviewed` 상태이며, 관리 UI, 거절 검수, publisher와 실제 공개 스냅샷 생성은 다음 구현 범위입니다.

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

GBFRDataTools를 사용하기 전에는 비공개 `.env`를 로드한 셸에서 실행 전 점검을 통과해야 합니다.

```bash
pnpm --filter @relink-wiki/extractor preflight
```

고정 버전, 런타임 요구 사항, 읽기 전용 샘플 명령과 현재 호환성 제한은 [`docs/extractor-validation.md`](docs/extractor-validation.md)를 참고하세요.

변환된 후보 SQLite를 비공개 staging 데이터베이스로 가져오려면 `.env`에 후보 및 대상 데이터베이스 경로를 설정한 뒤 실행합니다.

```bash
pnpm --filter @relink-wiki/extractor import:candidate
```

임포트 계약, 재실행 동작과 현재 범위는 [`docs/staging-import.md`](docs/staging-import.md)를 참고하세요. 이 명령은 공개 스냅샷을 만들거나 발행하지 않습니다.

비공개 staging 레코드 중 확인된 항목을 정규화하려면 로컬 전용 매핑 JSON을 준비하고 실행합니다.

```bash
pnpm --filter @relink-wiki/extractor normalize:mapped
```

정규화 입력 계약, 출처 보존, 재실행 동작과 자동 한국어 조인의 현재 제한은 [`docs/normalization.md`](docs/normalization.md)를 참고하세요. 정규화된 레코드는 항상 `staged` 상태로 시작하며 자동 발행되지 않습니다.

추출한 한국어 메시지와 네 후보 테이블의 표시명 조인 범위를 원문 노출 없이 검증하려면 다음 명령을 실행합니다.

```bash
pnpm --filter @relink-wiki/extractor localization:validate
```

필요한 비공개 메시지 경로, 확인된 조인 열, 현재 미해결 범위는 [`docs/localization-validation.md`](docs/localization-validation.md)를 참고하세요. 이 명령은 정규화 레코드를 쓰거나 발행하지 않습니다.

두 private normalization 실행 간 `added`, `changed`, `removed`, `unchanged` 비교 계약은 [`docs/normalization-diff.md`](docs/normalization-diff.md)를 참고하세요. 현재 비교 엔진은 데이터베이스 패키지의 읽기 전용 API이며 관리 화면에는 아직 연결되지 않았습니다.

정규화 실행 승인, NAS 백업 증빙과 스키마 버전별 baseline 계약은 [`docs/normalization-review.md`](docs/normalization-review.md)를 참고하세요. 승인은 레코드를 `reviewed`로 전환하지만 공개 스냅샷을 만들거나 발행하지 않습니다.

구현 상태와 public/private 경계는 [`docs/architecture.md`](docs/architecture.md), 전체 개발 기준선과 단계별 상태는 [`docs/development-baseline.md`](docs/development-baseline.md)를 참고하세요.

## 검증

```bash
pnpm check
```

이 명령은 포맷, 린트, 타입 검사, 테스트, 두 앱의 프로덕션 빌드를 순서대로 실행합니다. 초기 기반은 Windows의 Node.js 24.15.0과 pnpm 10.15.1에서 `better-sqlite3` 네이티브 설치, 전체 검사 및 두 애플리케이션 실행까지 확인했습니다.
