/**
 * ===================================================================
 * Insurance P&L Dashboard - app.js
 * XLSX → 당월 / 당해 누적 / 최근 12개월 월별 추이 렌더링
 * ===================================================================
 */

/* ---------- 전역 상태 ---------- */
let rawData = [];
let filteredData = [];
let trendChart = null;

/* ---------- 설정 ---------- */
const MODELS = ['NP', 'IDP', 'VFA'];          // 열로 표시할 회계모형
const SECTIONS = ['보험수익', '보험서비스비용']; // 상세 행 구분
const INDIRECT_KEY = '간접사업비';

/* ================================================================
 * 1. XLSX 파싱 (SheetJS 사용)
 *   - 첫 시트 헤더를 키로 사용해 제네릭 객체 배열 반환
 *   - 마감년도/마감년월 등 정수형 키는 문자열로 변환 (뒤에서 slice 사용)
 * ================================================================ */
function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  return rows.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === '마감년도' || k === '마감년월' || k === '코호트') {
        out[k] = String(v);
      } else if (typeof v === 'number') {
        out[k] = v;
      } else {
        out[k] = v;
      }
    }
    // 금액/숫자 필드는 문자열로 들어오면 parseFloat
    ['금액', '보험금융비용', '이자부리대상금액', '부담이자율'].forEach(k => {
      if (out[k] !== undefined && typeof out[k] !== 'number') {
        out[k] = parseFloat(out[k]) || 0;
      }
    });
    return out;
  });
}

/* ================================================================
 * 2. 필터
 * ================================================================ */
function initFilters() {
  const allYms = [...new Set(rawData.map(d => d.마감년월))].sort((a, b) => b.localeCompare(a));
  const latestYm = allYms[0];
  const sel = document.getElementById('current-yearmonth');
  if (!sel) return;
  sel.innerHTML = allYms
    .map(ym => `<option value="${ym}">${ym.slice(0, 4)}.${ym.slice(4)}</option>`)
    .join('');
  sel.value = latestYm;
  sel.addEventListener('change', () => renderAll());
}

function getSelectedYm() {
  const sel = document.getElementById('current-yearmonth');
  if (sel && sel.value) return sel.value;
  return filteredData.reduce((mx, d) => d.마감년월 > mx ? d.마감년월 : mx, '000000');
}

function renderAll() {
  const selectedYm = getSelectedYm();
  const selectedYear = selectedYm.slice(0, 4);
  const selectedMonth = parseInt(selectedYm.slice(4), 10);

  const curTag = document.getElementById('current-month-tag');
  if (curTag) curTag.textContent = `${selectedYear}.${String(selectedMonth).padStart(2, '0')}`;
  const ytdTag = document.getElementById('ytd-tag');
  if (ytdTag) ytdTag.textContent = `${selectedYear}.01 ~ ${selectedYear}.${String(selectedMonth).padStart(2, '0')}`;

  // 당월 데이터 (선택 월만)
  const currentMonthData = filteredData.filter(d => d.마감년월 === selectedYm);
  // 당해 누적 데이터 (선택 연도 1월 ~ 선택 월)
  const ytdData = filteredData.filter(d => d.마감년도 === selectedYear && d.마감년월 <= selectedYm);

  renderPnLTable(currentMonthData, 'current-month-tbody');
  renderPnLTable(ytdData, 'ytd-tbody');
  renderTrend(filteredData, selectedYm);

  // 보험금융손익 · 예실차 탭도 선택월 기준으로 다시 렌더
  if (typeof renderFinancial === 'function') renderFinancial();
  if (typeof renderVariance === 'function') renderVariance();
}

/* ================================================================
 * 3. P&L 테이블 (당월 / 당해 누적 공용)
 * ================================================================ */
