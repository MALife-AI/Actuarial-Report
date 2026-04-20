# Changelog

Insurance P&L Dashboard (미래에셋생명 Actuarial Report)의 모든 주요 변경 사항을 기록합니다.

본 문서는 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따르며,
버전 번호는 [Semantic Versioning](https://semver.org/lang/ko/)을 준수합니다.

---

## [1.0.0] - 2026-04-20

최초 릴리스 버전. 샘플 JPG 레이아웃과 미래에셋 공식 디지털 가이드라인을 적용한 베이스라인.

### Added
- **대시보드 레이아웃 (3 섹션)**
  - `1.당월` P&L 테이블 — 회계모형(NP/IDP/VFA) × 구분/구분2 집계
  - `2.당해 누적` P&L 테이블 — 연간 누적 집계
  - `3.최근 12개월 월별 추이` — 라인 차트 + 월별 데이터 테이블
- **P&L 계산 로직**
  - 보험수익 → 보험서비스비용 → 보험손익(차감전) → 간접사업비 → 보험손익(차감후)
- **데이터 필터** — 회계모형, 구분 드롭다운
- **챗봇** — 플로팅 버튼형 Q&A 인터페이스

### Design
- **미래에셋 공식 디지털 가이드라인(2020.04) 적용**
  - 주색상: Orange `#F58220`, Blue `#043B72`
  - 보조: Orange Light `#FAAF72`, Footer BG `#ECEFF4`
  - 서체: Spoqa Han Sans Neo (CDN)
  - 헤더: Type A (오렌지 배경 + 화이트 로고)
  - 푸터: Blue 배경 + 화이트 로고 + 고객센터 정보
  - 드래그 선택: 텍스트 `#FFFFFF` / 배경 `#F58220`
- **로고 자산** — `assets/logo/`에 미래에셋생명 공식 로고 포함

### Tech Stack
- HTML / CSS / Vanilla JavaScript
- Chart.js 4.4.7 (CDN)
- Spoqa Han Sans Neo (CDN)

[1.0.0]: https://semver.org/lang/ko/
