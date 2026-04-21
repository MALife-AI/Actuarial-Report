# Insurance P&L Dashboard

보험 손익(P&L) 데이터를 시각화하는 정적 대시보드입니다.

## 구성 파일

| 파일 | 설명 |
|------|------|
| `index.html` | 대시보드 메인 페이지 |
| `style.css` | 스타일시트 (다크 테마) |
| `app.js` | XLSX 파싱, 필터, 차트 렌더링 로직 |
| `data/sample_data1.xlsx` | 샘플 데이터 (804건) |

## 실행 방법

XLSX 파일을 `fetch()`로 읽기 때문에 **로컬 서버**가 필요합니다.

### 방법 1: npx serve (권장)

```bash
npx serve .
```

브라우저에서 `http://localhost:3000` 접속

### 방법 2: Python

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속

### 방법 3: VS Code Live Server

1. VS Code에서 Live Server 확장 설치
2. `index.html` 우클릭 → **Open with Live Server**

## 대시보드 구성

- **KPI 카드**: 총 금액, 보험수익, 보험서비스비용, 데이터 건수
- **반기별 테이블**: 구분/구분2별 상반기·하반기·연간 합계 (소계 포함)
- **막대 차트**: 구분별 금액 비교
- **라인 차트**: 월별·구분별 금액 추이
- **도넛 차트**: 회계모형별/구분2별 금액 비중
- **필터**: 회계모형, 구분 드롭다운

## 기술 스택

- HTML / CSS / JavaScript (Vanilla)
- [Chart.js 4.x](https://www.chartjs.org/) (CDN)
