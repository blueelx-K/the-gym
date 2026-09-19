# The Gym — 개인 운동 계획/기록 앱 개발 계획

## 1. 개요

Gym과 Home에서 스스로 운동을 계획하고 실행 기록을 관리할 수 있는 개인용 웹 앱.
서버/계정 없이 **휴대폰에 "설치"해서 쓰는 PWA**로 만들고, 모든 데이터는 기기 로컬에만 저장한다.

### 목표 아닌 것 (Out of scope, v1)
- 회원가입/로그인, 여러 사용자 지원
- 클라우드 동기화, 여러 기기 간 자동 동기화
- 서버, 외부 DB, API 서버
- 앱스토어 배포 (PWA "홈 화면에 추가"로 대체)

---

## 2. 기술 스택 & 아키텍처

| 영역 | 선택 | 이유 |
|---|---|---|
| 구조 | 순수 HTML/CSS/JS (빌드 도구 없음) | 가장 단순. 서버 없이 파일만으로 동작, 유지보수 쉬움 |
| 데이터 저장 | IndexedDB (얇은 래퍼 함수로 감싸서 사용) | 구조화된 데이터(계획, 기록, 종목)를 로컬에 안정적으로 저장. localStorage보다 용량/쿼리에 유리 |
| 설치 | Web App Manifest + Service Worker (PWA) | "홈 화면에 추가" 시 아이콘 생성, 전체화면 실행, 오프라인 동작 |
| 배포 | 정적 파일 호스팅 (GitHub Pages 등) 또는 로컬 실행 | 서버 로직이 없으므로 정적 호스팅으로 충분 |
| 백업/복원 | 데이터 export/import (JSON 파일) | 로컬 저장소 데이터 유실 대비, 기기 변경 시 수동 이전 수단 |

> 참고: 프레임워크(React 등) 없이 시작하고, 화면이 복잡해져서 실제로 필요해지면 그때 도입을 재검토한다. (선반영 X, 필요할 때 확장)

---

## 3. 데이터 모델

모두 로컬 IndexedDB에 저장되는 엔티티. 장소(Gym/Home)는 별도 화면이 아니라 **태그**로 구분한다.

### Exercise (운동 종목)
```
{
  id, name,               // 종목명 (예: 벤치프레스, 스쿼트)
  category,               // 예: 가슴/등/하체/유산소 등 (선택)
  location: "gym" | "home" | "both",
  unit: "weight" | "bodyweight" | "time" | "distance",
  isCustom: boolean,
  referenceUrls: [ { label, url } ],  // 운동기구/자세 참고 링크 (유튜브 영상, 기사 등, 여러 개 가능)
  notes
}
```

### RoutinePlan (운동 계획/루틴)
```
{
  id, name,                 // 예: "월요일 - 가슴/삼두"
  dayOfWeek | scheduleType, // 요일 고정 또는 자유 스케줄
  location: "gym" | "home" | "both",
  exercises: [
    { exerciseId, targetSets, targetReps, targetWeight, restSeconds, order }
  ],
  active: boolean
}
```

### WorkoutSession (운동 실행 기록)
```
{
  id, date, planId (nullable, 계획 없이도 기록 가능),
  location: "gym" | "home",
  startedAt, finishedAt,
  logs: [
    { exerciseId, setNumber, reps, weight, durationSec, completed }
  ],
  memo
}
```

### AppSettings
```
{ theme, defaultLocation, units(kg/lb) }
```

---

## 4. 화면 구성 (정보 구조)

단일 통합 앱 안에서 장소는 필터/태그로만 구분한다.

1. **오늘/홈 대시보드**
   - 오늘 예정된 계획(있으면) 바로 시작 버튼
   - 최근 기록 요약, 이번 주 진행 현황 요약
2. **계획(Plan)**
   - 루틴 목록 (요일별/카드 형태), Gym/Home 필터
   - 루틴 생성/수정: 종목 추가, 세트/횟수/무게 목표 설정, 순서 조정
3. **운동 실행/기록**
   - 계획 선택 후 실행 모드 진입 → 세트별 완료 체크, 실제 reps/weight 입력, 휴식 타이머
   - 계획 없이 자유 기록도 가능
   - 종목에 참고 URL이 있으면 실행 화면에서 바로 열람 가능
4. **종목 라이브러리**
   - 기본 종목 목록 + 커스텀 종목 추가/수정/삭제
   - Gym/Home 태그 지정
   - 참고 URL 등록/관리 (운동기구 사용법, 자세 영상 등 링크 여러 개 추가 가능) 및 종목 상세에서 바로 열람
