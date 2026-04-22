/**
 * ===================================================================
 * Tab 2: 보험금융손익 (Insurance Financial P&L)
 * - 섹션 1/2/3/5: sample_data2_2 (rawData2_2)
 * - 섹션 4 부담이자율: sample_data2_1 (rawData2_1)
 * ===================================================================
 */

function renderFinancial() {
  const d2 = window.rawData2_2 || [];
  const d1 = window.rawData2_1 || [];
  if (d2.length === 0) return;

  // 헤더 콤보박스에서 선택된 마감년월 기준 과거 12개월
  const sel = document.getElementById('current-yearmonth');
  const allMonths = [...new Set(d2.map(r => r.마감년월))].sort();
  const anchorYm = (sel && sel.value) ? sel.value : allMonths[allMonths.length - 1];
  const months = last12Months(anchorYm).filter(m => allMonths.includes(m));

  renderFinSection('fin-np-thead', 'fin-np-tbody', d2, months, {
    filter: r => r.회계모형 === 'NP' && r.구분 === '이자부리',
  });
  renderFinSection('fin-idp-thead', 'fin-idp-tbody', d2, months, {
    filter: r => r.회계모형 === 'IDP' && r.구분 === '이자부리',
  });
  renderVfaSection('fin-vfa-thead', 'fin-vfa-tbody', d2, months);
  renderRateSection('fin-rate-thead', 'fin-rate-tbody', d2, d1, months);
  renderOciSection('fin-oci-thead', 'fin-oci-tbody', d2, months);
}