function renderPnLTable(data, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';

  // 섹션별 소계 저장 (차감전/차감후 계산용)
  const sectionSubtotals = {};

  SECTIONS.forEach(sectionKey => {
    // 섹션 헤더
    const headerTr = document.createElement('tr');
    headerTr.className = 'section-header';
    headerTr.innerHTML = `<td colspan="5">${sectionKey}</td>`;
    tbody.appendChild(headerTr);

    // 구분2별 집계
    const sub2Groups = {};
    data.filter(d => d.구분 === sectionKey).forEach(d => {
      if (!sub2Groups[d.구분2]) sub2Groups[d.구분2] = emptyRow();
      if (MODELS.includes(d.회계모형)) sub2Groups[d.구분2][d.회계모형] += d.금액;
      sub2Groups[d.구분2].Total += d.금액;
    });

    // 상세 행
    const sub = emptyRow();
    Object.keys(sub2Groups).sort().forEach(name => {
      const v = sub2Groups[name];
      addToRow(sub, v);
      appendDetailRow(tbody, name, v);
    });

    // 섹션 합계 행
    appendSumRow(tbody, `${sectionKey} 합계`, sub, 'subtotal');

    sectionSubtotals[sectionKey] = sub;
  });

  // 보험손익 (간접사업비 차감전) = 보험수익 - 보험서비스비용
  const pnlBefore = diffRow(sectionSubtotals['보험수익'], sectionSubtotals['보험서비스비용']);
  appendSumRow(tbody, '보험손익(간접사업비 차감전)', pnlBefore, 'subtotal');

  // 간접사업비 집계
  const indirect = emptyRow();
  data.filter(d => d.구분 === INDIRECT_KEY).forEach(d => {
    if (MODELS.includes(d.회계모형)) indirect[d.회계모형] += d.금액;
    indirect.Total += d.금액;
  });
  appendSumRow(tbody, '간접사업비', indirect, 'subtotal');

  // 보험손익 (간접사업비 차감후)
  const pnlAfter = diffRow(pnlBefore, indirect);
  appendSumRow(tbody, '보험손익(간접사업비 차감후)', pnlAfter, 'total-row');
}

function emptyRow()      { return { NP: 0, IDP: 0, VFA: 0, Total: 0 }; }
function addToRow(dst, s){ dst.NP+=s.NP; dst.IDP+=s.IDP; dst.VFA+=s.VFA; dst.Total+=s.Total; }
function diffRow(a, b)   { return { NP:a.NP-b.NP, IDP:a.IDP-b.IDP, VFA:a.VFA-b.VFA, Total:a.Total-b.Total }; }

function appendDetailRow(tbody, name, v) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="indent">${name}</td>
    ${numCell(v.NP)}${numCell(v.IDP)}${numCell(v.VFA)}${numCell(v.Total)}
  `;
  tbody.appendChild(tr);
}

function appendSumRow(tbody, label, v, className) {
  const tr = document.createElement('tr');
  tr.className = className;
  tr.innerHTML = `
    <td>${label}</td>
    ${numCell(v.NP)}${numCell(v.IDP)}${numCell(v.VFA)}${numCell(v.Total)}
  `;
  tbody.appendChild(tr);
}

function numCell(v) {
  const neg = v < 0 ? ' neg' : '';
  return `<td class="num${neg}">${formatInt(v)}</td>`;
}

/* ================================================================
 * 4. 최근 12개월 월별 추이 (라인 차트 + 데이터 테이블)
 * ================================================================ */
function renderTrend(data, selectedYm) {
  // 선택월 기준 최근 12개월 키 생성 (예: 선택이 202511 → 202412 ~ 202511)
  const months = [];
  let y = parseInt(selectedYm.slice(0, 4), 10);
  let m = parseInt(selectedYm.slice(4), 10);
  for (let i = 0; i < 12; i++) {
    months.unshift(`${y}${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) { m = 12; y--; }
  }

  const monthly = {};
  months.forEach(ym => { monthly[ym] = { 보험수익: 0, 보험서비스비용: 0, 간접사업비: 0 }; });
  data.forEach(d => {
    const bucket = monthly[d.마감년월];
    if (bucket && d.구분 in bucket) bucket[d.구분] += d.금액;
  });

  const labels  = months.map(ym => `${ym.slice(2, 4)}.${ym.slice(4)}`);
  const revArr  = months.map(ym => monthly[ym].보험수익);
  const costArr = months.map(ym => monthly[ym].보험서비스비용);
  const indArr  = months.map(ym => monthly[ym].간접사업비);
  const pnlArr  = months.map(ym => monthly[ym].보험수익 - monthly[ym].보험서비스비용 - monthly[ym].간접사업비);

  renderTrendChart(labels, pnlArr);
  renderTrendTable(labels, revArr, costArr, indArr, pnlArr);
}

