/**
 * 取調室のジレンマ v2 — 保存・AI分類・先生モード用 Google Apps Script
 *
 * 使い方（くわしくは README.md）
 *  1. 新しい Google スプレッドシートを作る
 *  2. 拡張機能 → Apps Script を開き、このファイルの中身を丸ごと貼り付けて保存
 *  3. プロジェクトの設定（⚙）→ スクリプト プロパティ に次を追加
 *       TEACHER_PASSWORD  … 先生モードのパスワード
 *       OPENAI_API_KEY    … OpenAI の API キー（既定モデル gpt-4.1-mini。OPENAI_MODEL で変更可）
 *     Claude を使う場合：AI_PROVIDER = anthropic と ANTHROPIC_API_KEY（既定モデル claude-haiku-5-5。ANTHROPIC_MODEL で変更可）
 *     任意：PID_SALT（学籍番号から匿名IDを作るときの文字列）
 *  4. 関数 setup を一度実行して権限を承認。testClassify で AI が動くか確認できます
 *  5. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」／実行：自分／アクセス：全員
 *  6. 表示された「ウェブアプリ URL」を config.js の GAS_URL に貼る
 */

const SHEET_NAME = 'log';
// config.js の PAYOFF と同じ値にしてください（AIに渡すルール説明に使います）
const PAYOFF = { CC: 1, DC: 0, CD: 10, DD: 5 };

const HEADERS = [
  'received_at', 'row_id', 'session_id', 'student_id', 'nickname', 'attempt', 'trial',
  'character_id', 'character_name', 'choice', 'cooperate', 'expect', 'expect_cooperate',
  'reason', 'reason_len', 'rt_ms', 'rt_first_ms', 'changed_mind', 'viewed_table', 'rt_reason_ms',
  'partner_choice', 'partner_cooperate', 'my_years', 'partner_years',
  'comp_answer', 'comp_correct', 'button_order', 'reveal_mode', 'partner_coop_p',
  'device', 'screen', 'user_agent', 'started_at', 'trial_at', 'app_version',
  'ai_primary', 'ai_tags', 'ai_bias', 'ai_mind', 'ai_comment', 'ai_json', 'ai_model', 'ai_at',
  'teacher_primary', 'hidden',
];
// 結果ページ（誰でも見られる）に出さない列
const PRIVATE_COLS = ['student_id', 'user_agent', 'screen'];
const CATS = ['合理的', '感情的', '規範的', '認知バイアス', '判定不能'];
const MINDS = ['意図・能力', '感情・痛み', '両方', 'なし'];

const SYSTEM_PROMPT = [
  'あなたは大学の授業「コンピュータインタラクション」で、学生が書いた「判断の理由」を分類するアシスタントです。',
  '',
  '## ゲーム',
  '一回限りの囚人のジレンマです。学生は共犯者として逮捕され、別室の「相棒」と一度だけ取引をします。相談はできません。',
  '黙秘＝協力、自白＝裏切りです。刑期：2人とも黙秘なら各' + PAYOFF.CC + '年／自分だけ自白なら自分' + PAYOFF.DC + '年・相棒' + PAYOFF.CD + '年／' +
    '自分だけ黙秘なら自分' + PAYOFF.CD + '年・相棒' + PAYOFF.DC + '年／2人とも自白なら各' + PAYOFF.DD + '年。',
  '相棒は毎回ちがう人物（こわそうなヤクザ、優しそうな女性、宇宙人、かわいいロボット、柴犬、無機的なコンピュータ、子ども）で、',
  '全員が同じ内容「2人とも黙っていれば1年で済む。黙っていよう」をそれぞれの口調で言います。学生は相棒ごとに、自分の選択・相棒の予想・理由を書きます。',
  '',
  '## 分類（primary は1つ、tags は primary 以外で当てはまるものを最大2つ）',
  '- 合理的：刑期（利得）の比較、相棒の出方の予測にもとづく損得の計算、支配戦略、最悪の場合を避けるリスクの見積もり',
  '- 感情的：恐れ・不安・同情・かわいそう・かわいい・好き嫌い・罪悪感など、気持ちが判断の中心にある',
  '- 規範的：信頼・約束・仲間を裏切るべきでない・子どもを守るべき・公平など、「こうあるべき」という考えが中心にある',
  '- 認知バイアス：判断に系統的な思考のくせがはっきり表れている（ステレオタイプ、擬人化、フォールス・コンセンサス、楽観バイアス、損失回避、ハロー効果 など）。bias にその名前を1つ書く',
  '- 判定不能：短すぎる、ゲームと関係がない、意味がとれない',
  '',
  '## 注意',
  '- ゲーム理論の答え（自白）から外れたこと自体は、バイアスではありません。',
  '- 相棒の見た目や口調から相棒の出方を推測すること自体は、合理的な推論でありえます。根拠の薄い固定観念で断定しているとき（「ヤクザだから必ず裏切る」など）に認知バイアス（ステレオタイプ）とします。',
  '- 機械・動物・宇宙人に人間と同じ心や約束の理解を前提にしているときは、擬人化を検討してください。ただしそれが判断の中心でなければ tags に入れます。',
  '- bias は、primary か tags に認知バイアスを入れたときだけ書き、それ以外は空文字にします。',
  '',
  '## 心の知覚（mind）：理由が相棒の「心」のどの側面に触れているか',
  '- 意図・能力：相棒の考え・意図・判断力・ルールの理解・信用できるか（エージェンシー）',
  '- 感情・痛み：相棒がつらい・かわいそう・怖がっている・守ってあげたい（エクスペリエンス）',
  '- 両方：両方に触れている',
  '- なし：相棒の心に触れていない（自分の刑期だけを考えている、など）',
  '',
  '## 出力',
  '次の形の JSON だけを返してください。説明文やコードブロックは不要です。',
  '{"results":[{"id":"入力のid","primary":"合理的","primary_why":"判定の理由（30〜60字）","tags":[{"label":"感情的","why":"（20〜40字）"}],',
  '"bias":"","mind":"意図・能力","mind_why":"（20〜40字）","comment":"学生への一言（40〜80字）"}]}',
  'comment はです・ます調で、本人の考えを否定せず、自分の判断のしかたに気づけるような問いかけや観察にします。',
].join('\n');