5. **통계/대시보드**
   - 주간/월간 운동 횟수, 종목별 무게/볼륨 추이 그래프
   - 장소별(Gym vs Home) 비교
6. **설정**
   - 데이터 백업(내보내기 JSON) / 복원(가져오기)
   - 단위(kg/lb), 테마, 앱 정보

---

## 5. PWA 설치 요소

- `manifest.json`: 앱 이름, 아이콘(192/512px), `display: standalone`, `start_url`, 테마 색상
- `service-worker.js`: 정적 자산 캐싱 → 오프라인에서도 완전 동작
- 아이콘 세트 준비 (간단한 아이콘 디자인 또는 텍스트 기반 아이콘으로 시작)
- iOS Safari "홈 화면에 추가" 및 Android Chrome "설치" 양쪽 동작 확인

---

## 6. 파일 구조 (제안)

```
/The Gym
  index.html
  manifest.json
  service-worker.js
  /icons               // icon-180/192/512.png (Node zlib로 직접 생성한 PNG)
  /css
    styles.css
  /js
    app.js            // 라우팅/화면 전환, 테마 적용, 서비스 워커 등록
    db.js             // IndexedDB 래퍼 (CRUD)
    utils.js           // 공용 헬퍼(escapeHtml), 설정 read/write, 테마 적용
    home.js             // 오늘/홈 대시보드
    exercises.js         // 종목 라이브러리 로직
    plans.js              // 계획 CRUD
    workout.js             // 운동 실행 로직
    stats.js                // 통계 계산/차트
    backup.js                // 설정 화면(테마, 백업 내보내기/가져오기)
  plan.md
  README.md
```

> 참고: 설정의 "단위(kg/lb)" 항목은 사용자 결정으로 v1에서 생략했다 (한국 사용자 기준 kg 고정, 계획/기록/통계 전반의 무게 입력·표시 로직을 kg/lb 모두 손봐야 해서 배보다 배꼽이 커지는 문제).

---

## 7. 단계별 개발 로드맵

### Phase 0 — 기반 셋업
- 프로젝트 파일 구조 생성, 기본 `index.html`/CSS 뼈대
- `db.js` IndexedDB 래퍼 구현 (open, CRUD 공통 함수)
- 간단한 화면 전환(라우팅) 구조 마련

### Phase 1 — 종목 라이브러리
- 기본 제공 종목 시드 데이터 작성
- 종목 목록/추가/수정/삭제 화면
- Gym/Home 태그 지정 및 필터
- 참고 URL 추가/수정/삭제 (종목당 여러 개), 목록/상세에서 링크 표시

### Phase 2 — 운동 계획(Plan) 작성
- 루틴 생성/수정 화면 (요일 지정, 종목 추가, 목표 세트/횟수/무게)
- 루틴 목록 화면, Gym/Home 필터

### Phase 3 — 운동 실행 기록
- 계획에서 "운동 시작" → 실행 모드 화면
- 세트별 실제 기록 입력(reps/weight/시간), 완료 체크
- 계획 없는 자유 기록 지원
- 휴식 타이머(선택 기능)

### Phase 4 — 오늘/홈 대시보드
- 오늘 예정 루틴 표시, 바로 시작 연결
- 최근 기록 리스트

### Phase 5 — 통계/대시보드
- 주간/월간 운동 횟수 집계
- 종목별 무게/볼륨 추이 (간단한 차트, 라이브러리 없이 SVG 또는 경량 차트 라이브러리 검토)
- Gym vs Home 비교 뷰

### Phase 6 — PWA 설치 & 오프라인
- manifest.json, 아이콘, service worker 작성
- 오프라인 캐싱 검증, "홈 화면에 추가" 테스트 (Android/iOS)

### Phase 7 — 백업/복원 & 마무리
- 전체 데이터 JSON export/import 기능
- 설정 화면(단위, 테마)
- 전반적 UI 다듬기, 반응형(모바일 우선) 점검
- 실기기(휴대폰)에서 설치 후 실사용 테스트

---

## 8. 향후 확장 아이디어 (v1 이후, 지금은 착수하지 않음)
- 클라우드 동기화(선택적 로그인)로 기기 간 백업
- 운동 종목별 사진/영상 첨부
- 알림/리마인더 (PWA Push는 제약이 있어 별도 검토 필요)
- 운동 템플릿 공유/가져오기

---

## 9. 진행 방식
이 plan.md를 기준으로 Phase 0부터 순서대로 진행하며, 각 Phase 완료 시마다 확인 후 다음 단계로 넘어간다.
