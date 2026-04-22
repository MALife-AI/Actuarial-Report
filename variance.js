/**
 * ===================================================================
 * Tab 3: 예실차 분석 (Variance Analysis)
 * 데이터: sample_data3 (rawData3)
 *
 * 섹션 1: 지급보험금 예실차 (단월) — 상품유형 × 코호트연도 × {예상/실제/차이}
 * 섹션 1-1: 지급보험금 예실차 (최근 12개월 추이) — 상품유형 × 월 (Variance)
 * 섹션 2: 사업비 예실차 (단월) — 상품유형 × {유지비/신계약비(PL)/신계약비(CSM)} × {예상/실제/차이}
 * 섹션 2-1: 사업비 예실차 (최근 12개월 추이) — 상품유형 × 월 (Variance)
 * ===================================================================
 */

const CLAIM_KEY = '보험금(PL)';
const EXPENSE_KEYS = ['유지비', '신계약비(PL)', '신계약비(CSM)'];
/** 섹션 3/3-1 기타 현금흐름: 표시 라벨 ↔ 데이터 구분값 매핑 */
const CASH_ITEMS = [
  { label: '수입보험료',      key: '보험료' },
  { label: '투자요소 보험금', key: '보험금(CSM)' },
  { label: '약관대출',        key: '약관대출' },
  { label: '기타지급금',      key: '계약자배당' },
];
const CASH_KEYS = CASH_ITEMS.map(i => i.key);

function renderVariance() {
  const d = window.rawData3 || [];
  if (d.length === 0) return;

  // 헤더 콤보박스 선택월 기준, 없으면 데이터 최신월
  const sel = document.getElementById('current-yearmonth');
  const allMonths = [...new Set(d.map(r => r.마감년월))].sort();
  const anchorYm = (sel && sel.value && allMonths.includes(sel.value))
    ? sel.value
    : allMonths[allMonths.length - 1];
  const latestData = d.filter(r => r.마감년월 === anchorYm);

  // 당월 표 제목에 마감년월 표시
  const curYm = `${anchorYm.slice(0, 4)}.${anchorYm.slice(4)}`;
  ['var-claim-tag', 'var-expense-tag', 'var-cash-tag'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = curYm;
  });

  // 과거 12개월(선택월 포함) — 실제 데이터에 존재하는 월로 제한
  const recent12 = (typeof last12Months === 'function'
    ? last12Months(anchorYm)
    : allMonths.slice(-12)
  ).filter(m => allMonths.includes(m));

  renderClaimVariance(latestData);
  renderClaimTrend(d, recent12);
  renderExpenseVariance(latestData);
  renderExpenseTrend(d, recent12);
  renderCashVariance(latestData);
  renderCashTrend(d, recent12);
}

/* ================================================================
 * 섹션 1: 지급보험금 예실차 (당월 - 코호트 연도별)
 *   - 구분='보험금(PL)' 데이터
 *   - 코호트 매핑:
 *       999991 → ~2018,  201992 → 2019,  202092 → 2020,
 *       202192 → 2021,   202201 → 2022,  202301 → 2023,
 *       202401 → 2024,   202501 → 2025
 * ================================================================ */