function renderTrendChart(labels, pnlArr) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChart) trendChart.destroy();

  // 미래에셋 공식 그래프 컬러 — Orange 메인, Blue 강조
  const MA_ORANGE = '#F58220';
  const MA_BLUE   = '#043B72';
  const MA_GRID   = 'rgba(4, 59, 114, 0.08)';
  const MA_TEXT   = '#48535B';

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '보험손익',
        data: pnlArr,
        borderColor: MA_ORANGE,
        backgroundColor: 'rgba(245, 130, 32, 0.12)',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: MA_BLUE,
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: MA_BLUE,
          titleColor: '#FFFFFF',
          bodyColor: '#FFFFFF',
          borderColor: MA_ORANGE,
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: ctx => ` 보험손익: ${formatInt(ctx.parsed.y)}`
          }
        },
        datalabels: false,
      },
      scales: {
        x: {
          ticks: { color: MA_TEXT, font: { size: 11, family: "'Spoqa Han Sans Neo','Malgun Gothic',sans-serif" } },
          grid: { display: false },
          border: { color: '#CDCECB' },
        },
        y: {
          ticks: {
            color: MA_TEXT,
            font: { size: 11, family: "'Spoqa Han Sans Neo','Malgun Gothic',sans-serif" },
            callback: v => formatInt(v),
          },
          grid: { color: MA_GRID },
          border: { display: false },
        }
      }
    },
    plugins: [{
      id: 'valueLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.fillStyle = MA_BLUE;
        ctx.font = 'bold 11px "Spoqa Han Sans Neo", "Malgun Gothic", sans-serif';
        ctx.textAlign = 'center';
        meta.data.forEach((pt, i) => {
          const v = chart.data.datasets[0].data[i];
          ctx.fillText(formatInt(v), pt.x, pt.y - 12);
        });
        ctx.restore();
      }
    }]
  });
}

function renderTrendTable(labels, revArr, costArr, indArr, pnlArr) {
  // 헤더 업데이트
  const theadRow = document.getElementById('trend-thead-row');
  theadRow.innerHTML = '<th>구분</th>' +
    labels.map(l => `<th class="num">${l}</th>`).join('');

  // 본문
  const tbody = document.getElementById('trend-tbody');
  tbody.innerHTML = '';

  const rows = [
    ['보험수익',       revArr],
    ['보험서비스비용', costArr],
    ['간접사업비',     indArr],
    ['보험손익',       pnlArr],
  ];

  rows.forEach(([label, arr], idx) => {
    const tr = document.createElement('tr');
    if (idx === rows.length - 1) tr.className = 'total-row';
    tr.innerHTML = `<td>${label}</td>` +
      arr.map(v => `<td class="num${v < 0 ? ' neg' : ''}">${formatInt(v)}</td>`).join('');
    tbody.appendChild(tr);
  });
}

/* ================================================================
 * 5. 유틸리티
 * ================================================================ */
/** 정수 천단위 콤마 포맷 */
function formatInt(n) {
  return Math.round(n).toLocaleString('ko-KR');
}

/* ================================================================
 * 6. 탭 전환
 * ================================================================ */
function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      buttons.forEach(b => b.classList.toggle('tab-active', b === btn));
      panels.forEach(p => p.classList.toggle('tab-panel-active', p.id === `tab-${target}`));
    });
  });
}

/* ================================================================
 * 7. 초기화 — 4개 xlsx 병렬 로드 후 각 탭 렌더
 * ================================================================ */
async function loadXlsx(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} 로드 실패`);
  return parseXLSX(await res.arrayBuffer());
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [d1, d2a, d2b, d3] = await Promise.all([
      loadXlsx('data/sample_data1.xlsx'),
      loadXlsx('data/sample_data2_1.xlsx'),
      loadXlsx('data/sample_data2_2.xlsx'),
      loadXlsx('data/sample_data3..xlsx'),
    ]);

    // Tab 1 (보험손익) 데이터
    rawData = d1;
    filteredData = [...rawData];

    // Tab 2/3 전역 노출
    window.rawData2_1 = d2a;
    window.rawData2_2 = d2b;
    window.rawData3 = d3;

    initTabs();
    initFilters();
    renderAll();

    // Tab 2/3 렌더 (각 JS 파일에서 제공)
    if (typeof renderFinancial === 'function') renderFinancial();
    if (typeof renderVariance === 'function') renderVariance();
  } catch (err) {
    document.body.innerHTML = `
      <div style="padding:40px;text-align:center;color:#e74c3c;">
        <h2>데이터 로드 실패</h2>
        <p>${err.message}</p>
        <p style="color:#a0a0b0;font-size:13px;margin-top:12px;">
          로컬 서버에서 실행하세요: <code>npx serve .</code>
        </p>
      </div>`;
  }
});
