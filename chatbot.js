/**
 * ===================================================================
 * Data Analysis Chatbot - chatbot.js
 * 대시보드 데이터를 자연어로 분석하는 챗봇
 * ===================================================================
 */

/* ---------- 챗봇 상태 ---------- */
let chatOpen = false;
let chatHistory = [];

/* ---------- 초기화 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  buildChatUI();
  bindChatEvents();
});

/* ================================================================
 * 1. UI 구성
 * ================================================================ */
function buildChatUI() {
  // 플로팅 버튼
  const fab = document.createElement('button');
  fab.id = 'chat-fab';
  fab.innerHTML = '&#128172;';
  fab.title = '데이터 분석 챗봇';
  document.body.appendChild(fab);

  // 챗봇 패널
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.classList.add('chat-hidden');
  panel.innerHTML = `
    <div class="chat-header">
      <span class="chat-header-title">Data Analyst</span>
      <button id="chat-close">&times;</button>
    </div>
    <div id="chat-messages" class="chat-messages"></div>
    <div class="chat-input-row">
      <input type="text" id="chat-input" placeholder="데이터에 대해 질문하세요..." autocomplete="off" />
      <button id="chat-send">&#10148;</button>
    </div>
  `;
  document.body.appendChild(panel);
}

function bindChatEvents() {
  document.getElementById('chat-fab').addEventListener('click', toggleChat);
  document.getElementById('chat-close').addEventListener('click', toggleChat);
  document.getElementById('chat-send').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });
}

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById('chat-panel');
  const fab = document.getElementById('chat-fab');

  if (chatOpen) {
    panel.classList.remove('chat-hidden');
    fab.classList.add('chat-fab-active');
    // 첫 진입 시 인사
    if (chatHistory.length === 0) {
      appendBot(
        '안녕하세요! 대시보드 데이터를 분석해 드립니다.\n\n' +
        '아래와 같은 질문을 해보세요:\n' +
        '- "보험수익 합계 알려줘"\n' +
        '- "VFA 모형 분석해줘"\n' +
        '- "상반기 하반기 비교"\n' +
        '- "월별 추이 알려줘"\n' +
        '- "가장 큰 항목은?"\n' +
        '- "전체 요약해줘"'
      );
    }
    document.getElementById('chat-input').focus();
  } else {
    panel.classList.add('chat-hidden');
    fab.classList.remove('chat-fab-active');
  }
}

/* ================================================================
 * 2. 메시지 송수신
 * ================================================================ */
