/**
 * ===================================================================
 * Data Analysis Chatbot - chatbot.js
 * MALife-AI/claude-wrapper 기반 (POST /api/claude/stream)
 * 모든 질문을 로컬 Claude Code 래퍼로 전송하고 스트리밍 응답 렌더
 * ===================================================================
 */

/* ---------- 래퍼 엔드포인트 ----------
 * 기본값: 빈 문자열 → 같은 오리진의 상대경로 사용
 * (claude-wrapper/public/ 에 대시보드를 넣어 함께 :3000 서빙 시 CORS 불필요)
 * 필요 시 window.CLAUDE_WRAPPER_URL = 'http://localhost:XXXX' 로 오버라이드
 */
const CLAUDE_WRAPPER_URL =
  (typeof window !== 'undefined' && window.CLAUDE_WRAPPER_URL) || '';
const CLAUDE_STREAM_ENDPOINT = `${CLAUDE_WRAPPER_URL}/api/claude/stream`;

/* ---------- 챗봇 상태 ---------- */
let chatOpen = false;
let chatHistory = [];
let currentAbortController = null;

/* ---------- 초기화 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  buildChatUI();
  bindChatEvents();
  enableChatDrag();
});

/* ================================================================
 * 1. UI 구성
 * ================================================================ */
function buildChatUI() {
  const fab = document.createElement('button');
  fab.id = 'chat-fab';
  fab.innerHTML = '&#128172;';
  fab.title = '데이터 분석 챗봇 (Claude)';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.classList.add('chat-hidden');
  panel.innerHTML = `
    <div class="chat-header">
      <span class="chat-header-title">Data Analyst · Claude</span>
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
    if (chatHistory.length === 0) {
      appendBot(
        '안녕하세요! 이 챗봇은 <b>Claude</b>에 연결되어 있습니다.\n' +
        '보험손익 데이터를 자연어로 분석해 드립니다.\n\n' +
        '예시 질문:\n' +
        '- "당월 VFA 보험수익 얼마?"\n' +
        '- "보험수익 월별 추이"\n' +
        '- "CSM상각 구분2 회계모형별 비교"\n' +
        '- "전월 대비 증감 큰 항목 Top 3"\n\n' +
        `<span style="color:#888;font-size:12px">🔗 래퍼 엔드포인트: ${CLAUDE_STREAM_ENDPOINT}</span>`
      );
    }
    document.getElementById('chat-input').focus();
  } else {
    panel.classList.add('chat-hidden');
    fab.classList.remove('chat-fab-active');
  }
}

/** 챗 패널을 헤더로 드래그해서 자유롭게 이동 */
function enableChatDrag() {
  const panel = document.getElementById('chat-panel');
  const header = panel.querySelector('.chat-header');
  if (!panel || !header) return;

  header.classList.add('chat-header-draggable');

  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#chat-close')) return;
    if (e.button !== 0) return;

    dragging = true;
    const rect = panel.getBoundingClientRect();
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    header.setPointerCapture(e.pointerId);
    header.classList.add('chat-header-dragging');
    e.preventDefault();
  });

  header.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;
    panel.style.left = Math.max(0, Math.min(maxLeft, startLeft + dx)) + 'px';
    panel.style.top = Math.max(0, Math.min(maxTop, startTop + dy)) + 'px';
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { header.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    header.classList.remove('chat-header-dragging');
  };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);
}

/* ================================================================
 * 2. 메시지 송수신 (Claude 래퍼 스트리밍)
 * ================================================================ */
async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  // 이전 요청 있으면 취소
  if (currentAbortController) {
    try { currentAbortController.abort(); } catch (_) { /* ignore */ }
  }
  currentAbortController = new AbortController();

  appendUser(text);
  input.value = '';

  if (typeof rawData === 'undefined' || rawData.length === 0) {
    appendBot('⚠ 데이터가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  const bubble = createStreamingBubble();
  const prompt = buildPrompt(text);

  try {
    await streamFromWrapper(
      prompt,
      (chunk) => {
        bubble.dataset.text = (bubble.dataset.text || '') + chunk;
        bubble.innerHTML = mdToHtml(bubble.dataset.text) +
          '<span class="chat-cursor">▋</span>';
        scrollMessages();
      },
      currentAbortController.signal
    );
    bubble.innerHTML = mdToHtml(bubble.dataset.text || '(빈 응답)');
    chatHistory.push({ role: 'bot', text: bubble.dataset.text || '' });
    scrollMessages();
  } catch (err) {
    if (err.name === 'AbortError') return;
    bubble.innerHTML =
      `<span style="color:#e74c3c">⚠ Claude 래퍼 연결 실패</span><br>` +
      `<span style="color:#888;font-size:12px">` +
      `URL: <code>${CLAUDE_STREAM_ENDPOINT}</code><br>` +
      `오류: ${escapeHtml(err.message)}<br><br>` +
      `조치:<br>` +
      `1) <code>claude-wrapper</code> 서버 실행<br>` +
      `&nbsp;&nbsp;&nbsp;<code>cd claude-wrapper && npm run dev</code><br>` +
      `2) ${CLAUDE_WRAPPER_URL} 에서 동작 중인지 확인<br>` +
      `3) 래퍼 쪽 CORS 허용 헤더 설정<br>` +
      `4) <code>window.CLAUDE_WRAPPER_URL</code> 로 다른 주소 지정 가능` +
      `</span>`;
  }
}

function createStreamingBubble() {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg chat-bot';
  div.innerHTML = '<span class="chat-cursor">▋</span>';
  div.dataset.text = '';
  container.appendChild(div);
  scrollMessages();
  return div;
}

function scrollMessages() {
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

function appendUser(text) {
  chatHistory.push({ role: 'user', text });
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg chat-user';
  div.textContent = text;
  container.appendChild(div);
  scrollMessages();
}

function appendBot(html) {
  chatHistory.push({ role: 'bot', text: html });
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg chat-bot';
  div.innerHTML = html.replace(/\n/g, '<br>');
  container.appendChild(div);
  scrollMessages();
}

/* ================================================================
 * 3. 스트리밍 SSE 수신
 * ================================================================ */
async function streamFromWrapper(prompt, onChunk, signal) {
  const res = await fetch(CLAUDE_STREAM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      useDefaultAgents: false,
      model: 'sonnet',           // 품질 우선
      maxTurns: 1,               // 도구 호출 없이 1턴 응답
      disallowedTools: ['Read', 'Bash', 'Grep', 'Glob', 'Edit', 'Write'],
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    throw new Error('응답 본문이 없습니다 (ReadableStream 미지원).');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let lastEmitted = ''; // 중복 result 방지

  const handleLine = (raw) => {
    const payload = raw.trim();
    if (!payload || payload === '[DONE]') return;

    // SSE 호환 (data: 접두 있으면 벗겨냄)
    const text = payload.startsWith('data:') ? payload.slice(5).trim() : payload;
    if (!text) return;

    let evt;
    try { evt = JSON.parse(text); }
    catch (_) { return; }

    const chunk = extractText(evt);
    if (!chunk) return;

    // result 이벤트가 전체 누적 문자열을 재전송할 때 증분만 반영
    if (chunk.startsWith(lastEmitted) && chunk !== lastEmitted) {
      onChunk(chunk.slice(lastEmitted.length));
      lastEmitted = chunk;
    } else {
      onChunk(chunk);
      lastEmitted += chunk;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 래퍼는 newline-delimited JSON ('\n'으로 구분)
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) handleLine(line);
  }

  // 스트림 종료 후 남은 버퍼 flush
  if (buffer) handleLine(buffer);
}

/** SSE 이벤트에서 텍스트 추출 (Claude Code stream-json + 래퍼 공통 스키마) */
function extractText(evt) {
  if (!evt) return '';
  // Claude Code assistant 메시지
  if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
    return evt.message.content
      .filter(c => c && c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text)
      .join('');
  }
  // 최종 result
  if (evt.type === 'result' && typeof evt.result === 'string') return evt.result;
  // 래퍼 문서 기본 필드
  if (typeof evt.message === 'string') return evt.message;
  if (typeof evt.text === 'string') return evt.text;
  if (typeof evt.delta === 'string') return evt.delta;
  return '';
}

/* ================================================================
 * 4. 프롬프트 빌더 (사전필터 + 집계요약)
 *   - 질문에서 엔티티 추출 → 관련 행만 추출
 *   - 월별 × 구분 크로스탭(집계질문 대응)도 함께 포함
 *   - 외부 도구 사용 없이 Claude가 이 데이터만으로 답변
 * ================================================================ */
function buildPrompt(userQuestion) {
  const ctx = getScreenContext(rawData);
  const latestYm = ctx ? ctx.latestYm : '(없음)';
  const latestYear = ctx ? ctx.latestYear : '';

  const ents = extractEntities(userQuestion);
  const filtered = filterByEntities(rawData, ents, ctx);
  const filterLabel = describeFilters(ents, ctx) || '필터 없음';

  const summaryCsv = monthCatSummary(rawData);
  const detailsCsv = (filtered.length > 0 && filtered.length <= 200)
    ? toCsv(filtered)
    : null;

  const detailBlock = detailsCsv
    ? `\n\n## 질문 관련 상세 행 (필터: ${filterLabel}, ${filtered.length}건)\n\`\`\`csv\n${detailsCsv}\n\`\`\``
    : `\n\n(질문 관련 단일 필터 미매칭 또는 행 수 과다 — 월별×구분 요약만 사용)`;

  return `당신은 미래에셋 보험손익 대시보드의 데이터 분석 챗봇입니다.
아래 "데이터"만 근거로 정확한 숫자를 답하세요. 외부 파일 Read 하지 마세요.

## 기준 정보
- 당월 = ${latestYm}
- 당해 연도 = ${latestYear}
- 회계모형: NP, IDP, VFA, NA
- 구분: 보험수익, 보험서비스비용, 간접사업비, 그외
- 구분2: CSM상각, RA변동, 간접사업비, 발생보험금, 손실부담비용, 손실부담비용배분

## 수식 (반드시 준수)
- 보험손익(차감전) = Σ(구분="보험수익") − Σ(구분="보험서비스비용")
- 보험손익(차감후) = 보험손익(차감전) − Σ(구분="간접사업비")
- 정수 단위: 억 (Math.round)

## 월별 × 구분 합계 (전 기간, 단위: 억 원본)
\`\`\`csv
${summaryCsv}
\`\`\`${detailBlock}

## 답변 지침
- 한국어로 답변
- 정수(억) + 원본 소수점 병기 (예: "951억 (원본 950.8693)")
- 마크다운 허용 (** - |). HTML 금지
- 끝에 "📐 계산식" 섹션으로 산출 수식 요약
- 제공된 데이터로 답할 수 없으면 "제공 데이터 범위 밖"이라고 명시

## 사용자 질문
${userQuestion}`;
}

