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
    if (chatHistory.length === 0) {
      appendBot(
        '안녕하세요! 이 챗봇은 <b>Claude</b>에 연결되어 있습니다.\n' +
        '3개 탭(보험손익 / 보험금융손익 / 예실차) 데이터를 자연어로\n분석해 드립니다.\n\n' +
        '예시 질문:\n' +
        '- "당월 보험수익 금액 알려줘"\n' +
        '- "보험서비스비용의 전월차 얼마니?"\n' +
        '- "(무)확정사망 상품의 NP 모델 당월 데이터 알려줘"\n' +
        '- "사업비 예실차 변액연금의 당월 예상금액이 얼마니?"'
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
  // 최종 result 이벤트는 스트리밍으로 이미 출력된 텍스트를 재전송하므로 무시
  if (evt.type === 'result') return '';
  // Claude Code assistant 메시지 (스트리밍)
  if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
    return evt.message.content
      .filter(c => c && c.type === 'text' && typeof c.text === 'string')
      .map(c => c.text)
      .join('');
  }
  // 래퍼 문서 기본 필드 (델타형 스트림)
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
  const activeTab = getActiveTabName();
  const selectedYm = (document.getElementById('current-yearmonth') || {}).value || latestYm;

  // ===== 보험손익 탭 데이터 =====
  const ents = extractEntities(userQuestion);
  const filtered = filterByEntities(rawData, ents, ctx);
  const filterLabel = describeFilters(ents, ctx) || '필터 없음';

  const pnlSummary = monthCatSummary(rawData);
  const detailsCsv = (filtered.length > 0 && filtered.length <= 200)
    ? toCsv(filtered)
    : null;
  const detailBlock = detailsCsv
    ? `\n\n## [보험손익] 질문 관련 상세 행 (필터: ${filterLabel}, ${filtered.length}건)\n\`\`\`csv\n${detailsCsv}\n\`\`\``
    : '';

  // ===== 보험금융손익 탭 데이터 =====
  const d2_2 = (typeof window !== 'undefined' && window.rawData2_2) || [];
  const d2_1 = (typeof window !== 'undefined' && window.rawData2_1) || [];
  const finCostCsv = d2_2.length ? finCostSummary(d2_2) : '(데이터 없음)';
  const finRateCsv = d2_1.length ? finRateSummary(d2_1) : '(데이터 없음)';

  // ===== 예실차 탭 데이터 =====
  const d3 = (typeof window !== 'undefined' && window.rawData3) || [];
  const varSummaryCsv = d3.length ? varianceSummary(d3) : '(데이터 없음)';
  const varProductCsv = d3.length ? varProductLatest(d3, selectedYm) : '(데이터 없음)';

  return `당신은 미래에셋 Actuarial Report 대시보드의 데이터 분석 챗봇입니다.
아래 "데이터"만 근거로 정확한 숫자를 답하세요. 외부 파일 Read 하지 마세요.
탭은 3개(보험손익 / 보험금융손익 / 예실차)이며, 사용자 질문이 어느 탭에 대한 것인지 판단해서 해당 데이터셋으로 답하세요.

## 기준 정보
- 선택된 마감년월 = ${selectedYm}
- 데이터 최신월(보험손익) = ${latestYm}
- 당해 연도 = ${latestYear}
- 현재 활성 탭 = ${activeTab}

## 데이터셋 스키마
**[보험손익] sample_data1 (rawData)**
- 컬럼: 마감년도, 마감년월, 회계모형(NP/IDP/VFA/NA), 구분(보험수익/보험서비스비용/간접사업비/그외), 구분2(CSM상각/RA변동/간접사업비/발생보험금/손실부담비용/손실부담비용배분), 금액
- 지표: 보험손익(차감전) = Σ보험수익 − Σ보험서비스비용 / 보험손익(차감후) = 차감전 − Σ간접사업비

**[보험금융손익] sample_data2_2 (rawData2_2) - 상세**
- 컬럼: 회계모형(NP/IDP/VFA), 상품유형, 마감년월, 구분(이자부리/위험경감/공시이율예실차), 보험금융비용, 부담이자율
- 지표: 섹션1·2(NP/IDP) = 구분='이자부리' 보험금융비용, 섹션3(VFA) = 구분별 보험금융비용, 섹션5(OCI) = 구분='공시이율예실차' 보험금융비용

**[보험금융손익] sample_data2_1 (rawData2_1) - 합계**
- 컬럼: 회계모형(IDP/NP/합계), 마감년월, 부담이자율
- 용도: 섹션4 부담이자율 합계/총합 행

**[예실차] sample_data3 (rawData3)**
- 컬럼: 마감년월, 회계모형, 상품유형, 상품군, 코호트, 구분(보험금(PL)/유지비/신계약비(PL)/신계약비(CSM)/보험료/보험금(CSM)/약관대출/계약자배당), 예실구분(예상/실제), 금액
- 지표: Variance = Σ(예실구분='예상') − Σ(예실구분='실제') (약속)
- 섹션1(지급보험금) 코호트 매핑: 999991→~2018, 201992→2019, 202092→2020, 202192→2021, 202201→2022, 202301→2023, 202401→2024, 202501→2025
- 섹션3(기타 현금흐름) 라벨↔데이터 구분 매핑: 수입보험료→보험료, 투자요소 보험금→보험금(CSM), 약관대출→약관대출, 기타지급금→계약자배당

## 공통 수식
- 정수 단위: 억 (Math.round)
- Variance(예-실) 음수는 실제가 예상보다 큼

## 현재 화면 스냅샷 (활성 탭 "${activeTab}"에 실제로 표시된 표)
- 사용자가 지금 보고 있는 값이니 답변 시 최우선 참고
- 원본 CSV와 값이 다르면 필터(선택월/최근12개월/코호트)가 이미 반영된 결과
${snapshotActiveScreen()}

## [보험손익] 월별 × 구분 합계 (전 기간)
\`\`\`csv
${pnlSummary}
\`\`\`${detailBlock}

## [보험금융손익] 월별 × 회계모형 × 구분 — 보험금융비용 합계
\`\`\`csv
${finCostCsv}
\`\`\`

## [보험금융손익] 월별 × 회계모형 — 부담이자율 (sample_data2_1)
\`\`\`csv
${finRateCsv}
\`\`\`

## [예실차] 월별 × 구분 × 예실구분 — 금액 합계
\`\`\`csv
${varSummaryCsv}
\`\`\`

## [예실차] 선택월(${selectedYm}) × 상품유형 × 구분 × 예실구분 — 금액
\`\`\`csv
${varProductCsv}
\`\`\`

## 답변 지침 (간결하게)
- 한국어, 2~4문장 이내로 짧게
- 핵심 숫자만 제시 (단위: 억, 정수 반올림)
- 불필요한 서론/도입부/결론 금지, 표·불릿·수식 섹션 생략 (사용자가 요청할 때만 사용)
- 여러 값이 필요하면 한 줄 불릿 최대 5개까지만
- 답할 수 없으면 "제공 데이터 범위 밖" 한 줄로 종료

## 사용자 질문
${userQuestion}`;
}