function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  appendUser(text);
  input.value = '';

  // 데이터 로드 여부 확인
  if (typeof rawData === 'undefined' || rawData.length === 0) {
    appendBot('데이터가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  const answer = analyzeQuestion(text);
  appendBot(answer);
}

function appendUser(text) {
  chatHistory.push({ role: 'user', text });
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg chat-user';
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendBot(text) {
  chatHistory.push({ role: 'bot', text });
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg chat-bot';
  div.innerHTML = text.replace(/\n/g, '<br>');
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/* ================================================================
 * 3. 질문 분석 엔진
 * ================================================================ */
function analyzeQuestion(q) {
  const data = filteredData && filteredData.length > 0 ? filteredData : rawData;
  const query = q.toLowerCase();

  // --- 전체 요약 ---
  if (match(query, ['요약', '전체', '개요', '현황', '총정리', '대시보드'])) {
    return buildSummary(data);
  }

  // --- 특정 회계모형 분석 ---
  const models = ['VFA', 'IDP', 'NP', 'NA'];
  const foundModel = models.find(m => query.toUpperCase().includes(m));
  if (foundModel && match(query, ['분석', '모형', '모델', '알려', '보여', '얼마', '합계', '금액'])) {
    return buildModelAnalysis(data, foundModel);
  }

  // --- 특정 구분 분석 ---
  const cats = ['보험수익', '보험서비스비용', '간접사업비', '그외'];
  const foundCat = cats.find(c => query.includes(c));
  if (foundCat) {
    return buildCatAnalysis(data, foundCat);
  }

  // --- 상반기/하반기 비교 ---
  if (match(query, ['상반기', '하반기', '반기'])) {
    return buildHalfYearComparison(data);
  }

  // --- 월별 추이 ---
  if (match(query, ['월별', '추이', '월간', '트렌드', '변화'])) {
    return buildMonthlyTrend(data);
  }

  // --- 최대/최소 항목 ---
  if (match(query, ['가장 큰', '최대', '최고', '높은', '1위', '탑'])) {
    return buildTopItems(data, 'max');
  }
  if (match(query, ['가장 작', '최소', '최저', '낮은', '적은'])) {
    return buildTopItems(data, 'min');
  }

  // --- 구분2 분석 ---
  const cat2List = [...new Set(rawData.map(d => d.구분2))];
  const foundCat2 = cat2List.find(c => query.includes(c));
  if (foundCat2) {
    return buildCat2Analysis(data, foundCat2);
  }

  // --- 비교 ---
  if (match(query, ['비교', '차이', '대비', '격차'])) {
    return buildComparison(data);
  }

  // --- 건수/갯수 ---
  if (match(query, ['건수', '갯수', '개수', '몇 건', '몇개'])) {
    return `현재 필터 기준 총 <b>${data.length}</b>건의 데이터가 있습니다.`;
  }

  // --- 도움말 ---
  if (match(query, ['도움', '도와', '뭐', '어떤', '할 수', '기능', '사용법'])) {
    return '아래와 같은 질문을 해보세요:\n' +
      '- "전체 요약해줘"\n' +
      '- "보험수익 합계"\n' +
      '- "VFA 모형 분석"\n' +
      '- "상반기 하반기 비교"\n' +
      '- "월별 추이"\n' +
      '- "가장 큰 항목"\n' +
      '- "CSM상각 분석"\n' +
      '- "구분별 비교"';
  }

  // --- 폴백 ---
  return '질문을 이해하지 못했습니다.\n' +
    '"전체 요약", "보험수익 합계", "VFA 분석", "월별 추이" 등으로 질문해보세요.';
}

/* ================================================================
 * 4. 분석 함수들
 * ================================================================ */

/** 전체 요약 */
function buildSummary(data) {
  const total = sum(data);
  const revenue = sum(data.filter(d => d.구분 === '보험수익'));
  const cost = sum(data.filter(d => d.구분 === '보험서비스비용'));
  const overhead = sum(data.filter(d => d.구분 === '간접사업비'));
  const etc = sum(data.filter(d => d.구분 === '그외'));

  const models = groupSum(data, '회계모형');
  const modelStr = Object.entries(models)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${fmt(v)}`)
    .join('\n');

  return `<b>전체 데이터 요약</b> (${data.length}건)\n\n` +
    `총 금액: <b>${fmt(total)}</b>\n` +
    `보험수익: <b style="color:#27ae60">${fmt(revenue)}</b>\n` +
    `보험서비스비용: <b style="color:#e74c3c">${fmt(cost)}</b>\n` +
    `간접사업비: <b style="color:#f5a623">${fmt(overhead)}</b>\n` +
    `그외: <b style="color:#3498db">${fmt(etc)}</b>\n\n` +
    `<b>회계모형별:</b>\n${modelStr}`;
}

/** 회계모형 분석 */
function buildModelAnalysis(data, model) {
  const subset = data.filter(d => d.회계모형 === model);
  if (subset.length === 0) return `${model} 모형에 해당하는 데이터가 없습니다.`;

  const total = sum(subset);
  const byCat = groupSum(subset, '구분');
  const catStr = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${fmt(v)}`)
    .join('\n');

  const byCat2 = groupSum(subset, '구분2');
  const cat2Str = Object.entries(byCat2)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5)
    .map(([k, v]) => `  ${k}: ${fmt(v)}`)
    .join('\n');

  return `<b>${model} 모형 분석</b> (${subset.length}건)\n\n` +
    `합계: <b>${fmt(total)}</b>\n\n` +
    `<b>구분별:</b>\n${catStr}\n\n` +
    `<b>구분2별 Top 5:</b>\n${cat2Str}`;
}

/** 구분 분석 */
function buildCatAnalysis(data, cat) {
  const subset = data.filter(d => d.구분 === cat);
  if (subset.length === 0) return `${cat}에 해당하는 데이터가 없습니다.`;

  const total = sum(subset);
  const byModel = groupSum(subset, '회계모형');
  const modelStr = Object.entries(byModel)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${fmt(v)} (${pct(v, total)})`)
    .join('\n');

  const byCat2 = groupSum(subset, '구분2');
  const cat2Str = Object.entries(byCat2)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k, v]) => `  ${k}: ${fmt(v)}`)
    .join('\n');

  return `<b>${cat} 분석</b> (${subset.length}건)\n\n` +
    `합계: <b>${fmt(total)}</b>\n\n` +
    `<b>회계모형별:</b>\n${modelStr}\n\n` +
    `<b>세부 구분(구분2)별:</b>\n${cat2Str}`;
}

/** 상반기/하반기 비교 */
function buildHalfYearComparison(data) {
  const h1 = data.filter(d => parseInt(d.마감년월.slice(4), 10) <= 6);
  const h2 = data.filter(d => parseInt(d.마감년월.slice(4), 10) > 6);

  const h1Total = sum(h1);
  const h2Total = sum(h2);
  const diff = h2Total - h1Total;
  const diffPct = h1Total !== 0 ? ((diff / Math.abs(h1Total)) * 100).toFixed(1) : '-';

  const cats = ['보험수익', '보험서비스비용', '간접사업비', '그외'];
  const catRows = cats.map(c => {
    const v1 = sum(h1.filter(d => d.구분 === c));
    const v2 = sum(h2.filter(d => d.구분 === c));
    return `  ${c}: ${fmt(v1)} → ${fmt(v2)}`;
  }).join('\n');

  return `<b>상반기 vs 하반기 비교</b>\n\n` +
    `상반기: <b>${fmt(h1Total)}</b> (${h1.length}건)\n` +
    `하반기: <b>${fmt(h2Total)}</b> (${h2.length}건)\n` +
    `차이: <b>${fmt(diff)}</b> (${diffPct}%)\n\n` +
    `<b>구분별 변화:</b>\n${catRows}`;
}

/** 월별 추이 */
function buildMonthlyTrend(data) {
  const monthly = {};
  data.forEach(d => {
    const m = parseInt(d.마감년월.slice(4), 10);
    monthly[m] = (monthly[m] || 0) + d.금액;
  });

  const months = Object.keys(monthly).sort((a, b) => a - b);
  const values = months.map(m => monthly[m]);
  const maxMonth = months[values.indexOf(Math.max(...values))];
  const minMonth = months[values.indexOf(Math.min(...values))];

  const trendStr = months
    .map(m => `  ${m}월: ${fmt(monthly[m])}`)
    .join('\n');

  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  return `<b>월별 금액 추이</b>\n\n${trendStr}\n\n` +
    `월평균: <b>${fmt(avg)}</b>\n` +
    `최고: <b>${maxMonth}월</b> (${fmt(monthly[maxMonth])})\n` +
    `최저: <b>${minMonth}월</b> (${fmt(monthly[minMonth])})`;
}

/** Top/Bottom 항목 */
function buildTopItems(data, mode) {
  // 구분+구분2 조합별 합계
  const groups = {};
  data.forEach(d => {
    const key = `${d.구분} > ${d.구분2}`;
    groups[key] = (groups[key] || 0) + d.금액;
  });

  const sorted = Object.entries(groups)
    .sort((a, b) => mode === 'max' ? b[1] - a[1] : a[1] - b[1]);

  const top5 = sorted.slice(0, 5)
    .map(([k, v], i) => `  ${i + 1}. ${k}: ${fmt(v)}`)
    .join('\n');

  const label = mode === 'max' ? '금액이 큰' : '금액이 작은';
  return `<b>${label} 항목 Top 5</b>\n\n${top5}`;
}

/** 구분2 분석 */
function buildCat2Analysis(data, cat2) {
  const subset = data.filter(d => d.구분2 === cat2);
  if (subset.length === 0) return `"${cat2}"에 해당하는 데이터가 없습니다.`;

  const total = sum(subset);
  const byModel = groupSum(subset, '회계모형');
  const modelStr = Object.entries(byModel)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${fmt(v)}`)
    .join('\n');

  const byCat = groupSum(subset, '구분');
  const catStr = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${fmt(v)}`)
    .join('\n');

  return `<b>"${cat2}" 분석</b> (${subset.length}건)\n\n` +
    `합계: <b>${fmt(total)}</b>\n\n` +
    `<b>구분별:</b>\n${catStr}\n\n` +
    `<b>회계모형별:</b>\n${modelStr}`;
}

/** 구분별 비교 */
function buildComparison(data) {
  const byCat = groupSum(data, '구분');
  const total = sum(data);

  const rows = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${fmt(v)} (${pct(v, total)})`)
    .join('\n');

  return `<b>구분별 비교</b>\n\n${rows}\n\n합계: <b>${fmt(total)}</b>`;
}

/* ================================================================
 * 5. 유틸리티
 * ================================================================ */
function match(query, keywords) {
  return keywords.some(kw => query.includes(kw));
}

function sum(arr) {
  return arr.reduce((s, d) => s + d.금액, 0);
}

function groupSum(arr, key) {
  const result = {};
  arr.forEach(d => {
    result[d[key]] = (result[d[key]] || 0) + d.금액;
  });
  return result;
}

function fmt(n) {
  return n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(value, total) {
  if (total === 0) return '0%';
  return ((value / total) * 100).toFixed(1) + '%';
}