/* ================================================================
 * 4-A. 엔티티 추출 및 사전필터 헬퍼
 * ================================================================ */
function extractEntities(q) {
  const upperQ = q.toUpperCase();

  let scope = null;
  if (/당월|이번\s*달|최근\s*월/.test(q)) scope = 'current';
  else if (/당해|누적|YTD|올해|연간/i.test(q)) scope = 'ytd';

  let ym = null;
  const ymMatch = q.match(/\b(20\d{2})[.\-/]?(\d{2})\b/);
  if (ymMatch) ym = ymMatch[1] + ymMatch[2];

  const models = ['VFA', 'IDP', 'NP', 'NA'];
  const model = models.find(m => new RegExp(`\\b${m}\\b`).test(upperQ)) || null;

  const cats = ['보험수익', '보험서비스비용', '간접사업비', '그외'];
  const cat = cats.find(c => q.includes(c)) || null;

  const cat2List = [...new Set(rawData.map(d => d.구분2))];
  const cat2 = cat2List.find(c => c !== cat && q.includes(c)) || null;

  let trend = null;
  if (/월별|월간|매\s*달|매\s*월|1\s*년\s*치|연간\s*추이|월\s*추이/i.test(q)) trend = 'monthly';

  let compare = null;
  if (/전월\s*차|전월\s*대비|MOM|직전\s*월|지난\s*달|저번\s*달/i.test(q)) compare = 'mom';
  else if (/전년\s*차|전년\s*대비|전년\s*동월|YOY|작년/i.test(q)) compare = 'yoy';

  return { scope, model, cat, cat2, ym, trend, compare };
}