/** 활성 탭 라벨 (보험손익/보험금융손익/예실차) */
function getActiveTabName() {
  const btn = document.querySelector('.tab-btn.tab-active');
  if (btn) return btn.textContent.trim();
  return '보험손익';
}

/**
 * 현재 화면(활성 탭)에 렌더된 표들을 텍스트로 수집.
 * - 패널 제목(h2) + 태그(period-tag) + 표 내용을 마크다운 파이프 테이블처럼 구성
 * - 한 셀 길이 제한으로 안전하게 자르고, 전체 길이 상한 초과 시 뒷부분 생략
 */
function snapshotActiveScreen() {
  const panel = document.querySelector('.tab-panel.tab-panel-active');
  if (!panel) return '(활성 탭 없음)';

  const MAX_CELL = 40;
  const MAX_TOTAL = 12000;
  const clip = (s) => {
    const t = String(s).replace(/\s+/g, ' ').trim();
    return t.length > MAX_CELL ? t.slice(0, MAX_CELL) + '…' : t;
  };

  const out = [];
  const panels = panel.querySelectorAll('.panel');
  panels.forEach(p => {
    const h2 = p.querySelector('.panel-header h2');
    const tag = p.querySelector('.panel-header .period-tag');
    const title = (h2 ? h2.textContent.trim() : '(제목없음)') +
      (tag && tag.textContent.trim() && tag.textContent.trim() !== '-' ? ` [${tag.textContent.trim()}]` : '');
    const table = p.querySelector('table');
    if (!table) return;

    const heads = [...table.querySelectorAll('thead tr')].map(tr =>
      '| ' + [...tr.children].map(td => clip(td.textContent)).join(' | ') + ' |'
    );
    const bodies = [...table.querySelectorAll('tbody tr')].map(tr =>
      '| ' + [...tr.children].map(td => clip(td.textContent)).join(' | ') + ' |'
    );

    out.push(`### ${title}`);
    if (heads.length) out.push(heads.join('\n'));
    if (bodies.length) out.push(bodies.join('\n'));
    out.push('');
  });

  let joined = out.join('\n');
  if (joined.length > MAX_TOTAL) {
    joined = joined.slice(0, MAX_TOTAL) + '\n…(화면 스냅샷 뒷부분 생략)';
  }
  return joined || '(화면에 표가 없음)';
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

/** [보험금융손익] 월×회계모형×구분 보험금융비용 합계 (rawData2_2) */
function finCostSummary(rows) {
  const agg = {}; // { 마감년월: { 'NP|이자부리': sum, ... } }
  rows.forEach(r => {
    const k = `${r.회계모형}|${r.구분}`;
    if (!agg[r.마감년월]) agg[r.마감년월] = {};
    agg[r.마감년월][k] = (agg[r.마감년월][k] || 0) + (r.보험금융비용 || 0);
  });
  const months = Object.keys(agg).sort();
  const cols = [
    'NP|이자부리', 'IDP|이자부리',
    'VFA|이자부리', 'VFA|위험경감',
    'NP|공시이율예실차', 'IDP|공시이율예실차',
  ];
  const header = '마감년월,' + cols.join(',');
  const lines = months.map(m =>
    m + ',' + cols.map(c => (agg[m][c] || 0).toFixed(2)).join(',')
  );
  return [header, ...lines].join('\n');
}

/** [보험금융손익] 월×회계모형 부담이자율 (rawData2_1) */
function finRateSummary(rows) {
  const agg = {}; // { 마감년월: { IDP, NP, 합계 } }
  rows.forEach(r => {
    if (!agg[r.마감년월]) agg[r.마감년월] = {};
    agg[r.마감년월][r.회계모형] = r.부담이자율 || 0;
  });
  const months = Object.keys(agg).sort();
  const cols = ['IDP', 'NP', '합계'];
  const header = '마감년월,' + cols.join(',');
  const lines = months.map(m =>
    m + ',' + cols.map(c => (agg[m][c] || 0).toFixed(2)).join(',')
  );
  return [header, ...lines].join('\n');
}

/** [예실차] 월×구분×예실구분 금액 합계 (rawData3) */
function varianceSummary(rows) {
  const agg = {};
  rows.forEach(r => {
    const k = `${r.구분}|${r.예실구분}`;
    if (!agg[r.마감년월]) agg[r.마감년월] = {};
    agg[r.마감년월][k] = (agg[r.마감년월][k] || 0) + (r.금액 || 0);
  });
  const months = Object.keys(agg).sort();
  const gubuns = [...new Set(rows.map(r => r.구분))].filter(Boolean);
  const kinds = ['예상', '실제'];
  const cols = [];
  gubuns.forEach(g => kinds.forEach(k => cols.push(`${g}|${k}`)));
  const header = '마감년월,' + cols.join(',');
  const lines = months.map(m =>
    m + ',' + cols.map(c => (agg[m][c] || 0).toFixed(2)).join(',')
  );
  return [header, ...lines].join('\n');
}

/** [예실차] 특정월 상품유형×구분×예실구분 금액 (rawData3) */
function varProductLatest(rows, ym) {
  if (!ym) return '(선택월 없음)';
  const sub = rows.filter(r => r.마감년월 === ym);
  if (sub.length === 0) return `(${ym} 데이터 없음)`;
  const agg = {}; // { '상품|구분|예실구분': sum }
  sub.forEach(r => {
    const k = `${r.상품유형}|${r.구분}|${r.예실구분}`;
    agg[k] = (agg[k] || 0) + (r.금액 || 0);
  });
  const header = '상품유형,구분,예실구분,금액';
  const lines = Object.keys(agg).sort().map(k => {
    const [p, g, ys] = k.split('|');
    return `${p},${g},${ys},${agg[k].toFixed(2)}`;
  });
  // 너무 많으면 상위 200행으로 제한
  const capped = lines.length > 200 ? lines.slice(0, 200) : lines;
  const footer = lines.length > 200 ? `\n(총 ${lines.length}행 중 상위 200행만 표시)` : '';
  return [header, ...capped].join('\n') + footer;
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