/** 섹션 1(NP) / 2(IDP) 공통 — 상품유형 × 월 sum(보험금융비용) + 합계 */
function renderFinSection(theadId, tbodyId, data, months, opts) {
  const rows = data.filter(opts.filter);
  const products = orderedProducts([...new Set(rows.map(r => r.상품유형))]);

  setFinHeader(theadId, '', months);

  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';

  const totals = months.map(() => 0);
  products.forEach(p => {
    const tr = document.createElement('tr');
    let cells = `<td>${p}</td>`;
    months.forEach((m, i) => {
      const v = rows
        .filter(r => r.상품유형 === p && r.마감년월 === m)
        .reduce((s, r) => s + (r.보험금융비용 || 0), 0);
      totals[i] += v;
      cells += finCell(v);
    });
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
  // 합계
  const sumTr = document.createElement('tr');
  sumTr.className = 'subtotal';
  sumTr.innerHTML = `<td>합계</td>` + totals.map(t => finCell(t)).join('');
  tbody.appendChild(sumTr);
}

/** 섹션 3 VFA — 상품유형 × 구분(이자부리/위험경감) × 월 */
function renderVfaSection(theadId, tbodyId, data, months) {
  const rows = data.filter(r => r.회계모형 === 'VFA');
  const products = orderedProducts([...new Set(rows.map(r => r.상품유형))]);
  const subCats = ['이자부리', '위험경감'];

  // 헤더 두 줄 사용
  const thead = document.getElementById(theadId);
  thead.innerHTML =
    `<tr><th rowspan="2">상품</th><th rowspan="2">구분</th>` +
    months.map(m => `<th>${toMonthLabel(m)}</th>`).join('') + `</tr>`;

  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  const grandTotals = months.map(() => 0);

  products.forEach(p => {
    subCats.forEach((sub, i) => {
      const tr = document.createElement('tr');
      const firstCell = i === 0 ? `<td rowspan="${subCats.length}">${p}</td>` : '';
      let cells = `${firstCell}<td class="sub-label">${sub}</td>`;
      months.forEach((m, idx) => {
        const v = rows
          .filter(r => r.상품유형 === p && r.구분 === sub && r.마감년월 === m)
          .reduce((s, r) => s + (r.보험금융비용 || 0), 0);
        grandTotals[idx] += v;
        cells += finCell(v);
      });
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });
  });

  const sumTr = document.createElement('tr');
  sumTr.className = 'subtotal';
  sumTr.innerHTML = `<td colspan="2">합계</td>` + grandTotals.map(t => finCell(t)).join('');
  tbody.appendChild(sumTr);
}

/**
 * 섹션 4 부담이자율 — 회계모형(IDP/NP) × 상품 × 월
 * - 상품별 행: sample_data2_2 (d2) 사용
 * - 각 모형의 합계 행 / 총합 행: sample_data2_1 (d1) 사용
 */
function renderRateSection(theadId, tbodyId, d2, d1, months) {
  const thead = document.getElementById(theadId);
  thead.innerHTML =
    `<tr><th>회계모형</th><th>상품</th>` +
    months.map(m => `<th>${toMonthLabel(m)}</th>`).join('') + `</tr>`;

  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  const models = ['IDP', 'NP'];

  models.forEach(model => {
    const modelRows = d2.filter(r => r.회계모형 === model && r.구분 === '이자부리');
    const products = orderedProducts([...new Set(modelRows.map(r => r.상품유형))]);

    products.forEach((p, i) => {
      const tr = document.createElement('tr');
      const firstCell = i === 0 ? `<td rowspan="${products.length + 1}">${model}</td>` : '';
      let cells = `${firstCell}<td class="sub-label">${p}</td>`;
      months.forEach(m => {
        const match = modelRows.find(r => r.상품유형 === p && r.마감년월 === m);
        const v = match ? (match.부담이자율 || 0) : 0;
        cells += rateCell(v);
      });
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });

    // 모형 합계 — rawData2_1
    const sumTr = document.createElement('tr');
    sumTr.className = 'subtotal';
    let sumCells = `<td class="sub-label">합계</td>`;
    months.forEach(m => {
      const match = d1.find(r => r.회계모형 === model && r.마감년월 === m);
      const v = match ? (match.부담이자율 || 0) : 0;
      sumCells += rateCell(v);
    });
    sumTr.innerHTML = sumCells;
    tbody.appendChild(sumTr);
  });

  // 총합 — rawData2_1 (회계모형='합계')
  const totalTr = document.createElement('tr');
  totalTr.className = 'subtotal';
  let totalCells = `<td colspan="2">총합</td>`;
  months.forEach(m => {
    const match = d1.find(r => r.회계모형 === '합계' && r.마감년월 === m);
    const v = match ? (match.부담이자율 || 0) : 0;
    totalCells += rateCell(v);
  });
  totalTr.innerHTML = totalCells;
  tbody.appendChild(totalTr);
}

/** 섹션 5 OCI — 구분='공시이율예실차' 상품유형 × 월 */
function renderOciSection(theadId, tbodyId, data, months) {
  const rows = data.filter(r => r.구분 === '공시이율예실차');
  const models = ['IDP', 'NP'];

  // 헤더 (회계모형 + 상품 + 월들)
  const thead = document.getElementById(theadId);
  thead.innerHTML =
    `<tr><th>회계모형</th><th>상품</th>` +
    months.map(m => `<th>${toMonthLabel(m)}</th>`).join('') + `</tr>`;

  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  const grandTotals = months.map(() => 0);

  models.forEach(model => {
    const modelRows = rows.filter(r => r.회계모형 === model);
    const products = orderedProducts([...new Set(modelRows.map(r => r.상품유형))]);
    products.forEach((p, i) => {
      const tr = document.createElement('tr');
      const firstCell = i === 0 ? `<td rowspan="${products.length + 1}">${model}</td>` : '';
      let cells = `${firstCell}<td class="sub-label">${p}</td>`;
      months.forEach((m, idx) => {
        const v = modelRows
          .filter(r => r.상품유형 === p && r.마감년월 === m)
          .reduce((s, r) => s + (r.보험금융비용 || 0), 0);
        grandTotals[idx] += v;
        cells += finCell(v);
      });
      tr.innerHTML = cells;
      tbody.appendChild(tr);
    });
    // 모형 소계
    const subTr = document.createElement('tr');
    subTr.className = 'subtotal';
    const modelTotals = months.map(m =>
      modelRows.filter(r => r.마감년월 === m).reduce((s, r) => s + (r.보험금융비용 || 0), 0)
    );
    subTr.innerHTML = `<td>${model} 소계</td>` + modelTotals.map(t => finCell(t)).join('');
    tbody.appendChild(subTr);
  });

  // 총합
  const totalTr = document.createElement('tr');
  totalTr.className = 'subtotal';
  totalTr.innerHTML = `<td colspan="2">총합</td>` + grandTotals.map(t => finCell(t)).join('');
  tbody.appendChild(totalTr);
}

/* ---------- 공통 헬퍼 ---------- */
function setFinHeader(theadId, firstColLabel, months) {
  const thead = document.getElementById(theadId);
  thead.innerHTML =
    `<tr><th>${firstColLabel || '상품'}</th>` +
    months.map(m => `<th>${toMonthLabel(m)}</th>`).join('') + `</tr>`;
}

function toMonthLabel(ym) {
  return `'${ym.slice(2, 4)}.${ym.slice(4)}`;
}

/** 기준 월(YYYYMM)을 끝으로 하는 최근 12개월 키 배열 */
function last12Months(anchorYm) {
  const out = [];
  let y = parseInt(anchorYm.slice(0, 4), 10);
  let m = parseInt(anchorYm.slice(4), 10);
  for (let i = 0; i < 12; i++) {
    out.unshift(`${y}${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return out;
}

function formatFinInt(v) {
  if (v === 0) return '';
  return Math.round(v).toLocaleString('ko-KR');
}

function formatRate(v) {
  if (!v) return '';
  return v.toFixed(2);
}

/** 금액 셀 — 음수면 neg 클래스 */
function finCell(v) {
  const cls = v < 0 ? ' class="neg"' : '';
  return `<td${cls}>${formatFinInt(v)}</td>`;
}

/** 비율 셀 — 음수면 neg 클래스 */
function rateCell(v) {
  const cls = v < 0 ? ' class="neg"' : '';
  return `<td${cls}>${formatRate(v)}</td>`;
}

/** 샘플대시보드2 이미지 기준 상품유형 명시 순서 */
const PRODUCT_ORDER = [
  '(무)확정연금',
  '(무)확정저축',
  '(무)확정사망',
  '(무)확정건강',
  '(무)확정퇴직보험',
  '(무)연동연금',
  '(무)연동저축',
  '(무)연동사망',
  '(무)연동퇴직보험',
  '(무)신개인연금',
  '(유)확정연금',
  '(유)확정저축',
  '(유)확정사망',
  '(유)확정건강',
  '(유)확정퇴직보험',
  '(유)연동연금',
  '(유)연동저축',
  '(유)연동사망',
  '(유)연동퇴직보험',
  '(유)신개인연금',
  '자산연계저축',
  '변액연금',
  '변액저축',
  '변액사망',
  '보증형IRP',
  '그외',
];

/** 상품유형 정렬 — 명시 순서 기준, 없는 항목은 뒤로. '그외'는 표에서 제외 */
function orderedProducts(list) {
  const idx = (name) => {
    const i = PRODUCT_ORDER.indexOf(name);
    return i === -1 ? PRODUCT_ORDER.length : i;
  };
  return list
    .filter(name => name !== '그외')
    .sort((a, b) => {
      const pa = idx(a), pb = idx(b);
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b, 'ko');
    });
}