// ---------------- シート ----------------
function props_() { return PropertiesService.getScriptProperties(); }

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  } else {
    // 古い版のシートでも使えるように、足りない列を右端に足す
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const missing = HEADERS.filter(function (h) { return head.indexOf(h) < 0; });
    if (missing.length) sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
  }
  return sh;
}

function headIndex_(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const ix = {};
  head.forEach(function (h, i) { ix[h] = i; });
  return { head: head, ix: ix };
}

function readAll_() {
  const sh = getSheet_();
  const values = sh.getDataRange().getDisplayValues();
  const head = values.shift() || [];
  return values.map(function (row, k) {
    const o = { _row: k + 2 };
    head.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function now_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'); }

function pid_(sid) {
  const salt = props_().getProperty('PID_SALT') || 'pd-salt';
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + sid, Utilities.Charset.UTF_8);
  return 'p' + d.slice(0, 5).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function isTeacher_(p) {
  const pw = props_().getProperty('TEACHER_PASSWORD');
  return !!(pw && p && p.password && String(p.password) === pw);
}

// ---------------- 入口 ----------------
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'ping') return json_({ ok: true });
  if (p.action === 'results') return json_(results_(p));
  return json_({ ok: true, hint: 'POST で使います' });
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  try {
    const a = p.action || (p.rows ? 'submit' : '');
    if (a === 'submit') return json_(submit_(p));
    if (a === 'classify') return json_(classifySession_(p.session_id));
    if (a === 'results') return json_(results_(p));
    if (a === 'ping') return json_({ ok: true });
    if (!isTeacher_(p)) return json_({ ok: false, error: 'unauthorized' });
    if (a === 'classifyPending') return json_(classifyPending_(Math.min(Number(p.limit) || 10, 20)));
    if (a === 'teacherEdit') return json_(teacherEdit_(p));
    if (a === 'reclassifyAll') return json_(clearAI_());
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---------------- 保存 ----------------
function submit_(p) {
  const rows = (p.rows || []).slice(0, 50);
  if (!rows.length) return { ok: false, error: 'no rows' };
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = getSheet_();
    const H = headIndex_(sh);
    // 同じ行の二重送信を除く
    const have = {};
    if (sh.getLastRow() > 1) {
      sh.getRange(2, H.ix.row_id + 1, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) { have[r[0]] = 1; });
    }
    const now = now_();
    const values = [];
    rows.forEach(function (r) {
      if (r.row_id && have[r.row_id]) return;
      values.push(H.head.map(function (h) {
        if (h === 'received_at') return now;
        if (h.indexOf('ai_') === 0 || h === 'teacher_primary' || h === 'hidden') return '';
        let v = r[h];
        if (v === undefined || v === null) return '';
        v = String(v).slice(0, h === 'reason' ? 1000 : 500);
        // 学籍番号などが数式・数値として解釈されないように
        if (h === 'student_id' || h === 'session_id' || h === 'row_id' || h === 'nickname' || h === 'reason') v = "'" + v;
        return v;
      }));
    });
    if (values.length) sh.getRange(sh.getLastRow() + 1, 1, values.length, H.head.length).setValues(values);
    return { ok: true, n: values.length };
  } finally {
    lock.releaseLock();
  }
}

// ---------------- 読み出し ----------------
function results_(p) {
  const teacher = isTeacher_(p);
  if (p.password && !teacher) return { ok: false, error: 'unauthorized' };
  const rows = readAll_().map(function (r) {
    r.pid = pid_(r.student_id);
    r.is_test = /^TEST/i.test(r.student_id) ? 1 : 0;
    delete r._row;
    return r;
  });
  const out = teacher ? rows : rows.filter(function (r) { return r.hidden !== '1'; }).map(function (r) {
    PRIVATE_COLS.forEach(function (c) { delete r[c]; });
    return r;
  });
  return { ok: true, teacher: teacher, rows: out, fetched_at: now_() };
}

// ---------------- AI分類 ----------------
function classifySession_(sessionId) {
  if (!sessionId) return { ok: false, error: 'no session' };
  const all = readAll_();
  const mine = all.filter(function (r) { return r.session_id === String(sessionId); });
  const todo = mine.filter(function (r) { return r.reason && !r.ai_primary; });
  if (todo.length) {
    const res = classifyRows_(todo);
    writeAI_(res);
    const byId = {};
    res.forEach(function (x) { byId[x.row_id] = x; });
    mine.forEach(function (r) { if (byId[r.row_id]) Object.keys(byId[r.row_id]).forEach(function (k) { r[k] = byId[r.row_id][k]; }); });
  }
  return {
    ok: true,
    results: mine.map(function (r) {
      const o = {};
      ['row_id', 'trial', 'character_id', 'ai_primary', 'ai_tags', 'ai_bias', 'ai_mind', 'ai_comment', 'ai_json', 'teacher_primary'].forEach(function (k) { o[k] = r[k] || ''; });
      return o;
    }),
  };
}

function classifyPending_(limit) {
  const all = readAll_();
  const todo = all.filter(function (r) { return r.reason && !r.ai_primary; });
  const batch = todo.slice(0, limit);
  if (batch.length) writeAI_(classifyRows_(batch));
  return { ok: true, done: batch.length, remaining: Math.max(0, todo.length - batch.length) };
}

function clearAI_() {
  // 全件を未分類に戻す（先生モードの「すべて分類し直す」）。このあと classifyPending を繰り返す
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = getSheet_();
    const H = headIndex_(sh);
    const n = sh.getLastRow() - 1;
    if (n > 0) ['ai_primary', 'ai_tags', 'ai_bias', 'ai_mind', 'ai_comment', 'ai_json', 'ai_model', 'ai_at'].forEach(function (c) {
      sh.getRange(2, H.ix[c] + 1, n, 1).clearContent();
    });
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function classifyRows_(rows) {
  const items = rows.map(function (r) {
    return {
      id: r.row_id, partner: r.character_name, choice: r.choice === 'silent' ? '黙秘' : '自白',
      expect: r.expect === 'silent' ? '相棒は黙秘すると予想' : r.expect === 'confess' ? '相棒は自白すると予想' : '（予想なし）',
      reason: String(r.reason).slice(0, 600),
    };
  });
  const user = '次の理由を分類してください。\n' + JSON.stringify({ items: items });
  const out = callAI_(SYSTEM_PROMPT, user);
  const list = (out.parsed && out.parsed.results) || [];
  const byId = {};
  list.forEach(function (x) { if (x && x.id) byId[String(x.id)] = x; });
  const at = now_();
  return rows.map(function (r) {
    const x = byId[r.row_id];
    if (!x) return null;
    const primary = CATS.indexOf(x.primary) >= 0 ? x.primary : '判定不能';
    const tags = (x.tags || []).filter(function (t) { return t && CATS.indexOf(t.label) >= 0 && t.label !== primary; }).slice(0, 2);
    const mind = MINDS.indexOf(x.mind) >= 0 ? x.mind : 'なし';
    const clean = { primary: primary, primary_why: String(x.primary_why || ''), tags: tags, bias: String(x.bias || ''), mind: mind, mind_why: String(x.mind_why || ''), comment: String(x.comment || '') };
    return {
      row_id: r.row_id, ai_primary: primary, ai_tags: tags.map(function (t) { return t.label; }).join(','),
      ai_bias: clean.bias, ai_mind: mind, ai_comment: clean.comment, ai_json: JSON.stringify(clean), ai_model: out.model, ai_at: at,
    };
  }).filter(function (x) { return x; });
}

function writeAI_(res) {
  if (!res.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = getSheet_();
    const H = headIndex_(sh);
    const ids = sh.getRange(2, H.ix.row_id + 1, Math.max(1, sh.getLastRow() - 1), 1).getDisplayValues().map(function (r) { return r[0]; });
    const cols = ['ai_primary', 'ai_tags', 'ai_bias', 'ai_mind', 'ai_comment', 'ai_json', 'ai_model', 'ai_at'];
    res.forEach(function (x) {
      const k = ids.indexOf(x.row_id);
      if (k < 0) return;
      cols.forEach(function (c) { sh.getRange(k + 2, H.ix[c] + 1).setValue(String(x[c] == null ? '' : x[c])); });
    });
  } finally { lock.releaseLock(); }
}

function callAI_(system, user) {
  const pr = props_();
  const provider = (pr.getProperty('AI_PROVIDER') || 'openai').toLowerCase();
  let text = '', model = '';
  if (provider === 'anthropic') {
    model = pr.getProperty('ANTHROPIC_MODEL') || 'claude-haiku-5-5';
    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': pr.getProperty('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: model, max_tokens: 4000, temperature: 0.2, system: system, messages: [{ role: 'user', content: user }] }),
    });
    if (res.getResponseCode() !== 200) throw new Error('Anthropic ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    const j = JSON.parse(res.getContentText());
    text = (j.content || []).map(function (c) { return c.text || ''; }).join('');
  } else {
    model = pr.getProperty('OPENAI_MODEL') || 'gpt-4.1-mini';
    const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + pr.getProperty('OPENAI_API_KEY') },
      payload: JSON.stringify({ model: model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (res.getResponseCode() !== 200) throw new Error('OpenAI ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    text = JSON.parse(res.getContentText()).choices[0].message.content;
  }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let parsed = null;
  try { parsed = JSON.parse(text.slice(a, b + 1)); } catch (err) { throw new Error('AIの返答をJSONとして読めませんでした: ' + text.slice(0, 200)); }
  return { parsed: parsed, model: model };
}

// ---------------- 先生の操作 ----------------
function teacherEdit_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = getSheet_();
    const H = headIndex_(sh);
    const ids = sh.getRange(2, H.ix.row_id + 1, Math.max(1, sh.getLastRow() - 1), 1).getDisplayValues().map(function (r) { return r[0]; });
    const k = ids.indexOf(String(p.row_id));
    if (k < 0) return { ok: false, error: 'not found' };
    if ('teacher_primary' in p) {
      const v = CATS.indexOf(p.teacher_primary) >= 0 ? p.teacher_primary : '';
      sh.getRange(k + 2, H.ix.teacher_primary + 1).setValue(v);
    }
    if ('hidden' in p) sh.getRange(k + 2, H.ix.hidden + 1).setValue(p.hidden ? '1' : '');
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// ---------------- エディタから実行する関数 ----------------
function setup() {
  getSheet_();
  Logger.log('シート「' + SHEET_NAME + '」を準備しました。TEACHER_PASSWORD 設定: ' + (props_().getProperty('TEACHER_PASSWORD') ? 'あり' : 'なし'));
}

function testClassify() {
  const res = classifyRows_([
    { row_id: 't1', character_name: '柴犬', choice: 'silent', expect: 'silent', reason: '柴犬がかわいそうで、10年も入れられるのは見ていられないので黙秘した' },
    { row_id: 't2', character_name: 'こわそうなヤクザ', choice: 'confess', expect: 'confess', reason: 'ヤクザだから絶対裏切ると思った。自分だけ10年は嫌なので自白' },
    { row_id: 't3', character_name: '無機的なコンピュータ', choice: 'confess', expect: 'confess', reason: 'どちらを選ばれても自白したほうが刑期が短いので自白' },
  ]);
  Logger.log(JSON.stringify(res, null, 2));
}
