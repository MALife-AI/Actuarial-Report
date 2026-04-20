/**
 * ===================================================================
 * Insurance P&L Dashboard - app.js
 * CSV → 당월 / 당해 누적 / 최근 12개월 월별 추이 렌더링
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
 * 1. CSV 파싱
 * ================================================================ */
function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split('\n');
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    return {
      마감년도: cols[0],
      마감년월: cols[1],
      회계모형: cols[2],
      구분:     cols[3],
      구분2:    cols[4],
      금액:     parseFloat(cols[5]) || 0,
    };
  });
}

/* ================================================================
 * 2. 필터
 * ================================================================ */
function initFilters() {
  const models = [...new Set(rawData.map(d => d.회계모형))].sort();
  const cats   = [...new Set(rawData.map(d => d.구분))].sort();

  const modelSel = document.getElementById('filter-model');
  const catSel   = document.getElementById('filter-cat1');

  modelSel.innerHTML = '<option value="ALL">전체</option>';
  catSel.innerHTML   = '<option value="ALL">전체</option>';

  models.forEach(m => modelSel.innerHTML += `<option value="${m}">${m}</option>`);
  cats.forEach(c => catSel.innerHTML += `<option value="${c}">${c}</option>`);

  modelSel.addEventListener('change', applyFilters);
  catSel.addEventListener('change', applyFilters);
}

function applyFilters() {
  const model = document.getElementById('filter-model').value;
  const cat   = document.getElementById('filter-cat1').value;

  filteredData = rawData.filter(d => {
    if (model !== 'ALL' && d.회계모형 !== model) return false;
    if (cat   !== 'ALL' && d.구분     !== cat)   return false;
    return true;
  });

  renderAll();
}

function renderAll() {
  const latestYm = filteredData.reduce((mx, d) => d.마감년월 > mx ? d.마감년월 : mx, '000000');
  const latestYear = latestYm.slice(0, 4);
  const latestMonth = parseInt(latestYm.slice(4), 10);

  document.getElementById('period-label').textContent = `${latestYear}년`;
  document.getElementById('current-month-tag').textContent = `${latestYear}.${String(latestMonth).padStart(2, '0')}`;
  document.getElementById('ytd-tag').textContent = `${latestYear}.01 ~ ${latestYear}.${String(latestMonth).padStart(2, '0')}`;

  // 당월 데이터
  const currentMonthData = filteredData.filter(d => d.마감년월 === latestYm);
  // 당해 누적 데이터 (해당 연도 전체)
  const ytdData = filteredData.filter(d => d.마감년도 === latestYear);

  renderPnLTable(currentMonthData, 'current-month-tbody');
  renderPnLTable(ytdData, 'ytd-tbody');
  renderTrend(ytdData, latestYear);
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
function renderTrend(data, year) {
  // 월별 집계: { 1: {수익, 비용, 간접, 손익}, 2: {...}, ... }
  const monthly = {};
  for (let m = 1; m <= 12; m++) {
    monthly[m] = { 보험수익: 0, 보험서비스비용: 0, 간접사업비: 0 };
  }
  data.forEach(d => {
    const m = parseInt(d.마감년월.slice(4), 10);
    if (d.구분 in monthly[m]) monthly[m][d.구분] += d.금액;
  });

  const monthKeys = Array.from({ length: 12 }, (_, i) => i + 1);
  const labels    = monthKeys.map(m => `${m}월`);
  const revArr    = monthKeys.map(m => monthly[m].보험수익);
  const costArr   = monthKeys.map(m => monthly[m].보험서비스비용);
  const indArr    = monthKeys.map(m => monthly[m].간접사업비);
  const pnlArr    = monthKeys.map(m => monthly[m].보험수익 - monthly[m].보험서비스비용 - monthly[m].간접사업비);

  // 라인 차트
  renderTrendChart(labels, pnlArr);

  // 하단 데이터 테이블
  renderTrendTable(year, monthKeys, revArr, costArr, indArr, pnlArr);
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

function renderTrendTable(year, months, revArr, costArr, indArr, pnlArr) {
  // 헤더 업데이트
  const theadRow = document.getElementById('trend-thead-row');
  theadRow.innerHTML = '<th>구분</th>' +
    months.map(m => `<th class="num">${year.slice(2)}.${String(m).padStart(2,'0')}</th>`).join('');

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
 * 6. 초기화
 * ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  fetch('data/sales_data_sample.csv')
    .then(res => {
      if (!res.ok) throw new Error('CSV 파일을 불러올 수 없습니다.');
      return res.text();
    })
    .then(text => {
      rawData = parseCSV(text);
      filteredData = [...rawData];
      initFilters();
      renderAll();
    })
    .catch(err => {
      document.body.innerHTML = `
        <div style="padding:40px;text-align:center;color:#e74c3c;">
          <h2>데이터 로드 실패</h2>
          <p>${err.message}</p>
          <p style="color:#a0a0b0;font-size:13px;margin-top:12px;">
            로컬 파일 시스템에서 직접 열면 CORS 제한이 발생합니다.<br>
            로컬 서버를 실행해주세요: <code>npx serve .</code>
          </p>
        </div>`;
    });
});
