# PDF Toolkit v3.4

**올인원 PDF 도구 — 병합 · 분할 · 워터마크 · 프린트용 변환**

> 인터넷 연결 없이 브라우저 단독으로 실행되는 오프라인 PDF 도구 모음입니다.  
> 모든 파일 처리는 사용자 PC 내에서 이루어지며, 서버로 전송되지 않습니다.

---

## ✨ 주요 기능

### 1. PDF 병합 (Merge)
여러 PDF 및 이미지 파일을 하나의 PDF로 합칩니다.

- **지원 형식:** PDF, PNG, JPG, BMP, GIF, TIFF, WebP
- **드래그 앤 드롭:** 파일이 이미 로드된 상태에서도 화면에 드래그하여 추가 가능
- **다중 선택 & 순서 변경:** 파일/페이지를 `Ctrl+클릭`, `Shift+클릭`으로 다중 선택 후 드래그하여 순서 변경
- **이름순 정렬:** 오름차순(A→Z) / 내림차순(Z→A) 정렬
- **페이지 회전:** 개별 또는 전체 90° 회전
- **북마크(목차):** 파일명 기준 자동 생성 또는 수동 추가 (계층 구조 지원)

### 2. PDF 분할 (Split)
PDF에서 원하는 페이지를 선별 추출하거나 개별 분할합니다.

- **추출 방법:**
  - 선택한 페이지를 **하나의 PDF로 합쳐서 추출**
  - 선택한 페이지를 **각각 개별 파일로 분할** (ZIP 다운로드)
- **출력 형식:** PDF / PNG / JPEG (1x~3x DPI 선택)
- **페이지 회전:** 회전 상태가 추출 결과에 반영됨
- **파일명 규칙:** 4자리 일련번호 (`_page0001`, `_page0002` …) — 파일 정렬 용이

### 3. 워터마크 삽입 (Watermark)
PDF 위에 로고·도장·텍스트 이미지를 투명하게 겹쳐 삽입합니다.

- **워터마크 파일:** PDF, JPG, PNG 지원
- **배치 위치:** 중앙, 좌상단, 우상단, 좌하단, 우하단, 대각선 반복(격자 패턴)
- **불투명도 & 크기:** 슬라이더로 세밀 조절
- **미리보기:** Multiply 블렌딩 적용으로 원본 글씨가 가려지지 않음

### 4. 프린트용 변환 (Print Conversion)
긴 스크린샷 이미지를 A4 용지 폭에 맞게 확대하여 다중 페이지 PDF로 변환합니다.

- **용지 설정:** A4 / Letter / Legal, 세로 / 가로
- **여백:** 0~30mm 슬라이더 조절
- **페이지 겹침:** 0~50mm — 이전 페이지 끝부분을 다음 페이지에 중복 표시
- **비율 유지:** 마지막 페이지에 남은 이미지가 적을 경우 늘리지 않고 원본 비율 유지
- **실시간 미리보기:** 옵션 변경 시 즉시 업데이트

---

## 🚀 실행 방법

1. 저장소를 클론하거나 ZIP으로 다운로드합니다.
2. `index.html` 파일을 웹 브라우저(Chrome, Edge 등)로 열어주세요.
3. 별도의 설치나 서버 구동이 필요 없습니다.

```bash
git clone https://github.com/wallofthehell/PDF-Toolkit-3.4.git
```

> 💡 `manual.html`을 열면 인쇄 가능한 A4 사용 설명서를 확인할 수 있습니다.

---

## 🛠 기술 스택

| 구분 | 기술 |
|------|------|
| **프론트엔드** | HTML5, CSS3, Vanilla JavaScript |
| **PDF 처리** | [pdf-lib](https://pdf-lib.js.org/) (생성/편집), [PDF.js](https://mozilla.github.io/pdf.js/) (렌더링) |
| **파일 압축** | [JSZip](https://stuk.github.io/jszip/) |
| **파일 저장** | [FileSaver.js](https://github.com/nicktomlin/FileSaver.js) |
| **폰트** | Inter (로컬 번들), 시스템 기본 글꼴 |

모든 라이브러리는 `lib/` 폴더에 로컬 번들로 포함되어 있어 **오프라인 환경**에서도 완전히 동작합니다.

---

## 📁 프로젝트 구조

```
PDF-Toolkit-3.4/
├── index.html          # 메인 앱
├── styles.css          # 디자인 시스템 & 스타일
├── app.js              # 전체 앱 로직
├── manual.html         # A4 인쇄용 사용 설명서
├── server.ps1          # 로컬 서버 스크립트 (선택)
├── lib/
│   ├── pdf-lib.min.js
│   ├── pdf.min.js
│   ├── pdf.worker.min.js
│   ├── jszip.min.js
│   ├── FileSaver.min.js
│   └── fonts/
│       └── inter-latin.woff2
└── README.md
```

---

## ⌨ 조작 안내

| 조작 | 설명 |
|------|------|
| `클릭` | 항목 1개 선택 |
| `Ctrl + 클릭` | 항목 추가 선택 / 해제 |
| `Shift + 클릭` | 범위 선택 |
| 드래그 앤 드롭 | 선택된 항목을 원하는 위치로 이동 |

---

## 📄 라이선스

이 프로젝트는 개인 및 업무용으로 자유롭게 사용할 수 있습니다.

---

<p align="center">
  <strong>© 2026 Seongwon Yun (L.I.)</strong><br>
  <em>Powered by Google Antigravity</em>
</p>
