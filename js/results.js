// ===== 結果ページ・先生モード =====
(function () {
  const CFG = window.PD_CONFIG || {};
  const C = window.PD_COMMON;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const ss = { get(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };

  const CHARS = (window.PD_CHARACTERS || []).map((c) => ({ id: c.id, name: c.name, short: c.short, def: c }));
  const CHAR = Object.fromEntries(CHARS.map((c) => [c.id, c]));
  const CAT_KEYS = C.CATS.map((c) => c.key);
  const CAT_COLOR = { '合理的': 'var(--s1)', '感情的': 'var(--s2)', '規範的': 'var(--s3)', '認知バイアス': 'var(--s4)', '判定不能': 'var(--muted)', '未分類': 'var(--surface-2)' };
  const MIND_KEYS = C.MIND.map((m) => m.key);
  const MIND_COLOR = { '意図・能力': 'var(--s1)', '感情・痛み': 'var(--s2)', '両方': 'var(--s5)', 'なし': 'var(--muted)', '未分類': 'var(--surface-2)' };
  const COMBO = [
    { key: 'CC', label: '黙秘を予想 → 黙秘', sub: '信じて協力', color: 'var(--s1)' },
    { key: 'CD', label: '黙秘を予想 → 自白', sub: '出し抜く', color: 'var(--s2)' },
    { key: 'DC', label: '自白を予想 → 黙秘', sub: 'それでも協力', color: 'var(--s3)' },
    { key: 'DD', label: '自白を予想 → 自白', sub: '身を守る', color: 'var(--s4)' },
  ];

  // ---------------- 表示の切り替え ----------------
  $('themebtn').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  };
  $('bigbtn').onclick = () => document.body.classList.toggle('big');
  if (params.get('big') === '1') document.body.classList.add('big');

  // ---------------- サムネイル ----------------
  let THUMB = {};
  try {
    const T = THREE, size = 96;
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(size, size); r.outputEncoding = T.sRGBEncoding;
    const s = new T.Scene();
    s.add(new T.HemisphereLight(0xffffff, 0x444444, 1.0));
    const d = new T.DirectionalLight(0xffffff, 0.8); d.position.set(1, 2, 3); s.add(d);
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 1.5, 3.2); cam.lookAt(0, 1.4, 0);
    CHARS.forEach((c) => { const b = c.def.build(); s.add(b.group); b.update(1.0, 0.016); r.render(s, cam); THUMB[c.id] = r.domElement.toDataURL('image/png'); s.remove(b.group); });
    r.dispose();
  } catch (e) { THUMB = {}; }
  const img = (id) => (THUMB[id] ? `<img alt="" src="${THUMB[id]}">` : '');

  // ---------------- ツールチップ ----------------
  const tip = $('tip');
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    tip.innerHTML = t.dataset.tip; tip.style.display = 'block';
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 14) + 'px';
    tip.style.top = Math.max(8, e.clientY - h - 12) + 'px';
  });
  document.addEventListener('pointerleave', () => (tip.style.display = 'none'));

  // ---------------- 状態 ----------------
  const isTeacherPage = params.get('t') === '1';
  let PW = isTeacherPage ? ss.get('pd_pw') : '';
  let TEACHER = false;
  let RAW = [];
  let lastFetched = '';
  const F = { char: '', choice: '', cat: '', mind: '', combo: '' };
  let shown = 30;

  const done = C.store.get('pd_done', null);
  if (CFG.RESULTS_GATE !== false && !done && !isTeacherPage) {
    $('gate').classList.remove('hide');
    return;
  }
  if (isTeacherPage) {
    $('teach').classList.remove('hide');
    if (C.DEMO) $('demo-note').textContent = 'デモモード（パスワード：demo）';
  }

  function setStatus(kind, msg) { const s = $('status'); s.className = 'status ' + (kind || ''); s.textContent = msg; }

  async function load() {
    try {
      const j = await C.call('results', PW ? { password: PW } : {});
      if (!j.ok) {
        if (j.error === 'unauthorized') { PW = ''; ss.set('pd_pw', ''); TEACHER = false; $('loginmsg').textContent = 'パスワードがちがいます。'; $('loginmsg').className = 'status ng'; return load(); }
        setStatus('ng', '読み込めませんでした：' + j.error); return;
      }
      RAW = j.rows || [];
      TEACHER = !!j.teacher;
      lastFetched = j.fetched_at || '';
      $('login').classList.toggle('hide', TEACHER);
      $('tools').classList.toggle('hide', !TEACHER);
      $('roster-card').classList.toggle('hide', !TEACHER);
      setStatus('ok', (C.DEMO ? 'デモ・' : '') + '更新 ' + lastFetched);
      fillDates();
      render();
    } catch (e) {
      setStatus('ng', '通信できませんでした。少し待つと自動で再読み込みします。');
    }
  }

  // ---------------- 絞り込み ----------------
  function fillDates() {
    const sel = $('f-date'); const cur = sel.value;
    const ds = [...new Set(RAW.map((r) => String(r.received_at || '').slice(0, 10)).filter(Boolean))].sort().reverse();
    sel.innerHTML = '<option value="">すべて</option>' + ds.map((d) => `<option ${d === cur ? 'selected' : ''}>${d}</option>`).join('');
  }
  function base() {
    const exTest = !TEACHER || $('f-test').checked;
    const latest = !TEACHER || $('f-latest').checked;
    const date = TEACHER ? $('f-date').value : '';
    let rows = RAW.filter((r) => CHAR[r.character_id]);
    if (exTest) rows = rows.filter((r) => String(r.is_test) !== '1');
    if (date) rows = rows.filter((r) => String(r.received_at || '').startsWith(date));
    if (latest) {
      const last = {};
      rows.forEach((r) => { const k = r.pid || r.session_id; const t = String(r.received_at || '') + String(r.started_at || ''); if (!last[k] || t > last[k].t) last[k] = { t, s: r.session_id }; });
      rows = rows.filter((r) => last[r.pid || r.session_id].s === r.session_id);
    }
    // 同じ行の重複を除く
    const seen = new Set();
    rows = rows.filter((r) => { const k = r.row_id || r.session_id + '-' + r.trial; if (seen.has(k)) return false; seen.add(k); return true; });
    return rows.map((r) => ({
      ...r,
      c: String(r.cooperate) === '1' ? 1 : 0,
      e: String(r.expect_cooperate) === '1' ? 1 : String(r.expect_cooperate) === '0' ? 0 : null,
      cat: r.teacher_primary || r.ai_primary || '未分類',
      mind: r.ai_mind || '未分類',
      hiddenRow: String(r.hidden) === '1',
    }));
  }
  const comboOf = (r) => (r.e == null ? '' : (r.e ? 'C' : 'D') + (r.c ? 'C' : 'D'));

  // ---------------- 描画 ----------------
  function stackRow(label, parts, total, onKey) {
    if (!total) return `<div class="lab">${label}</div><div class="stack"><div class="seg" style="flex:1;background:var(--surface-2)"></div></div>`;
    const segs = parts.filter((p) => p.n > 0).map((p) => {
      const w = (p.n / total) * 100;
      const on = onKey && onKey === p.fkey ? ' on' : '';
      return `<div class="seg${on}" style="flex:${p.n} 1 0;background:${p.color}" data-f="${esc(p.fkey || '')}"
        data-tip="${esc(p.tipTitle || '')}<br><b>${pct(p.n, total)}%</b>（${p.n} / ${total}）">${w >= 9 ? `<span>${Math.round(w)}%</span>` : ''}</div>`;
    }).join('');
    return `<div class="lab">${label}</div><div class="stack">${segs}</div>`;
  }
  function charLabel(id, n) { return `${img(id)}<span>${esc(CHAR[id].short)}</span><small>${n}人</small>`; }
  function legend(el, items) { $(el).innerHTML = items.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.label)}${x.sub ? `（${esc(x.sub)}）` : ''}</span>`).join(''); }
  function table(head, body) {
    return `<details class="tbl"><summary>数で見る</summary><div class="scroll"><table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${body.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></div></details>`;
  }

  function render() {
    const rows = base();
    $('body').classList.remove('hide');
    const people = new Set(rows.map((r) => r.pid || r.session_id)).size;
    const withE = rows.filter((r) => r.e != null);
    $('t-n').innerHTML = `${people}<small> 人</small>`;
    $('t-coop').innerHTML = rows.length ? `${pct(rows.filter((r) => r.c).length, rows.length)}<small> %</small>` : '–';
    $('t-exp').innerHTML = withE.length ? `${pct(withE.filter((r) => r.e).length, withE.length)}<small> %</small>` : '–';
    $('t-match').innerHTML = withE.length ? `${pct(withE.filter((r) => r.e === r.c).length, withE.length)}<small> %</small>` : '–';

    const byChar = CHARS.map((ch) => ({ ch, rs: rows.filter((r) => r.character_id === ch.id) }));

    // 1. 黙秘率と予想
    $('ch-coop').innerHTML = '<div class="hb">' + byChar.map(({ ch, rs }) => {
      const n = rs.length, k = rs.filter((r) => r.c).length;
      const es = rs.filter((r) => r.e != null), ek = es.filter((r) => r.e).length;
      const p = n ? (k / n) * 100 : 0, ep = es.length ? (ek / es.length) * 100 : null;
      const on = F.char === ch.id ? ' style="outline:2px solid var(--ink);outline-offset:2px"' : '';
      return `<div class="lab">${charLabel(ch.id, n)}</div>
        <div class="track" data-fchar="${ch.id}"${on} data-tip="<b>${esc(ch.name)}</b><br>黙秘した：${pct(k, n)}%（${k} / ${n}）${ep != null ? `<br>黙秘すると予想：${Math.round(ep)}%（${ek} / ${es.length}）` : ''}">
          <div class="mid"></div><div class="fill" style="width:${p}%"></div>
          ${ep != null ? `<div class="tick" style="left:${ep}%"></div>` : ''}
          <div class="val" style="${p > 84 ? `right:${100 - p + 1.5}%;color:#fff` : `left:calc(${p}% + 8px)`}">${n ? Math.round(p) + '%' : ''}</div>
        </div>`;
    }).join('') + '</div><div class="hb" style="margin-top:2px"><div></div><div class="axis"><span>0%</span><span>50%</span><span>100%</span></div></div>' +
      table(['相棒', '人数', '黙秘', '黙秘率', '黙秘と予想', '考えた時間（中央値・秒）'], byChar.map(({ ch, rs }) => {
        const es = rs.filter((r) => r.e != null);
        const rt = rs.map((r) => Number(r.rt_ms)).filter((x) => x > 0).sort((a, b) => a - b);
        return [ch.name, rs.length, rs.filter((r) => r.c).length, pct(rs.filter((r) => r.c).length, rs.length) + '%', es.length ? pct(es.filter((r) => r.e).length, es.length) + '%' : '–', rt.length ? (rt[Math.floor(rt.length / 2)] / 1000).toFixed(1) : '–'];
      }));

    // 2. 予想×選択
    legend('lg-combo', COMBO);
    $('ch-combo').innerHTML = '<div class="hb">' + byChar.map(({ ch, rs }) => {
      const es = rs.filter((r) => r.e != null);
      return stackRow(charLabel(ch.id, es.length), COMBO.map((cb) => ({ n: es.filter((r) => comboOf(r) === cb.key).length, color: cb.color, fkey: 'combo:' + cb.key + ':' + ch.id, tipTitle: `<b>${esc(ch.short)}</b>　${cb.label}（${cb.sub}）` })), es.length, F.combo && 'combo:' + F.combo + ':' + F.char);
    }).join('') + '</div>' + table(['相棒'].concat(COMBO.map((c) => c.label)), byChar.map(({ ch, rs }) => [ch.name].concat(COMBO.map((cb) => rs.filter((r) => comboOf(r) === cb.key).length))));

    // 3. 理由の分類
    const catItems = CAT_KEYS.concat(rows.some((r) => r.cat === '未分類') ? ['未分類'] : []);
    legend('lg-cat', catItems.map((k) => ({ label: k, color: CAT_COLOR[k] })));
    $('ch-cat').innerHTML = '<div class="hb">' + byChar.map(({ ch, rs }) =>
      stackRow(charLabel(ch.id, rs.length), catItems.map((k) => ({ n: rs.filter((r) => r.cat === k).length, color: CAT_COLOR[k], fkey: 'cat:' + k + ':' + ch.id, tipTitle: `<b>${esc(ch.short)}</b>　${k}` })), rs.length, F.cat && 'cat:' + F.cat + ':' + F.char)
    ).join('') + '</div>' + table(['相棒'].concat(catItems), byChar.map(({ ch, rs }) => [ch.name].concat(catItems.map((k) => rs.filter((r) => r.cat === k).length))));

    const byChoice = [{ k: 'silent', l: '黙秘した', rs: rows.filter((r) => r.c) }, { k: 'confess', l: '自白した', rs: rows.filter((r) => !r.c) }];
    $('ch-catchoice').innerHTML = '<div class="hb">' + byChoice.map((g) =>
      stackRow(`<span>${g.l}</span><small>${g.rs.length}件</small>`, catItems.map((k) => ({ n: g.rs.filter((r) => r.cat === k).length, color: CAT_COLOR[k], fkey: 'catc:' + k + ':' + g.k, tipTitle: `<b>${g.l}</b>　${k}` })), g.rs.length, F.cat && F.choice && 'catc:' + F.cat + ':' + F.choice)
    ).join('') + '</div>';
    const classified = rows.filter((r) => r.ai_primary || r.teacher_primary);
    $('ch-catany').innerHTML = '<div class="hb">' + CAT_KEYS.map((k) => {
      const n = classified.filter((r) => r.cat === k || String(r.ai_tags || '').split(',').includes(k)).length;
      const p = classified.length ? (n / classified.length) * 100 : 0;
      return `<div class="lab"><span>${k}</span></div><div class="track" data-tip="<b>${k}</b> を含む理由<br>${Math.round(p)}%（${n} / ${classified.length}）"><div class="fill" style="width:${p}%;background:${CAT_COLOR[k]}"></div><div class="val" style="left:calc(${p}% + 8px)">${Math.round(p)}%</div></div>`;
    }).join('') + '</div>';

    // 4. 心の知覚
    const mindItems = MIND_KEYS.concat(rows.some((r) => r.mind === '未分類') ? ['未分類'] : []);
    legend('lg-mind', mindItems.map((k) => ({ label: k, color: MIND_COLOR[k] })));
    $('ch-mind').innerHTML = '<div class="hb">' + byChar.map(({ ch, rs }) =>
      stackRow(charLabel(ch.id, rs.length), mindItems.map((k) => ({ n: rs.filter((r) => r.mind === k).length, color: MIND_COLOR[k], fkey: 'mind:' + k + ':' + ch.id, tipTitle: `<b>${esc(ch.short)}</b>　${k}` })), rs.length, F.mind && 'mind:' + F.mind + ':' + F.char)
    ).join('') + '</div>' + table(['相棒'].concat(mindItems), byChar.map(({ ch, rs }) => [ch.name].concat(mindItems.map((k) => rs.filter((r) => r.mind === k).length))));

    renderFilters(catItems, mindItems);
    renderCards(rows);
    if (TEACHER) renderRoster();
  }

  // ---------------- 理由カード ----------------
  function chips(el, key, items) {
    $(el).innerHTML = items.map((x) => `<button class="chip${F[key] === x.v ? ' on' : ''}" data-k="${key}" data-v="${esc(x.v)}">${x.color ? `<i style="background:${x.color}"></i>` : ''}${esc(x.l)}</button>`).join('');
  }
  function renderFilters(catItems, mindItems) {
    chips('fl-char', 'char', [{ v: '', l: 'すべての相棒' }].concat(CHARS.map((c) => ({ v: c.id, l: c.short }))));
    chips('fl-choice', 'choice', [{ v: '', l: '黙秘も自白も' }, { v: 'silent', l: '黙秘した' }, { v: 'confess', l: '自白した' }].concat(F.combo ? [{ v: 'combo', l: '組み合わせ：' + COMBO.find((c) => c.key === F.combo).label }] : []));
    chips('fl-cat', 'cat', [{ v: '', l: 'すべての分類' }].concat(catItems.map((k) => ({ v: k, l: k, color: CAT_COLOR[k] }))));
    chips('fl-mind', 'mind', [{ v: '', l: '心の知覚：すべて' }].concat(mindItems.map((k) => ({ v: k, l: k, color: MIND_COLOR[k] }))));
    if (F.combo) document.querySelector('#fl-choice [data-v="combo"]').classList.add('on');
  }
  function renderCards(rows) {
    const showHidden = TEACHER && $('f-hidden').checked;
    let rs = rows.filter((r) => r.reason && (showHidden || !r.hiddenRow));
    if (F.char) rs = rs.filter((r) => r.character_id === F.char);
    if (F.combo) rs = rs.filter((r) => comboOf(r) === F.combo);
    else if (F.choice) rs = rs.filter((r) => (F.choice === 'silent' ? r.c : !r.c));
    if (F.cat) rs = rs.filter((r) => r.cat === F.cat);
    if (F.mind) rs = rs.filter((r) => r.mind === F.mind);
    rs.sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)) || Number(a.trial) - Number(b.trial));
    $('card-count').textContent = `${rs.length}件`;
    const list = rs.slice(0, shown);
    $('cards').innerHTML = list.length ? list.map(card).join('') : '<div class="empty">当てはまる理由はまだありません。</div>';
    $('more').classList.toggle('hide', rs.length <= shown);
  }
  function card(r) {
    let j = {}; try { j = JSON.parse(r.ai_json || '{}'); } catch (e) {}
    const tags = (j.tags || []).filter((t) => t.label !== r.cat);
    const choice = r.c ? '<span class="pill">黙秘</span>' : '<span class="pill">自白</span>';
    const exp = r.e == null ? '' : `<span class="sub">予想：相棒は${r.e ? '黙秘' : '自白'}</span>`;
    const teacherMark = r.teacher_primary ? '（先生）' : '';
    const ai = r.cat === '未分類'
      ? '<div class="ai">AIの分類待ち</div>'
      : `<div class="ai"><span class="pill cat" style="background:${CAT_COLOR[r.cat]};${r.cat === '判定不能' ? 'color:var(--ink)' : ''}">${esc(r.cat)}${teacherMark}</span>
        ${tags.map((t) => `<span class="pill sub" data-tip="${esc(t.why || '')}">${esc(t.label)}</span>`).join(' ')}
        ${r.ai_bias ? `<span class="pill sub">${esc(r.ai_bias)}</span>` : ''}
        ${r.mind && r.mind !== '未分類' ? `<span class="pill sub" data-tip="${esc(j.mind_why || '')}">心：${esc(r.mind)}</span>` : ''}
        ${j.primary_why ? `<div style="margin-top:4px">${esc(j.primary_why)}</div>` : ''}
        ${r.ai_comment ? `<div style="margin-top:4px"><b>AI：</b>${esc(r.ai_comment)}</div>` : ''}</div>`;
    const tc = TEACHER ? `<div class="tc">
        <select data-edit="${esc(r.row_id)}"><option value="">分類を直す…</option>${CAT_KEYS.map((k) => `<option ${r.teacher_primary === k ? 'selected' : ''}>${k}</option>`).join('')}${r.teacher_primary ? '<option value="__clear">（AIの分類に戻す）</option>' : ''}</select>
        <button data-hide="${esc(r.row_id)}" data-on="${r.hiddenRow ? 0 : 1}">${r.hiddenRow ? '表示に戻す' : '学生から隠す'}</button>
        <span class="sub">${esc(r.student_id || '')}</span></div>` : '';
    return `<div class="rc${r.hiddenRow ? ' hid' : ''}"><div class="top">${img(r.character_id)}<b style="color:var(--ink)">${esc(CHAR[r.character_id].short)}</b>${choice}${exp}<span style="margin-left:auto">${esc(r.nickname || '')}</span></div>
      <div class="rs">${esc(r.reason)}</div>${ai}${tc}</div>`;
  }

  // ---------------- 操作 ----------------
  document.addEventListener('click', async (e) => {
    const chip = e.target.closest('.chip');
    if (chip) {
      const k = chip.dataset.k, v = chip.dataset.v;
      if (k === 'choice') { F.combo = ''; F.choice = v === 'combo' ? '' : (F.choice === v ? '' : v); }
      else F[k] = F[k] === v ? '' : v;
      shown = 30; render(); return;
    }
    const seg = e.target.closest('[data-f]');
    if (seg && seg.dataset.f) {
      const [kind, key, who] = seg.dataset.f.split(':');
      const same = (kind === 'combo' && F.combo === key && F.char === who) || (kind === 'cat' && F.cat === key && F.char === who) ||
        (kind === 'mind' && F.mind === key && F.char === who) || (kind === 'catc' && F.cat === key && F.choice === who);
      Object.assign(F, { char: '', choice: '', cat: '', mind: '', combo: '' });
      if (!same) {
        if (kind === 'combo') Object.assign(F, { combo: key, char: who });
        if (kind === 'cat') Object.assign(F, { cat: key, char: who });
        if (kind === 'mind') Object.assign(F, { mind: key, char: who });
        if (kind === 'catc') Object.assign(F, { cat: key, choice: who });
      }
      shown = 30; render();
      if (!same) $('cards').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const tr = e.target.closest('[data-fchar]');
    if (tr) { F.char = F.char === tr.dataset.fchar ? '' : tr.dataset.fchar; shown = 30; render(); return; }
    const hb = e.target.closest('[data-hide]');
    if (hb) {
      hb.disabled = true;
      const j = await C.call('teacherEdit', { password: PW, row_id: hb.dataset.hide, hidden: hb.dataset.on === '1' });
      if (!j.ok) setStatus('ng', '保存できませんでした：' + j.error);
      return load();
    }
  });
  document.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-edit]');
    if (sel) {
      if (!sel.value) return;
      sel.disabled = true;
      const j = await C.call('teacherEdit', { password: PW, row_id: sel.dataset.edit, teacher_primary: sel.value === '__clear' ? '' : sel.value });
      if (!j.ok) setStatus('ng', '保存できませんでした：' + j.error);
      return load();
    }
    if (['f-test', 'f-latest', 'f-date', 'f-hidden'].includes(e.target.id)) render();
  });
  $('more').onclick = () => { shown += 30; render(); };

  $('loginbtn').onclick = () => { PW = $('pw').value; ss.set('pd_pw', PW); $('loginmsg').textContent = ''; load(); };
  $('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginbtn').click(); });

  let busy = false;
  async function classifyAll() {
    if (busy) return; busy = true;
    $('clsbtn').disabled = $('reclsbtn').disabled = true;
    let total = 0, fails = 0;
    try {
      for (;;) {
        $('clsmsg').className = 'status'; $('clsmsg').textContent = `分類中…（${total}件おわり）`;
        let j;
        try { j = await C.call('classifyPending', { password: PW, limit: 10 }); } catch (e) { j = { ok: false, error: String(e) }; }
        if (!j.ok) { if (++fails >= 3) { $('clsmsg').className = 'status ng'; $('clsmsg').textContent = 'エラー：' + j.error; break; } await C.sleep(3000); continue; }
        fails = 0; total += j.done;
        if (!j.remaining || !j.done) { $('clsmsg').className = 'status ok'; $('clsmsg').textContent = total === 0 && !j.remaining ? '未分類の理由はありません' : `完了：${total}件を分類しました${j.remaining ? `（${j.remaining}件は分類できませんでした）` : ''}`; break; }
        if (total % 30 === 0) load();
      }
    } finally { busy = false; $('clsbtn').disabled = $('reclsbtn').disabled = false; load(); }
  }
  $('clsbtn').onclick = classifyAll;
  let reclsArmed = 0;
  $('reclsbtn').onclick = async () => {
    if (Date.now() - reclsArmed > 4000) { reclsArmed = Date.now(); $('reclsbtn').textContent = 'もう一度押すと、すべて未分類に戻して分類し直します'; setTimeout(() => ($('reclsbtn').textContent = 'すべて分類し直す'), 4000); return; }
    reclsArmed = 0; $('reclsbtn').textContent = 'すべて分類し直す';
    if (C.DEMO) { await C.call('reclassifyAll', { password: PW }); return load(); }
    const j = await C.call('reclassifyAll', { password: PW });
    if (!j.ok) { $('clsmsg').textContent = 'エラー：' + j.error; return; }
    classifyAll();
  };

  // ---------------- CSV ----------------
  function download(name, cols, rows) {
    const q = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const csv = '﻿' + [cols.join(',')].concat(rows.map((r) => cols.map((c) => q(r[c])).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  $('dl-long').onclick = () => {
    const rows = base();
    const cols = Object.keys(RAW[0] || {}).filter((k) => !['pid'].includes(k)).concat(['category_final']);
    download(`pd_long_${stamp()}.csv`, cols, rows.map((r) => ({ ...r, category_final: r.cat })));
  };
  $('dl-wide').onclick = () => {
    const rows = base();
    const by = {};
    rows.forEach((r) => {
      const k = r.session_id;
      by[k] = by[k] || { student_id: r.student_id, nickname: r.nickname, session_id: r.session_id, attempt: r.attempt, started_at: r.started_at, comp_correct: r.comp_correct, device: r.device };
      const o = by[k], id = r.character_id;
      Object.assign(o, { ['coop_' + id]: r.c, ['expect_' + id]: r.e == null ? '' : r.e, ['order_' + id]: r.trial, ['rt_' + id]: r.rt_ms, ['cat_' + id]: r.cat, ['mind_' + id]: r.mind, ['reason_' + id]: r.reason });
    });
    const cols = ['student_id', 'nickname', 'session_id', 'attempt', 'started_at', 'comp_correct', 'device'];
    ['coop', 'expect', 'order', 'rt', 'cat', 'mind', 'reason'].forEach((p) => CHARS.forEach((c) => cols.push(p + '_' + c.id)));
    download(`pd_wide_${stamp()}.csv`, cols, Object.values(by));
  };
  function rosterRows() {
    const by = {};
    RAW.filter((r) => String(r.is_test) !== '1').forEach((r) => {
      const k = r.student_id || r.pid;
      by[k] = by[k] || { student_id: r.student_id, nickname: r.nickname, sessions: new Set(), trials: 0, first: r.received_at, last: r.received_at };
      const o = by[k]; o.sessions.add(r.session_id); o.trials++; o.nickname = r.nickname;
      if (r.received_at < o.first) o.first = r.received_at; if (r.received_at > o.last) o.last = r.received_at;
    });
    return Object.values(by).map((o) => ({ ...o, plays: o.sessions.size })).sort((a, b) => String(a.student_id).localeCompare(String(b.student_id)));
  }
  $('dl-roster').onclick = () => download(`pd_roster_${stamp()}.csv`, ['student_id', 'nickname', 'plays', 'trials', 'first', 'last'], rosterRows());
  function renderRoster() {
    const rs = rosterRows();
    $('roster').innerHTML = '<tr><th>学籍番号</th><th>ニックネーム</th><th>プレイ回数</th><th>選択の数</th><th>最初の送信</th><th>最後の送信</th></tr>' +
      rs.map((o) => `<tr><td>${esc(o.student_id)}</td><td style="text-align:left">${esc(o.nickname)}</td><td>${o.plays}</td><td>${o.trials}</td><td>${esc(o.first)}</td><td>${esc(o.last)}</td></tr>`).join('');
  }

  // ---------------- 起動・自動更新 ----------------
  load();
  const sec = Number(CFG.AUTO_REFRESH_SEC || 0);
  if (sec > 0) setInterval(() => {
    const a = document.activeElement;
    if (busy || document.hidden || (a && /SELECT|INPUT|TEXTAREA/.test(a.tagName))) return;
    load();
  }, sec * 1000);
  window.PD_RESULTS = { load, F };
})();