function filterByEntities(data, e, ctx) {
  let subset = [...data];

  // 기간 필터
  if (e.ym) {
    subset = subset.filter(d => d.마감년월 === e.ym);
  } else if (e.scope === 'current' && ctx) {
    subset = subset.filter(d => d.마감년월 === ctx.latestYm);
  } else if (e.scope === 'ytd' && ctx) {
    subset = subset.filter(d => d.마감년도 === ctx.latestYear);
  }

  // 차원 필터
  if (e.model) subset = subset.filter(d => d.회계모형 === e.model);
  if (e.cat) subset = subset.filter(d => d.구분 === e.cat);
  if (e.cat2) subset = subset.filter(d => d.구분2 === e.cat2);

  // 비교 질문이면 직전월/전년동월도 포함
  if (e.compare) {
    const anchorYm = e.ym || (ctx && ctx.latestYm) || null;
    if (anchorYm) {
      const y = parseInt(anchorYm.slice(0, 4), 10);
      const m = parseInt(anchorYm.slice(4), 10);
      let compYm;
      if (e.compare === 'mom') {
        let py = y, pm = m - 1;
        if (pm === 0) { pm = 12; py = y - 1; }
        compYm = `${py}${String(pm).padStart(2, '0')}`;
      } else {
        compYm = `${y - 1}${String(m).padStart(2, '0')}`;
      }
      const compRows = data.filter(d =>
        d.마감년월 === compYm &&
        (!e.model || d.회계모형 === e.model) &&
        (!e.cat || d.구분 === e.cat) &&
        (!e.cat2 || d.구분2 === e.cat2)
      );
      subset = [...subset, ...compRows];
    }
  }

  return subset;
}

