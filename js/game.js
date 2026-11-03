// ===== ゲーム進行・記録・送信 =====
(function () {
  const CFG = window.PD_CONFIG;
  const P = CFG.PAYOFF;
  const CHARS = window.PD_CHARACTERS;
  const W = window.PD_World;
  const C = window.PD_COMMON;
  const MIN_REASON = CFG.MIN_REASON || 15;
  const ASK_EXPECT = CFG.ASK_EXPECT !== false;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const params = new URLSearchParams(location.search);
  const REVEAL = (params.get('reveal') || CFG.REVEAL) === 'none' ? 'none' : 'end';

  // ---------------- 端末情報 ----------------
  function deviceType() {
    const ua = navigator.userAgent;
    const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (iPad || /Tablet|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
    if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'smartphone';
    return 'pc';
  }
  function localStamp(d = new Date()) {
    const z = (n, k = 2) => String(n).padStart(k, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------------- 音（WebAudioで合成） ----------------
  const Sound = (() => {
    let ctx, master, muted = store.get('pd_muted', false);
    function init() {
      if (ctx) return;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
        // 空調のような低いうなり
        const hum = ctx.createOscillator(); hum.frequency.value = 55; hum.type = 'sine';
        const hg = ctx.createGain(); hg.gain.value = 0.035; hum.connect(hg).connect(master); hum.start();
        const n = noise(4, true); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
        const ng = ctx.createGain(); ng.gain.value = 0.05; n.connect(f).connect(ng).connect(master); n.start();
      } catch (e) { ctx = null; }
    }
    function noise(sec, loop) {
      const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
      const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = !!loop; return s;
    }
    function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slide) {
      if (!ctx) return;
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    function thud(vol = 0.6, when = 0) {
      if (!ctx) return;
      tone(90, 0.35, 'sine', vol, when, 40);
      const t = ctx.currentTime + when;
      const n = noise(0.3); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      n.connect(f).connect(g).connect(master); n.start(t);
    }
    return {
      init,
      click() { tone(880, 0.06, 'square', 0.04); },
      tick(i) { tone(420 + i * 30, 0.07, 'triangle', 0.07, i * 0.07); },
      stamp() { thud(0.8); },
      door() { thud(0.5); thud(0.35, 0.12); },
      chime() { tone(660, 0.5, 'sine', 0.12); tone(990, 0.6, 'sine', 0.08, 0.12); },
      free() { tone(523, 0.25, 'triangle', 0.1); tone(784, 0.4, 'triangle', 0.1, 0.12); },
      toggle() { muted = !muted; store.set('pd_muted', muted); if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
      get muted() { return muted; },
    };
  })();
  const muteBtn = $('mute');
  const paintMute = () => (muteBtn.textContent = Sound.muted ? '🔇 音なし' : '🔊 音あり');
  paintMute();
  muteBtn.onclick = () => { Sound.init(); Sound.toggle(); paintMute(); };

  // ---------------- 下部パネル（セリフ） ----------------
  let typing = null;
  function typeText(text) {
    const el = $('text');
    el.textContent = '';
    return new Promise((resolve) => {
      // まだ表示していない部分も透明で置いておき、パネルの高さが途中で変わらないようにする
      const shown = document.createElement('span');
      const rest = document.createElement('span'); rest.style.visibility = 'hidden';
      rest.textContent = text; el.append(shown, rest);
      let i = 0;
      const done = () => { clearInterval(iv); el.textContent = text; typing = null; resolve(); };
      const iv = setInterval(() => { i++; shown.textContent = text.slice(0, i); rest.textContent = text.slice(i); if (i >= text.length) done(); }, 26);
      typing = done;
    });
  }
  $('panel').addEventListener('click', (e) => { if (typing && !e.target.closest('button')) typing(); });

  // セリフを表示し、ボタンが押されるのを待つ
  async function say(speaker, text, buttons = [{ label: '次へ ▶', value: true, primary: true }]) {
    $('speaker').textContent = speaker || '';
    const act = $('actions'); act.innerHTML = '';
    await typeText(text);
    return new Promise((resolve) => {
      buttons.forEach((b) => {
        const el = document.createElement('button');
        el.className = 'btn' + (b.primary ? ' primary' : b.ghost ? ' ghost' : '');
        el.textContent = b.label;
        el.onclick = () => { Sound.click(); resolve(b.value); };
        act.appendChild(el);
      });
    });
  }

  // ---------------- 刑期の表（HTML） ----------------
  function bars(n) { return n === 0 ? '<span class="free">釈放</span>' : '<span class="bar">' + '<i></i>'.repeat(n) + '</span>'; }
  function cell(me, other) {
    return `<div class="cell">
      <div class="who"><b>あなた</b><span class="yr">${me ? me + '年' : '<span class="free">0年</span>'}</span>${bars(me)}</div>
      <div class="who"><b>相棒</b><span class="yr">${other ? other + '年' : '<span class="free">0年</span>'}</span>${bars(other)}</div></div>`;
  }
  function matrixHTML() {
    return `<div class="matrix">
      <div></div><div class="hd">相棒が 黙秘</div><div class="hd">相棒が 自白</div>
      <div class="rh">あなたが<br>黙秘</div>${cell(P.CC, P.CC)}${cell(P.CD, P.DC)}
      <div class="rh">あなたが<br>自白</div>${cell(P.DC, P.CD)}${cell(P.DD, P.DD)}
    </div>`;
  }

  // ---------------- ラベル ----------------
  function mkLabel(cls, text, anchor) {
    const el = document.createElement('div');
    el.className = 'lbl ' + cls; el.textContent = text; el.style.display = 'none';
    $('labels').appendChild(el);
    W.addLabel(el, anchor);
    return el;
  }
  let L = {};

  // ---------------- 状態 ----------------
  const S = {
    sessionId: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    studentId: '',
    nickname: '',
    attempt: 1,
    order: shuffle(CHARS),
    buttonOrder: Math.random() < 0.5 ? 'silent_left' : 'confess_left',
    comp: { answer: '', correct: '' },
    trials: [],
    startedAt: '',
  };

  // ---------------- 開始 ----------------
  function normalizeId(s) {
    return s.replace(/[Ａ-Ｚａ-ｚ０-９－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s+/g, '').toUpperCase();
  }
  $('sid').value = store.get('pd_last_sid', '');
  $('nick').value = store.get('pd_last_nick', '');
  $('sid').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('start').click(); });
  $('start').onclick = async () => {
    const id = normalizeId($('sid').value);
    if (!/^[A-Z0-9\-]{3,16}$/.test(id)) { $('sid-err').textContent = '学籍番号を半角英数字で入力してください。'; return; }
    $('sid-err').textContent = '';
    const nick = $('nick').value.trim().replace(/\s+/g, ' ');
    if (!nick) { $('nick-err').textContent = 'ニックネームを入れてください（本名でなくてかまいません）。'; return; }
    S.studentId = id;
    S.nickname = nick.slice(0, 12);
    store.set('pd_last_sid', id);
    store.set('pd_last_nick', S.nickname);
    const attempts = store.get('pd_attempts', {});
    S.attempt = (attempts[id] || 0) + 1; attempts[id] = S.attempt; store.set('pd_attempts', attempts);
    S.startedAt = localStamp();
    Sound.init();
    $('sc-title').classList.remove('on');
    if (params.get('skip') === '1') { S.comp = { answer: 'skip', correct: '' }; return runTrials(); } // 動作確認用
    await intro();
  };

  // ---------------- 導入（ルールの体感） ----------------
  async function showOutcome(me, other, line) {
    W.clearYears();
    await sleep(150);
    W.setYears('A', me); W.setYears('B', other);
    for (let i = 0; i < Math.max(me, other); i++) Sound.tick(i);
    if (me === 0 || other === 0) setTimeout(() => Sound.free(), Math.max(me, other) * 70);
    const lamp = (n) => (n === 0 ? 'free' : n >= 10 ? 'long' : n >= 5 ? 'long' : 'short');
    W.setLamp('A', lamp(me)); W.setLamp('B', lamp(other));
    L.yA.textContent = me ? `あなた ${me}年` : 'あなた 釈放！'; L.yA.className = 'lbl years' + (me ? '' : ' free');
    L.yB.textContent = other ? `相棒 ${other}年` : '相棒 釈放！'; L.yB.className = 'lbl years' + (other ? '' : ' free');
    L.yA.style.display = L.yB.style.display = '';
    return say('取調官', line);
  }

  async function intro() {
    const narrow = window.innerWidth < 600;
    L.you = mkLabel('you', narrow ? 'あなた' : 'あなた（取調室A）', W.anchors.roomA);
    L.partner = mkLabel('partner', narrow ? '相棒' : '相棒（取調室B）', W.anchors.roomB);
    L.wall = mkLabel('wall', narrow ? '✕ 相談できない' : '✕ 壁で隔てられ、相談できない', W.anchors.wall);
    L.yA = mkLabel('years', '', W.anchors.yearsA);
    L.yB = mkLabel('years', '', W.anchors.yearsB);

    W.setOverview(true);
    L.you.style.display = L.partner.style.display = '';
    await say('ナレーション', 'あなたと相棒は、ある事件の共犯者として逮捕された。');
    L.wall.style.display = '';
    W.flashWall();
    await say('ナレーション', '2人は別々の取調室に入れられた。\n相棒が何を話しているのか、あなたには知るすべがない。');
    L.wall.style.display = 'none';
    L.you.style.display = L.partner.style.display = 'none';
    W.moveCamera('roomA', 1.8);
    await say('取調官', '証拠が足りなくてな。……そこで取引だ。\nお前にできることは2つ。「黙秘」するか、「自白」するかだ。');
    W.moveCamera('overview', 1.6);
    await sleep(500);
    await showOutcome(P.CC, P.CC, `2人とも黙秘なら、軽い罪でしか裁けない。\n2人とも${P.CC}年だ。`);
    await showOutcome(P.DC, P.CD, `だが、お前だけが自白すれば、お前は釈放してやろう。\nそのとき黙っていた相棒は、${P.CD}年だ。`);
    await showOutcome(P.CD, P.DC, `逆に、お前が黙っているのに相棒が自白したら……\nお前が${P.CD}年。相棒は釈放だ。`);
    await showOutcome(P.DD, P.DD, `2人とも自白したら、2人とも${P.DD}年。`);
    L.yA.style.display = L.yB.style.display = 'none';
    W.clearYears(); W.setLamp('A', 'normal'); W.setLamp('B', 'normal');
    L.you.style.display = L.partner.style.display = '';
    await say('ナレーション', '相棒もまた、隣の部屋で、まったく同じ取引を持ちかけられている。');
    L.you.style.display = L.partner.style.display = 'none';
    await comprehension();
    const revealText = REVEAL === 'end'
      ? '相棒がどちらを選んだのかは、すべての取引が終わったあとに「判決」として明かされます。'
      : '相棒がどちらを選んだのかは、このゲームの中では明かされません。';
    await say('ナレーション', `これから${CHARS.length}人の相棒と、1人ずつ、一度きりの取引をします。\n相棒は毎回ちがう人物です。${revealText}`, [{ label: '取調べを始める ▶', value: true, primary: true }]);
    await runTrials();
  }

  // ---------------- 理解度チェック ----------------
  function comprehension() {
    return new Promise((resolve) => {
      $('matrix-comp').innerHTML = matrixHTML();
      const opts = $('comp-opts'); opts.innerHTML = '';
      const fb = $('comp-fb'); fb.style.display = 'none';
      [0, 1, 5, 10].forEach((y) => {
        const b = document.createElement('button');
        b.className = 'btn'; b.textContent = y === 0 ? '0年（釈放）' : y + '年';
        b.onclick = () => {
          if (S.comp.answer !== '') return;
          S.comp.answer = y; S.comp.correct = y === P.DC ? 1 : 0;
          [...opts.children].forEach((c) => (c.disabled = true));
          b.classList.add('primary');
          fb.style.display = '';
          fb.innerHTML = (S.comp.correct ? '<b class="free">正解です。</b>' : `<b style="color:#ff8f84">ちがいます。</b>正解は <b>${P.DC}年（釈放）</b> です。`) +
            `<p class="small" style="margin:6px 0 0">自分だけが自白すれば、自分は釈放（${P.DC}年）。そのとき相棒は${P.CD}年です。</p>` +
            '<div style="margin-top:12px;text-align:right"><button class="btn primary" id="comp-next">次へ ▶</button></div>';
          $('comp-next').onclick = () => { Sound.click(); $('sc-comp').classList.remove('on'); resolve(); };
        };
        opts.appendChild(b);
      });
      $('sc-comp').classList.add('on');
      $('sc-comp').scrollTop = 0;
    });
  }

  // ---------------- 本番 ----------------
  function paintProgress(i) {
    const p = $('progress'); p.innerHTML = '';
    S.order.forEach((_, k) => { const d = document.createElement('i'); if (k < i) d.className = 'done'; if (k === i) d.className = 'now'; p.appendChild(d); });
    p.classList.add('on');
  }
  setInterval(() => { $('clock').textContent = new Date().toTimeString().slice(0, 8); }, 1000);

  let THUMBS = {};
  async function runTrials() {
    try { THUMBS = W.thumbnails(S.order, 160); } catch (e) { THUMBS = {}; }
    for (let i = 0; i < S.order.length; i++) {
      const def = S.order[i];
      $('fade').classList.add('on');
      await sleep(700);
      W.setDetectivesVisible(false);
      W.showPartner(def);
      W.setLamp('B', 'normal');
      W.clearYears();
      W.moveCamera('partner', 0.01);
      $('monitor').classList.add('on');
      $('caseno').textContent = `取引 ${i + 1} ／ ${S.order.length}`;
      $('caseno').classList.add('on');
      paintProgress(i);
      $('speaker').textContent = ''; $('text').textContent = ''; $('actions').innerHTML = '';
      $('fade').classList.remove('on');
      Sound.door();
      await sleep(900);
      await say('モニターの中の相棒', def.line, [{ label: '次へ ▶', value: true, primary: true }]);
      const result = await decide(def, i);
      await stamp(result.choice);
      Object.assign(result, await askReason(def, result, i));
      S.trials.push(result);
    }
    await finish();
  }

  function decide(def, i) {
    return new Promise(async (resolve) => {
      $('speaker').textContent = '取調官';
      $('actions').innerHTML = '';
      await typeText('相棒の様子は、モニターで見たとおりだ。\n……さて、お前はどうする？');
      const act = $('actions');
      const silent = { key: 'silent', big: '黙 秘', sub: '何も話さない' };
      const confess = { key: 'confess', big: '自 白', sub: '相棒との犯行を話す' };
      const items = S.buttonOrder === 'silent_left' ? [silent, confess] : [confess, silent];
      act.innerHTML = `<div class="choices">${items.map((it) => `<button class="choice" data-k="${it.key}"><span class="big">${it.big}</span><span class="sub">${it.sub}</span></button>`).join('')}</div>
        <div class="decide-row"><button class="linkbtn" id="showmx">刑期の表を見る</button><button class="btn primary" id="commit" disabled>これで決める</button></div>
`;
      const mx = $('mxover');
      const t0 = performance.now();
      let first = null, sel = null, switches = 0, viewedTable = 0;
      act.querySelectorAll('.choice').forEach((b) => {
        b.onclick = () => {
          Sound.click();
          if (first === null) first = performance.now() - t0;
          if (sel && sel !== b.dataset.k) switches++;
          sel = b.dataset.k;
          act.querySelectorAll('.choice').forEach((c) => c.classList.toggle('sel', c === b));
          $('commit').disabled = false;
        };
      });
      $('showmx').onclick = () => {
        const open = !mx.classList.contains('on');
        mx.classList.toggle('on', open); mx.innerHTML = open ? matrixHTML() : '';
        $('showmx').textContent = open ? '表を閉じる' : '刑期の表を見る';
        if (open) viewedTable++;
      };
      $('commit').onclick = () => {
        if (!sel) return;
        mx.classList.remove('on'); mx.innerHTML = '';
        const rt = Math.round(performance.now() - t0);
        const partnerCoop = Math.random() < CFG.PARTNER_COOPERATE_P;
        const meC = sel === 'silent';
        const myYears = meC ? (partnerCoop ? P.CC : P.CD) : (partnerCoop ? P.DC : P.DD);
        const pYears = partnerCoop ? (meC ? P.CC : P.CD) : (meC ? P.DC : P.DD);
        resolve({
          trial: i + 1, character_id: def.id, character_name: def.name,
          choice: sel, cooperate: meC ? 1 : 0, rt_ms: rt, rt_first_ms: Math.round(first), changed_mind: switches,
          viewed_table: viewedTable,
          partner_choice: partnerCoop ? 'silent' : 'confess', partner_cooperate: partnerCoop ? 1 : 0,
          my_years: myYears, partner_years: pYears, trial_at: localStamp(),
        });
      };
    });
  }

  async function stamp(choice) {
    const st = $('stamp');
    st.querySelector('.seal').innerHTML = (choice === 'silent' ? '黙 秘' : '自 白') + '<small>供述調書に記録</small>';
    st.classList.remove('go'); void st.offsetWidth; st.classList.add('go');
    setTimeout(() => Sound.stamp(), 300);
    $('actions').innerHTML = '';
    $('speaker').textContent = '取調官';
    $('text').textContent = 'よし。……記録した。';
    await sleep(1500);
    st.classList.remove('go');
  }

  // ---------------- 予想と理由 ----------------
  function askReason(def, result, i) {
    return new Promise((resolve) => {
      const sc = $('sc-reason');
      const label = result.choice === 'silent' ? '黙秘' : '自白';
      $('rs-kicker').textContent = `供述調書　${i + 1} ／ ${S.order.length}`;
      $('rs-img').src = THUMBS[def.id] || '';
      $('rs-img').style.visibility = THUMBS[def.id] ? '' : 'hidden';
      $('rs-name').textContent = def.name;
      $('rs-choice').textContent = label;
      $('rs-choice2').textContent = `この相棒に「${label}」`;
      $('rs-min').textContent = MIN_REASON;
      $('rs-expect-box').style.display = ASK_EXPECT ? '' : 'none';
      $('rs-q2no').textContent = ASK_EXPECT ? 'Q2.' : 'Q.';
      const ta = $('rs-text'); ta.value = '';
      let expect = ASK_EXPECT ? null : '';
      const btns = sc.querySelectorAll('#rs-expect .choice');
      btns.forEach((b) => {
        b.classList.remove('sel');
        b.onclick = () => { Sound.click(); expect = b.dataset.k; btns.forEach((c) => c.classList.toggle('sel', c === b)); check(); };
      });
      const len = () => [...ta.value.trim()].length;
      function check() {
        const n = len();
        $('rs-count').textContent = n >= MIN_REASON ? `${n}文字 ✓` : `${n}文字（あと${MIN_REASON - n}文字）`;
        $('rs-count').className = 'small' + (n >= MIN_REASON ? ' ok' : '');
        $('rs-send').disabled = !(n >= MIN_REASON && expect !== null);
      }
      ta.oninput = check; check();
      const t0 = performance.now();
      $('rs-send').onclick = () => {
        if ($('rs-send').disabled) return;
        Sound.click();
        sc.classList.remove('on');
        const reason = ta.value.trim().slice(0, 400);
        resolve({
          expect: expect || '', expect_cooperate: expect === 'silent' ? 1 : expect === 'confess' ? 0 : '',
          reason, reason_len: [...reason].length, rt_reason_ms: Math.round(performance.now() - t0),
        });
      };
      sc.classList.add('on'); sc.scrollTop = 0;
    });
  }

  // ---------------- 終了・判決 ----------------
  function buildRows() {
    const base = {
      session_id: S.sessionId, student_id: S.studentId, nickname: S.nickname, attempt: S.attempt,
      comp_answer: S.comp.answer, comp_correct: S.comp.correct,
      button_order: S.buttonOrder, reveal_mode: REVEAL, partner_coop_p: CFG.PARTNER_COOPERATE_P,
      device: deviceType(), screen: `${screen.width}x${screen.height}`, user_agent: navigator.userAgent,
      started_at: S.startedAt, app_version: CFG.APP_VERSION,
    };
    return S.trials.map((t) => ({ row_id: S.sessionId + '-' + t.trial, ...base, ...t }));
  }

  async function finish() {
    $('fade').classList.add('on');
    await sleep(700);
    $('monitor').classList.remove('on'); $('caseno').classList.remove('on'); $('progress').classList.remove('on');
    W.showPartner(null); W.setDetectivesVisible(true); W.setOverview(true);
    $('fade').classList.remove('on');
    $('speaker').textContent = ''; $('text').textContent = ''; $('actions').innerHTML = '';

    const rows = buildRows();
    queueRows(rows);
    const end = $('sc-end');
    end.classList.add('on');
    sendPending();
    const nC = S.trials.filter((t) => t.cooperate).length;
    if (REVEAL === 'end') {
      $('end-lead').textContent = `あなたが黙秘したのは ${S.trials.length}人中 ${nC}人 でした。では、それぞれの相棒がどうしたのかを見てみましょう。`;
      const thumbs = W.thumbnails(S.order, 160);
      const box = $('verdicts'); box.innerHTML = '';
      let total = 0;
      for (const t of S.trials) {
        total += t.my_years;
        const div = document.createElement('div');
        div.className = 'verdict';
        const tag = (c) => (c === 'silent' ? '<span class="tag c">黙秘</span>' : '<span class="tag d">自白</span>');
        div.innerHTML = `<img alt="" src="${thumbs[t.character_id]}"><div>
          <div style="font-weight:700;margin-bottom:4px">${t.character_name}</div>
          <div class="vrow">あなた ${tag(t.choice)} 相棒 ${tag(t.partner_choice)}</div>
          <div class="vrow" style="margin-top:4px">あなた <b>${t.my_years ? t.my_years + '年' : '<span class="free">釈放</span>'}</b>${t.my_years ? bars(t.my_years) : ''}
          　相棒 <b>${t.partner_years ? t.partner_years + '年' : '<span class="free">釈放</span>'}</b></div></div>`;
        box.appendChild(div);
        await sleep(80);
        div.classList.add('show');
        t.my_years ? Sound.stamp() : Sound.free();
        await sleep(650);
      }
      $('total').textContent = `あなたの刑期の合計：${total}年`;
      Sound.chime();
    } else {
      $('end-kicker').textContent = 'おつかれさまでした';
      $('end-lead').textContent = `あなたが黙秘したのは ${S.trials.length}人中 ${nC}人 でした。相棒たちがどうしたのかは、授業で考えてみましょう。`;
    }
  }

  // ---------------- 送信（Google Apps Script） ----------------
  function queueRows(rows) {
    const q = store.get('pd_pending', {});
    q[S.sessionId] = rows; store.set('pd_pending', q);
    const all = store.get('pd_mylog', []); store.set('pd_mylog', all.concat(rows));
  }
  function setStatus(kind, msg) {
    $('send-dot').className = 'dot ' + kind; $('send-msg').textContent = msg;
    $('resend').style.display = kind === 'ng' ? '' : 'none';
  }
  async function postRows(rows) {
    try {
      const j = await C.call('submit', { rows });
      return j && j.ok ? 'ok' : 'ng';
    } catch (e) {
      if (C.DEMO) return 'ng';
      // レスポンスが読めない環境向けのフォールバック（届いたかは確認できない）
      try { await fetch(CFG.GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'submit', rows }) }); return 'maybe'; }
      catch (e2) { return 'ng'; }
    }
  }

  // 送信後：自分の理由のAI分類を表示
  let classifying = false;
  async function showMyAI() {
    const box = $('my-ai');
    if (classifying || !S.trials.length) return;
    classifying = true;
    box.innerHTML = '<div class="myai"><div class="top">AIがあなたの理由を分類しています…（30秒ほどかかることがあります）</div></div>';
    let rows = null;
    for (let k = 0; k < 3 && !rows; k++) {
      if (k) await sleep(3000 * k + Math.random() * 3000);
      try { const j = await C.call('classify', { session_id: S.sessionId }); if (j && j.ok && (j.results || []).some((r) => r.ai_primary)) rows = j.results; } catch (e) {}
    }
    classifying = false;
    if (!rows) { box.innerHTML = '<div class="myai"><div class="top">AIの分類は、あとで結果ページに出ます（いま混み合っています）。</div></div>'; return; }
    const byTrial = {}; rows.forEach((r) => (byTrial[String(r.trial)] = r));
    box.innerHTML = '<h2 style="margin-top:26px">あなたの理由は、どう分類された？</h2>' + S.trials.map((t) => {
      const r = byTrial[String(t.trial)] || {};
      let j = {}; try { j = JSON.parse(r.ai_json || '{}'); } catch (e) {}
      const main = r.teacher_primary || r.ai_primary || '未分類';
      const tags = (r.ai_tags || '').split(',').filter(Boolean).filter((x) => x !== main);
      return `<div class="myai"><div class="top"><b style="color:var(--ink)">${esc(t.character_name)}</b>
        <span class="tag ${t.choice === 'silent' ? 'c' : 'd'}">${t.choice === 'silent' ? '黙秘' : '自白'}</span>
        <span class="cat main">${esc(main)}</span>${tags.map((x) => `<span class="cat">${esc(x)}</span>`).join('')}${r.ai_bias ? `<span class="cat">${esc(r.ai_bias)}</span>` : ''}</div>
        <div class="rsn">「${esc(t.reason)}」</div>${r.ai_comment ? `<div class="cm">AI：${esc(r.ai_comment)}</div>` : ''}${j.primary_why ? `<div class="small">${esc(j.primary_why)}</div>` : ''}</div>`;
    }).join('');
  }
  let sending = false;
  async function sendPending() {
    const q = store.get('pd_pending', {});
    const ids = Object.keys(q);
    const onEnd = $('sc-end').classList.contains('on');
    if (!ids.length || sending) return;
    sending = true;
    if (onEnd) setStatus('wait', '記録を送信しています…');
    let failed = false, maybe = false;
    for (const id of ids) {
      let r = 'ng';
      for (let k = 0; k < 4 && r === 'ng'; k++) {
        if (k) await sleep(1200 * k + Math.random() * 1500); // 一斉送信が重なったときのための待機
        r = await postRows(q[id]);
      }
      if (r === 'ng') { failed = true; continue; }
      if (r === 'maybe') maybe = true;
      const q2 = store.get('pd_pending', {}); delete q2[id]; store.set('pd_pending', q2);
    }
    sending = false;
    if (onEnd) {
      if (failed) setStatus('ng', '送信できませんでした。電波のよい場所で「もう一度送信する」を押してください。');
      else if (maybe) setStatus('ok', '送信しました。');
      else setStatus('ok', C.DEMO ? '送信完了（デモモード：このブラウザの中だけに保存しました）' : '送信完了。ありがとうございました！');
      if (!failed && S.trials.length && !S.sent) {
        S.sent = true;
        store.set('pd_done', { session_id: S.sessionId, at: localStamp() });
        if (CFG.AUTO_CLASSIFY !== false) showMyAI();
      }
    }
  }
  $('resend').onclick = () => sendPending();
  window.addEventListener('online', sendPending);

  // 自分の記録をCSVで保存
  $('mycsv').onclick = () => {
    const rows = buildRows();
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const csv = '﻿' + [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `pd_${S.studentId}_${S.sessionId}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // ---------------- 起動 ----------------
  W.init($('stage'));
  $('text').textContent = '';
  // 前回送れなかった記録があれば再送
  setTimeout(sendPending, 1500);

  // デバッグ用：?debug=1 でテスト（学籍番号 TEST）として自動入力
  if (params.get('debug') === '1') { $('sid').value = 'TEST'; $('nick').value = 'テスト'; }
  window.PD_DEBUG = { S, W };
})();