const CLAIM_COHORT_COLS = ['~2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
const CLAIM_COHORT_MAP = {
  '999991': '~2018',
  '201992': '2019',
  '202092': '2020',
  '202192': '2021',
  '202201': '2022',
  '202301': '2023',
  '202401': '2024',
  '202501': '2025',
};

function cohortColumnOf(cohort) {
  return CLAIM_COHORT_MAP[String(cohort)] || null;
}

function renderClaimVariance(latestData) {
  const claim = latestData.filter(r => r.구분 === CLAIM_KEY);
  const products = orderedVarProducts([...new Set(claim.map(r => r.상품유형))]);

  // 헤더 — 코호트 연도 + Total(Expected/Actual/Variance)
  const thead = document.getElementById('var-claim-thead');
  thead.innerHTML =
    `<tr><th rowspan="2">상품유형</th>` +
    CLAIM_COHORT_COLS.map(y => `<th rowspan="2">${y}</th>`).join('') +
    `<th colspan="3">Total</th></tr>` +
    `<tr><th>Expected</th><th>Actual</th><th>Variance</th></tr>`;

  const tbody = document.getElementById('var-claim-tbody');
  tbody.innerHTML = '';

  const yearTotals = CLAIM_COHORT_COLS.map(() => 0);
  let grandExp = 0, grandAct = 0;

  products.forEach(p => {
    const tr = document.createElement('tr');
    let cells = `<td>${p}</td>`;
    CLAIM_COHORT_COLS.forEach((col, i) => {
      const rows = claim.filter(r => r.상품유형 === p && cohortColumnOf(r.코호트) === col);
      const diff = sumBy(rows, '예상') - sumBy(rows, '실제');
      yearTotals[i] += diff;
      cells += `<td class="${varClass(diff)}">${formatVarInt(diff)}</td>`;
    });
    // Total 컬럼 — 해당 상품 당월 전체(코호트 무관)
    const pRows = claim.filter(r => r.상품유형 === p);
    const exp = sumBy(pRows, '예상');
    const act = sumBy(pRows, '실제');
    const variance = exp - act;
    grandExp += exp;
    grandAct += act;
    cells += `<td>${formatVarInt(exp)}</td><td>${formatVarInt(act)}</td><td class="${varClass(variance)}">${formatVarInt(variance)}</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });

  // 합계
  const sumTr = document.createElement('tr');
  sumTr.className = 'subtotal';
  const grandVar = grandExp - grandAct;
  sumTr.innerHTML = `<td>합계</td>` +
    yearTotals.map(t => `<td class="${varClass(t)}">${formatVarInt(t)}</td>`).join('') +
    `<td>${formatVarInt(grandExp)}</td><td>${formatVarInt(grandAct)}</td><td class="${varClass(grandVar)}">${formatVarInt(grandVar)}</td>`;
  tbody.appendChild(sumTr);
}

/* ================================================================
 * 섹션 1-1: 지급보험금 예실차 (최근 12개월 추이)
 *   - 상품군 × {예/실/차} × 월 구조 (샘플대시보드3)
 *   - 예 = 예실구분='예상' 금액, 실 = 예실구분='실제' 금액, 차 = 예 - 실
 * ================================================================ */
const CLAIM_GROUP_ORDER = ['사망', '건강', '연금', '저축', '변액연금', '변액저축', '변액사망', '보증형IRP'];
const CLAIM_GROUP_SUFFIX = ['사망', '건강', '연금', '저축']; // '~보험금' 접미사를 붙이는 상품군

function claimGroupLabel(group, kind) {
  const base = CLAIM_GROUP_SUFFIX.includes(group) ? `${group}보험금` : group;
  return `${base}(${kind})`;
}

function renderClaimTrend(allData, months) {
  const claim = allData.filter(r => r.구분 === CLAIM_KEY && months.includes(r.마감년월));
  const groupsAll = [...new Set(claim.map(r => r.상품군).filter(Boolean))];
  const groups = groupsAll.sort((a, b) => {
    const ia = CLAIM_GROUP_ORDER.indexOf(a);
    const ib = CLAIM_GROUP_ORDER.indexOf(b);
    const pa = ia === -1 ? CLAIM_GROUP_ORDER.length : ia;
    const pb = ib === -1 ? CLAIM_GROUP_ORDER.length : ib;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b, 'ko');
  });

  const thead = document.getElementById('var-claim-trend-thead');
  thead.innerHTML =
    `<tr><th>구분</th>` +
    months.map(m => `<th>${toVarMonthLabel(m)}</th>`).join('') + `</tr>`;

  const tbody = document.getElementById('var-claim-trend-tbody');
  tbody.innerHTML = '';

  const diffTotals = months.map(() => 0);

  groups.forEach(g => {
    const groupRows = claim.filter(r => r.상품군 === g);
    const monthExp = months.map(m => sumBy(groupRows.filter(r => r.마감년월 === m), '예상'));
    const monthAct = months.map(m => sumBy(groupRows.filter(r => r.마감년월 === m), '실제'));

    // (예)
    const trExp = document.createElement('tr');
    trExp.innerHTML = `<td class="sub-label">${claimGroupLabel(g, '예')}</td>` +
      monthExp.map(v => `<td>${formatVarInt(v)}</td>`).join('');
    tbody.appendChild(trExp);

    // (실)
    const trAct = document.createElement('tr');
    trAct.innerHTML = `<td class="sub-label">${claimGroupLabel(g, '실')}</td>` +
      monthAct.map(v => `<td>${formatVarInt(v)}</td>`).join('');
    tbody.appendChild(trAct);

    // (차) = 예 - 실
    const trDiff = document.createElement('tr');
    let diffCells = `<td class="sub-label">${claimGroupLabel(g, '차')}</td>`;
    monthExp.forEach((e, i) => {
      const d = e - monthAct[i];
      diffTotals[i] += d;
      diffCells += `<td class="${varClass(d)}">${formatVarInt(d)}</td>`;
    });
    trDiff.innerHTML = diffCells;
    tbody.appendChild(trDiff);
  });

  // 합계(차 합계)
  const sumTr = document.createElement('tr');
  sumTr.className = 'subtotal';
  sumTr.innerHTML = `<td>합계</td>` +
    diffTotals.map(t => `<td class="${varClass(t)}">${formatVarInt(t)}</td>`).join('');
  tbody.appendChild(sumTr);
}

/* ================================================================
 * 섹션 2: 사업비 예실차 (단월)
 * ================================================================ */
function renderExpenseVariance(latestData) {
  const expense = latestData.filter(r => EXPENSE_KEYS.includes(r.구분));
  const products = orderedVarProducts([...new Set(expense.map(r => r.상품유형))]);

  const thead = document.getElementById('var-expense-thead');
  thead.innerHTML =
    `<tr><th rowspan="2">상품유형</th>` +
    EXPENSE_KEYS.map(k => `<th colspan="3">${k}</th>`).join('') +
    `<th colspan="3">Total</th></tr>` +
    `<tr>${EXPENSE_KEYS.concat(['(Total)']).map(() => `<th>Expected</th><th>Actual</th><th>Variance</th>`).join('')}</tr>`;

  const tbody = document.getElementById('var-expense-tbody');
  tbody.innerHTML = '';

  // 구분별 누적 (합계 행 계산용)
  const sumExp = EXPENSE_KEYS.map(() => 0);
  const sumAct = EXPENSE_KEYS.map(() => 0);

  products.forEach(p => {
    const tr = document.createElement('tr');
    let cells = `<td>${p}</td>`;
    let totExp = 0, totAct = 0;
    EXPENSE_KEYS.forEach((k, ki) => {
      const rows = expense.filter(r => r.상품유형 === p && r.구분 === k);
      const exp = sumBy(rows, '예상');
      const act = sumBy(rows, '실제');
      const diff = exp - act;
      totExp += exp;
      totAct += act;
      sumExp[ki] += exp;
      sumAct[ki] += act;
      cells += `<td>${formatVarInt(exp)}</td><td>${formatVarInt(act)}</td><td class="${varClass(diff)}">${formatVarInt(diff)}</td>`;
    });
    const totDiff = totExp - totAct;
    cells += `<td>${formatVarInt(totExp)}</td><td>${formatVarInt(totAct)}</td><td class="${varClass(totDiff)}">${formatVarInt(totDiff)}</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });

  // 합계 — 전 상품유형 합
  const sumTr = document.createElement('tr');
  sumTr.className = 'subtotal';
  let sumCells = `<td>합계</td>`;
  let grandExp = 0, grandAct = 0;
  EXPENSE_KEYS.forEach((k, ki) => {
    const d = sumExp[ki] - sumAct[ki];
    grandExp += sumExp[ki];
    grandAct += sumAct[ki];
    sumCells += `<td>${formatVarInt(sumExp[ki])}</td><td>${formatVarInt(sumAct[ki])}</td><td class="${varClass(d)}">${formatVarInt(d)}</td>`;
  });
  const grandVar = grandExp - grandAct;
  sumCells += `<td>${formatVarInt(grandExp)}</td><td>${formatVarInt(grandAct)}</td><td class="${varClass(grandVar)}">${formatVarInt(grandVar)}</td>`;
  sumTr.innerHTML = sumCells;
  tbody.appendChild(sumTr);
}

/* ================================================================
 * 섹션 2-1: 사업비 예실차 (최근 12개월 추이)
 *   - 구분(유지비/신계약비(PL)/신계약비(CSM)) × {예/실/차} × 월 (샘플대시보드3)
 *   - 예 = 예실구분='예상' 금액, 실 = 예실구분='실제' 금액, 차 = 예 - 실
 * ================================================================ */
function renderExpenseTrend(allData, months) {
  const expense = allData.filter(r => EXPENSE_KEYS.includes(r.구분) && months.includes(r.마감년월));

  const thead = document.getElementById('var-expense-trend-thead');
  thead.innerHTML =
    `<tr><th>구분</th>` +
    months.map(m => `<th>${toVarMonthLabel(m)}</th>`).join('') + `</tr>`;

  const tbody = document.getElementById('var-expense-trend-tbody');
  tbody.innerHTML = '';

  const diffTotals = months.map(() => 0);

  EXPENSE_KEYS.forEach(k => {
    const rowsK = expense.filter(r => r.구분 === k);
    const monthExp = months.map(m => sumBy(rowsK.filter(r => r.마감년월 === m), '예상'));
    const monthAct = months.map(m => sumBy(rowsK.filter(r => r.마감년월 === m), '실제'));

    // (예)
    const trExp = document.createElement('tr');
    trExp.innerHTML = `<td class="sub-label">${k}(예)</td>` +
      monthExp.map(v => `<td>${formatVarInt(v)}</td>`).join('');
    tbody.appendChild(trExp);

    // (실)
    const trAct = document.createElement('tr');
    trAct.innerHTML = `<td class="sub-label">${k}(실)</td>` +
      monthAct.map(v => `<td>${formatVarInt(v)}</td>`).join('');
    tbody.appendChild(trAct);

    // (차) = 예 - 실
    const trDiff = document.createElement('tr');
    let diffCells = `<td class="sub-label">${k}(차)</td>`;
    monthExp.forEach((e, i) => {
      const d = e - monthAct[i];
      diffTotals[i] += d;
      diffCells += `<td class="${varClass(d)}">${formatVarInt(d)}</td>`;
    });
    trDiff.innerHTML = diffCells;
    tbody.appendChild(trDiff);
  });

  // 합계 — 각 구분의 차(예-실) 합
  const sumTr = document.createElement('tr');
  sumTr.className = 'subtotal';
  sumTr.innerHTML = `<td>합계</td>` +
    diffTotals.map(t => `<td class="${varClass(t)}">${formatVarInt(t)}</td>`).join('');
  tbody.appendChild(sumTr);
}

/* ================================================================
 * 섹션 3: 기타 현금흐름 예실차 (당월)
 *   - 구분: 수입보험료 / 투자요소 보험금 / 약관대출 / 기타지급금
 *   - 각 구분마다 Expected / Actual / Variance(=예-실) 3컬럼
 *   - Total = 4개 구분 합
 * ================================================================ */
function renderCashVariance(latestData) {
  const cash = latestData.filter(r => CASH_KEYS.includes(r.구분));
  const products = orderedVarProducts([...new Set(cash.map(r => r.상품유형))]);

  const thead = document.getElementById('var-cash-thead');
  thead.innerHTML =
    `<tr><th rowspan="2">상품유형</th>` +
    CASH_ITEMS.map(i => `<th colspan="3">${i.label}</th>`).join('') +
    `<th colspan="3">Total</th></tr>` +
    `<tr>${CASH_ITEMS.concat([{ label: '(Total)' }]).map(() => `<th>Expected</th><th>Actual</th><th>Variance</th>`).join('')}</tr>`;

  const tbody = document.getElementById('var-cash-tbody');
  tbody.innerHTML = '';

  const sumExp = CASH_ITEMS.map(() => 0);
  const sumAct = CASH_ITEMS.map(() => 0);

  products.forEach(p => {
    const tr = document.createElement('tr');
    let cells = `<td>${p}</td>`;
    let totExp = 0, totAct = 0;
    CASH_ITEMS.forEach((item, ki) => {
      const rows = cash.filter(r => r.상품유형 === p && r.구분 === item.key);
      const exp = sumBy(rows, '예상');
      const act = sumBy(rows, '실제');
      const diff = exp - act;
      totExp += exp;
      totAct += act;
      sumExp[ki] += exp;
      sumAct[ki] += act;
      cells += `<td>${formatVarInt(exp)}</td><td>${formatVarInt(act)}</td><td class="${varClass(diff)}">${formatVarInt(diff)}</td>`;
    });
    const totDiff = totExp - totAct;
    cells += `<td>${formatVarInt(totExp)}</td><td>${formatVarInt(totAct)}</td><td class="${varClass(totDiff)}">${formatVarInt(totDiff)}</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });

  // 합계
  const sumTr = document.createElement('tr');
  sumTr.className = 'subtotal';
  let sumCells = `<td>합계</td>`;
  let grandExp = 0, grandAct = 0;
  CASH_ITEMS.forEach((item, ki) => {
    const d = sumExp[ki] - sumAct[ki];
    grandExp += sumExp[ki];
    grandAct += sumAct[ki];
    sumCells += `<td>${formatVarInt(sumExp[ki])}</td><td>${formatVarInt(sumAct[ki])}</td><td class="${varClass(d)}">${formatVarInt(d)}</td>`;
  });
  const grandVar = grandExp - grandAct;
  sumCells += `<td>${formatVarInt(grandExp)}</td><td>${formatVarInt(grandAct)}</td><td class="${varClass(grandVar)}">${formatVarInt(grandVar)}</td>`;
  sumTr.innerHTML = sumCells;
  tbody.appendChild(sumTr);
}

/* ================================================================
 * 섹션 3-1: 기타 현금흐름 예실차 (최근 12개월 추이)
 *   - 구분(수입보험료/투자요소 보험금/약관대출/기타지급금) × {예/실/차} × 월
 *   - 예 = 예실구분='예상' 합, 실 = '실제' 합, 차 = 예 - 실
 *   - 합계 = 차 월별 합
 * ================================================================ */
function renderCashTrend(allData, months) {
  const cash = allData.filter(r => CASH_KEYS.includes(r.구분) && months.includes(r.마감년월));

  const thead = document.getElementById('var-cash-trend-thead');
  thead.innerHTML =
    `<tr><th>구분</th>` +
    months.map(m => `<th>${toVarMonthLabel(m)}</th>`).join('') + `</tr>`;

  const tbody = document.getElementById('var-cash-trend-tbody');
  tbody.innerHTML = '';

  const diffTotals = months.map(() => 0);

  CASH_ITEMS.forEach(item => {
    const rowsK = cash.filter(r => r.구분 === item.key);
    const monthExp = months.map(m => sumBy(rowsK.filter(r => r.마감년월 === m), '예상'));
    const monthAct = months.map(m => sumBy(rowsK.filter(r => r.마감년월 === m), '실제'));

    const trExp = document.createElement('tr');
    trExp.innerHTML = `<td class="sub-label">${item.label}(예)</td>` +
      monthExp.map(v => `<td>${formatVarInt(v)}</td>`).join('');
    tbody.appendChild(trExp);

    const trAct = document.createElement('tr');
    trAct.innerHTML = `<td class="sub-label">${item.label}(실)</td>` +
      monthAct.map(v => `<td>${formatVarInt(v)}</td>`).join('');
    tbody.appendChild(trAct);

    const trDiff = document.createElement('tr');
    let diffCells = `<td class="sub-label">${item.label}(차)</td>`;
    monthExp.forEach((e, i) => {
      const d = e - monthAct[i];
      diffTotals[i] += d;
      diffCells += `<td class="${varClass(d)}">${formatVarInt(d)}</td>`;
    });
    trDiff.innerHTML = diffCells;
    tbody.appendChild(trDiff);
  });

  const sumTr = document.createElement('tr');
  sumTr.className = 'subtotal';
  sumTr.innerHTML = `<td>합계</td>` +
    diffTotals.map(t => `<td class="${varClass(t)}">${formatVarInt(t)}</td>`).join('');
  tbody.appendChild(sumTr);
}

/* ================================================================
 * 헬퍼
 * ================================================================ */
function sumBy(rows, yeSilGubun) {
  return rows
    .filter(r => r.예실구분 === yeSilGubun)
    .reduce((s, r) => s + (r.금액 || 0), 0);
}

/** 코호트 연도 그룹 정의 (이미지: ~2018 / 2019 / 2020 / 2021 / 2022 / 2023 / 2024 / 2025) */
function cohortYearGroups(rows) {
  const cohorts = [...new Set(rows.map(r => String(r.코호트)))];
  const baseYears = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];

  const groups = [
    { label: '~2018', matches: c => {
      const y = String(c).slice(0, 4);
      return (y === '9999' || (parseInt(y, 10) <= 2018));
    }},
  ];
  baseYears.forEach(y => {
    groups.push({
      label: y,
      matches: c => String(c).slice(0, 4) === y,
    });
  });
  return groups;
}

function varClass(diff) {
  if (diff > 0) return 'variance-pos';
  if (diff < 0) return 'variance-neg';
  return '';
}

function formatVarInt(v) {
  if (v === 0) return '';
  return Math.round(v).toLocaleString('ko-KR');
}

function toVarMonthLabel(ym) {
  return `${ym.slice(2, 4)}.${ym.slice(4)}`;
}

/** 예실차 탭 전용 상품유형 순서 (dashbord_sample/예실차 상품유형 순서.PNG 기준) */
const VAR_PRODUCT_ORDER = [
  '(유)확정사망',
  '(유)확정건강',
  '(유)확정저축',
  '(유)연동연금',
  '(유)연동저축',
  '(유)연동사망',
  '(유)확정연금',
  '(무)확정건강',
  '(무)확정사망',
  '자산연계저축',
  '(무)신개인연금',
  '(유)신개인연금',
  '(무)연동퇴직보험',
  '(유)확정퇴직보험',
  '변액사망',
  '변액연금',
  '변액저축',
  '보증형IRP',
];

function orderedVarProducts(list) {
  const idx = (name) => {
    const i = VAR_PRODUCT_ORDER.indexOf(name);
    return i === -1 ? VAR_PRODUCT_ORDER.length : i;
  };
  return list
    .filter(name => name !== '그외')
    .sort((a, b) => {
      const pa = idx(a), pb = idx(b);
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b, 'ko');
    });
}
