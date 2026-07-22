# Relink Wiki

Granblue Fantasy: Relink 데이터를 로컬에서 추출·검수하고, 승인된 정보만 공개하는 pnpm 모노레포입니다.

## 현재 구현 범위

- 공개 위키는 검증된 버전 1 정적 JSON 스냅샷에서 캐릭터, 무기, 진, 스킬의 검색·목록·상세 화면을 제공합니다. 저장소에는 로컬 publication을 완료한 실제 schema v1 스냅샷 1,683건이 포함되어 있으며, [Sites 공개본](https://relink-wiki.cid100.chatgpt.site)은 배포 후 전체 JSON 일치 검증을 통과해야 현재 공개본으로 인정합니다. 추출 결과는 그대로 보존하되 아직 독자용 표현 계약이 없는 `character-pl000b` 한 건은 프론트엔드 탐색에서만 제외하므로 검색·목록·상세 UI에는 1,682건이 노출됩니다.
- 로컬 마이닝 관리 도구는 `127.0.0.1:3100`에만 바인딩되며, `RELINK_DATABASE_PATH`의 SQLite에서 normalization 실행, 현재 baseline, 백업 증빙, review state, publication 및 allowlist 미리보기를 표시합니다. 최신 staged 후보의 `added`·`changed`·`removed` 레코드를 공개 allowlist 필드만으로 비교하고 결정적 Markdown 변경 보고서를 내려받으며, 승인/거절 결정 저장과 모든 변경 승인·NAS 백업 gate 후 baseline 승인 및 명시적 snapshot 발행을 실행합니다.
- 추출기 패키지는 GBFRDataTools `2.0.0` 실행 전 점검, 후보 SQLite의 private staging import, 한국어 메시지 조인 검증, 검수용 mapping 후보 생성과 명시적 매핑 기반 normalization을 지원합니다. 좁게 승인된 주인공 예외는 구조·한국어 문맥 근거를 재검증한 뒤 기존 파일을 덮어쓰지 않는 private mapping 개정본으로 만들며, 무기·스킬이 공개 가능한 캐릭터에 안전하게 연결되는지 식별자나 값을 노출하지 않는 집계로 검증합니다.
- 데이터베이스 패키지는 두 private normalization 실행의 공개 후보 필드를 비교하고, 비교 fingerprint에 묶인 레코드별 승인/거절 결정과 NAS 백업 증빙, baseline 동시성 확인을 거친 명시적 승인을 영속화합니다. publisher 패키지는 승인된 baseline에서 allowlist 공개 DTO와 검증 가능한 manifest 미리보기를 만들며, 검토 파일의 전체 SHA-256과 명시적 확인 토큰을 고정한 로컬 발행 요청으로 version 1 JSON 후보 쓰기와 publication DB transaction을 연결합니다. 체크인 snapshot 교체, Sites 배포와 rollback은 관리 UI 발행과 분리됩니다.
- 공개 위키 빌드는 Sites용 Worker와 정적 자산만 루트 `dist/`에 패키징하고, 관리 앱·SQLite·로컬 경로 표식이 산출물에 포함되지 않았는지 검사합니다. 현재 실제 스냅샷은 이 경계를 통과해 Sites에 공개됐으며, 저장소의 검토 파일과 배포본의 전체 JSON 일치 여부를 별도 명령으로 확인할 수 있습니다. 이전 체크포인트로 실제 전환하는 rollback 훈련은 명시적 운영 승인 후 수행합니다.

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

관리 도구는 기본적으로 `127.0.0.1:3100`에만 바인딩됩니다. 실행 전에 비공개 셸 환경에 `RELINK_DATABASE_PATH`를 설정해야 합니다. 화면 조회는 기존 파일을 읽기 전용으로 열고, 사용자가 레코드 결정을 저장하거나 승인 버튼을 누를 때만 짧은 쓰기 연결을 사용합니다. 앱은 데이터베이스를 생성하거나 마이그레이션하지 않으므로 쓰기 기능을 사용하기 전에 NAS 백업 후 최신 마이그레이션을 적용해야 합니다. 발행 버튼은 추가로 `RELINK_PUBLICATION_REQUEST_PATH`의 private 요청을 사용합니다. 미설정·누락·손상 상태는 경로나 내부 값을 노출하지 않는 오류 화면으로 표시됩니다. 자세한 화면 계약은 [`docs/review-dashboard.md`](docs/review-dashboard.md)를 참고하세요. 추출기 설정은 `.env.example`을 참고하되 실제 경로와 데이터는 커밋하지 않습니다.

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

추출한 한국어 메시지와 네 후보 테이블의 표시명 조인 범위를 원문 노출 없이 검증하려면 다음 명령을 실행합니다.

```bash
pnpm --filter @relink-wiki/extractor localization:validate
```

필요한 비공개 메시지 경로, 확인된 조인 열, 현재 미해결 범위는 [`docs/localization-validation.md`](docs/localization-validation.md)를 참고하세요. 이 명령은 정규화 레코드를 쓰거나 발행하지 않습니다.

현재 검수 mapping의 무기·스킬 → 캐릭터 관계가 공개 링크로 확장 가능한지 읽기 전용으로 검증하려면 실행합니다.

```bash
pnpm --filter @relink-wiki/extractor relationships:validate
```

명령은 집계 건수만 출력하며 source 식별자, 공개 ID, 한국어 이름과 로컬 경로를 반환하지 않습니다. 2026-07-18 private mapping 개정본의 두 주인공 레코드는 diff 승인, baseline 승인과 schema v1 발행을 마쳤고, 무기 361건·스킬 262건의 관계도 모두 해결되어 준비 상태가 열렸습니다. 관계 자체를 공개하기 전에 남은 versioned DTO·migration·NAS 백업 gate는 [`docs/relationship-validation.md`](docs/relationship-validation.md)를 참고하세요.

정책 승인된 두 주인공 레코드의 새 private mapping 개정본은 기존 mapping과 별도 출력 경로를 설정한 뒤 생성합니다.

```bash
pnpm --filter @relink-wiki/extractor mapping:protagonists
```

이 명령은 정책의 구조·한국어 문맥 근거를 다시 확인하고 기존 mapping을 덮어쓰지 않습니다. 생성된 개정본은 다시 `normalize:mapped`와 레코드별 diff 검수를 거쳐야 하며, 그 단계가 완료되어도 공개 schema나 snapshot은 자동으로 변경되지 않습니다.

현재 import와 검증된 한국어 조인에서 로컬 검수용 mapping 후보를 처음 생성하려면 실행합니다.

```bash
pnpm --filter @relink-wiki/extractor mapping:candidate
```

후보 생성은 현재 candidate import를 멱등 확인하고, 빈 키·미해결 키·비정규 키를 제외하며 기존 파일을 덮어쓰지 않습니다. 출력은 검수 전 비공개 초안입니다. 식별자 규칙과 검수 절차는 [`docs/mapping-candidate.md`](docs/mapping-candidate.md)를 참고하세요.

검수한 로컬 전용 매핑 JSON으로 비공개 staging 레코드를 정규화하려면 실행합니다.

```bash
pnpm --filter @relink-wiki/extractor normalize:mapped
```

정규화 입력 계약, 출처 보존과 재실행 동작은 [`docs/normalization.md`](docs/normalization.md)를 참고하세요. 정규화된 레코드는 항상 `staged` 상태로 시작하며 자동 발행되지 않습니다.

두 private normalization 실행 간 `added`, `changed`, `removed`, `unchanged` 비교 계약은 [`docs/normalization-diff.md`](docs/normalization-diff.md)를 참고하세요. 관리 화면은 현재 schema v1 baseline과 최신 staged 후보를 선택하고, 변경 레코드만 페이지 단위로 검수합니다.

정규화 실행 승인, NAS 백업 증빙과 스키마 버전별 baseline 계약은 [`docs/normalization-review.md`](docs/normalization-review.md)를 참고하세요. 승인은 레코드를 `reviewed`로 전환하지만 공개 스냅샷을 만들거나 발행하지 않습니다.

승인된 baseline에서 공개 가능한 필드만 추려 manifest 미리보기를 생성하려면 비공개 셸에서 실행합니다.

```bash
pnpm preview:public
```

사람이 검토한 미리보기의 전체 파일 SHA-256과 content revision, 고정 publication UUID, 새 NAS 백업 증빙, 출력 디렉터리 및 시각을 private 요청 JSON에 기록한 뒤 `RELINK_PUBLICATION_REQUEST_PATH`로 가리키고 명시적으로 실행합니다.

```bash
pnpm publish:public
```

명령은 확인 토큰 `PUBLISH_REVIEWED_PUBLIC_SNAPSHOT_V1`이 있는 요청만 허용하고, 검토 파일이 바뀌지 않았는지 확인한 뒤 후보 쓰기와 publication 이력 및 `published` 상태 전환을 연결합니다. 동일 요청은 응답 유실 후에도 그대로 재실행할 수 있습니다. 전체 요청 계약은 [`docs/publication-preview.md`](docs/publication-preview.md), DB 완료 계약은 [`docs/publication-history.md`](docs/publication-history.md)를 참고하세요. 이 명령은 체크인 스냅샷 교체나 Sites 배포를 수행하지 않습니다.

Sites 빌드 산출물, 배포 전 경계 검사와 실제 스냅샷 발행 분리는 [`docs/sites-deployment.md`](docs/sites-deployment.md)를 참고하세요. 구현 상태와 public/private 경계는 [`docs/architecture.md`](docs/architecture.md), 전체 개발 기준선과 단계별 상태는 [`docs/development-baseline.md`](docs/development-baseline.md)를 참고하세요.

현재 Sites 공개본이 체크인된 검토 스냅샷과 정확히 일치하는지 확인하려면 실행합니다.

```bash
pnpm site:verify -- https://relink-wiki.cid100.chatgpt.site
```

이 명령은 HTTPS 공개 origin의 version 1 JSON만 읽고 체크인 파일과 전체 구조를 비교한 뒤 schema version, content revision과 카테고리별 수량만 출력합니다. 다른 체크포인트를 복구 검증할 때는 그 버전에서 보존한 검토 파일을 `--expected-snapshot <file>`로 지정합니다.

## 검증

```bash
pnpm check
```

이 명령은 포맷, 린트, 타입 검사, 테스트, 두 앱의 프로덕션 빌드를 순서대로 실행합니다. 초기 기반은 Windows의 Node.js 24.15.0과 pnpm 10.15.1에서 `better-sqlite3` 네이티브 설치, 전체 검사 및 두 애플리케이션 실행까지 확인했습니다.