function describeFilters(e, ctx) {
  const parts = [];
  if (e.ym) parts.push(`마감년월=${e.ym}`);
  else if (e.scope === 'current' && ctx) parts.push(`당월=${ctx.latestYm}`);
  else if (e.scope === 'ytd' && ctx) parts.push(`당해=${ctx.latestYear}`);
  if (e.model) parts.push(`회계모형=${e.model}`);
  if (e.cat) parts.push(`구분=${e.cat}`);
  if (e.cat2) parts.push(`구분2=${e.cat2}`);
  if (e.compare) parts.push(e.compare === 'mom' ? '+ 전월비교' : '+ 전년동월비교');
  if (e.trend === 'monthly') parts.push('월별 관점');
  return parts.join(' AND ');
}

/** 월별 × 구분 크로스탭 (집계 질문 대응용) */
function monthCatSummary(data) {
  const cats = ['보험수익', '보험서비스비용', '간접사업비', '그외'];
  const agg = {};
  data.forEach(d => {
    if (!agg[d.마감년월]) agg[d.마감년월] = {};
    agg[d.마감년월][d.구분] = (agg[d.마감년월][d.구분] || 0) + d.금액;
  });
  const months = Object.keys(agg).sort();
  const header = '마감년월,' + cats.join(',') + ',손익차감전,손익차감후';
  const rows = months.map(m => {
    const row = cats.map(c => (agg[m][c] || 0).toFixed(4));
    const rev = agg[m]['보험수익'] || 0;
    const cost = agg[m]['보험서비스비용'] || 0;
    const ind = agg[m]['간접사업비'] || 0;
    row.push((rev - cost).toFixed(4));
    row.push((rev - cost - ind).toFixed(4));
    return m + ',' + row.join(',');
  });
  return [header, ...rows].join('\n');
}

/** rawData → CSV 텍스트 */
function toCsv(rows) {
  const header = '마감년도,마감년월,회계모형,구분,구분2,금액';
  const lines = rows.map(d =>
    `${d.마감년도},${d.마감년월},${d.회계모형},${d.구분},${d.구분2},${d.금액}`
  );
  return [header, ...lines].join('\n');
}

/* ================================================================
 * 5. 마크다운 → HTML (안전한 최소 서브셋)
 * ================================================================ */
function mdToHtml(md) {
  if (!md) return '';
  let html = escapeHtml(md);
  // 코드 펜스 ```...``` (여러 줄)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="chat-pre">${code}</pre>`);
  // 인라인 코드 `...`
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // 볼드 **...**
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  // 이탤릭 *...*
  html = html.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1<i>$2</i>');
  // 리스트 "- item" / "* item"
  html = html.replace(/^[-*]\s+(.*)$/gm, '• $1');
  // 줄바꿈
  html = html.replace(/\n/g, '<br>');
  return html;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ================================================================
 * 6. 화면 컨텍스트
 * ================================================================ */
function getScreenContext(data) {
  if (!data || data.length === 0) return null;
  const latestYm = data.reduce((mx, d) => d.마감년월 > mx ? d.마감년월 : mx, '000000');
  const latestYear = latestYm.slice(0, 4);
  const latestMonth = parseInt(latestYm.slice(4), 10);
  return {
    latestYm,
    latestYear,
    latestMonth,
    periodLabel: `${latestYear}.${String(latestMonth).padStart(2, '0')}`,
  };
}
