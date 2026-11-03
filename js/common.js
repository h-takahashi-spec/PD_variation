// ===== 共通：分類の定義・通信・デモモード =====
(function () {
  const CFG = window.PD_CONFIG || {};

  // 理由の分類（gas/Code.gs の SYSTEM_PROMPT と名前・並びをそろえてください）
  const CATS = [
    { key: '合理的', desc: '刑期の比較や、相棒の出方の予測にもとづく損得の計算' },
    { key: '感情的', desc: '恐れ・不安・同情・かわいそう・好き嫌いなど、気持ちが判断の中心' },
    { key: '規範的', desc: '信頼・約束・仲間を裏切るべきでない、など「こうあるべき」' },
    { key: '認知バイアス', desc: 'ステレオタイプ・擬人化・フォールス・コンセンサスなど、思考のくせ' },
    { key: '判定不能', desc: '短すぎる・ゲームと関係がない、など' },
  ];
  // 理由が相棒の「心」のどこに触れているか（Gray らの心の知覚の2次元）
  const MIND = [
    { key: '意図・能力', desc: '相棒の考え・意図・ルールの理解・信用できるか（エージェンシー）' },
    { key: '感情・痛み', desc: '相棒がつらい・かわいそう・守ってあげたい（エクスペリエンス）' },
    { key: '両方', desc: '両方に触れている' },
    { key: 'なし', desc: '相棒の心には触れていない' },
  ];

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------- 通信 ----------------
  const DEMO = !CFG.GAS_URL;
  async function call(action, payload = {}) {
    if (DEMO) return Demo.handle(action, payload);
    const body = JSON.stringify({ action, ...payload });
    const res = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    return res.json();
  }

  // ---------------- デモ（ブラウザ内の擬似サーバ） ----------------
  // 本物の Code.gs と同じ動きをまねます。分類はキーワードによる簡易判定です。
  const Demo = (() => {
    const KEY = 'pd_demo_db_v2';
    const PASS = 'demo';
    function db() { let d = store.get(KEY, null); if (!d) { d = seed(); store.set(KEY, d); } return d; }
    function save(d) { store.set(KEY, d); }
    function pid(sid) { let h = 2166136261; for (const c of 'demo' + sid) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return 'p' + (h >>> 0).toString(16).slice(0, 8); }
    function pub(r) {
      const o = { ...r, pid: pid(r.student_id), is_test: /^TEST/i.test(r.student_id) ? 1 : 0 };
      delete o.student_id; delete o.user_agent; delete o.screen;
      return o;
    }
    function classify(r) {
      const t = r.reason || '';
      const has = (re) => re.test(t);
      const sc = {
        '合理的': (has(/年|刑期|得|損|確率|計算|リスク|最悪|有利|どちらにしても|期待値|自白した方/) ? 2 : 0) + (has(/裏切(り|る)そう|自白しそう|黙秘しそう|信用でき|予想/) ? 1 : 0),
        '感情的': has(/怖|こわ|かわいそう|可哀想|かわいい|可愛|好き|嫌|不安|心配|守りたい|泣|つらい|罪悪感|気持ち/) ? 2 : 0,
        '規範的': has(/裏切りたくない|裏切れない|約束|信じ|べき|仲間|正直|誠実|筋|ルール/) ? 2 : 0,
        '認知バイアス': has(/っぽい|ぽい|見た目|だから.*(裏切|自白)|ヤクザは|機械は|子どもは|犬は|宇宙人は/) ? 1.5 : 0,
      };
      const ranked = Object.entries(sc).sort((a, b) => b[1] - a[1]);
      const primary = t.length < 8 || ranked[0][1] === 0 ? '判定不能' : ranked[0][0];
      const tags = ranked.slice(1).filter(([, v]) => v > 0).slice(0, 2).map(([k]) => ({ label: k, why: '（デモ）キーワードから判定' }));
      const ag = has(/裏切|信用|信頼|分かって|わかって|理解|考え|意図|頭|計算|プログラム|ランダム/);
      const ex = has(/かわいそう|可哀想|つらい|痛|泣|守り|怖がら|かわいい|可愛/);
      const mind = ag && ex ? '両方' : ag ? '意図・能力' : ex ? '感情・痛み' : 'なし';
      const bias = primary === '認知バイアス' || tags.some((x) => x.label === '認知バイアス') ? (has(/犬|宇宙人|ロボット/) ? '擬人化' : 'ステレオタイプ') : '';
      const comment = {
        '合理的': '刑期の損得から考えていますね。相棒の見た目は、その計算にどう入りましたか？',
        '感情的': '相棒への気持ちが判断を動かしていますね。同じ刑期でも、相手が違えば気持ちも変わるでしょうか。',
        '規範的': '「こうあるべき」が軸になっていますね。その規範は、どの相棒にも同じように当てはまりましたか？',
        '認知バイアス': '見た目からの印象が予想を形づくっていそうです。実際の相棒の選択と比べてみましょう。',
        '判定不能': 'もう少しくわしく書くと、自分の考え方が見えてきます。',
      }[primary];
      const json = { primary, primary_why: '（デモ）キーワードから判定', tags, bias, mind, mind_why: '（デモ）キーワードから判定', comment };
      return { ai_primary: primary, ai_tags: tags.map((x) => x.label).join(','), ai_bias: bias, ai_mind: mind, ai_comment: comment, ai_json: JSON.stringify(json), ai_model: 'demo-keyword', ai_at: new Date().toISOString().slice(0, 19).replace('T', ' ') };
    }
    async function handle(action, p) {
      await sleep(250 + Math.random() * 300);
      const d = db();
      const isT = p.password === PASS;
      if (action === 'ping') return { ok: true, demo: true };
      if (action === 'submit') {
        const have = new Set(d.map((r) => r.row_id));
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        let n = 0;
        (p.rows || []).forEach((r) => { if (!have.has(r.row_id)) { d.push({ ...r, received_at: now, hidden: '', teacher_primary: '' }); n++; } });
        save(d);
        return { ok: true, n };
      }
      if (action === 'classify') {
        const rs = d.filter((r) => r.session_id === p.session_id && !r.ai_primary && r.reason);
        rs.forEach((r) => Object.assign(r, classify(r)));
        save(d);
        return { ok: true, results: d.filter((r) => r.session_id === p.session_id).map(pub) };
      }
      if (action === 'results') {
        const rows = isT ? d.map((r) => ({ ...r, pid: pid(r.student_id), is_test: /^TEST/i.test(r.student_id) ? 1 : 0 })) : d.filter((r) => r.hidden !== '1').map(pub);
        if (p.password && !isT) return { ok: false, error: 'unauthorized' };
        return { ok: true, rows, teacher: isT, fetched_at: new Date().toLocaleTimeString(), demo: true };
      }
      if (!isT) return { ok: false, error: 'unauthorized' };
      if (action === 'classifyPending') {
        const todo = d.filter((r) => !r.ai_primary && r.reason);
        todo.slice(0, p.limit || 10).forEach((r) => Object.assign(r, classify(r)));
        save(d);
        return { ok: true, done: Math.min(todo.length, p.limit || 10), remaining: Math.max(0, todo.length - (p.limit || 10)) };
      }
      if (action === 'teacherEdit') {
        const r = d.find((x) => x.row_id === p.row_id);
        if (!r) return { ok: false, error: 'not found' };
        if ('teacher_primary' in p) r.teacher_primary = p.teacher_primary || '';
        if ('hidden' in p) r.hidden = p.hidden ? '1' : '';
        save(d);
        return { ok: true };
      }
      if (action === 'reclassifyAll') { d.forEach((r) => { if (r.reason) Object.assign(r, classify(r)); }); save(d); return { ok: true }; }
      return { ok: false, error: 'unknown action' };
    }

    // サンプル回答（架空）
    function seed() {
      let s = 7;
      const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const chars = [['yakuza', 'こわそうなヤクザ', 0.3], ['woman', '優しそうな女性', 0.68], ['alien', '宇宙人', 0.4], ['robot', 'かわいいロボット', 0.62], ['shiba', '柴犬', 0.72], ['computer', '無機的なコンピュータ', 0.45], ['child', '子ども', 0.8]];
      const R = {
        yakuza: { C: ['怖いけど、ここで裏切ったら後で何をされるかわからないので黙秘した', 'ヤクザは仲間を裏切らないという筋を大事にしていそうだから黙秘'],
                  D: ['ヤクザっぽいので平気で裏切りそう。自分が10年になるのは避けたい', 'どうせ相手は自白するだろうから、自白しておけば最悪でも5年で済む', '見た目が怖くて信用できなかったので自白した'] },
        woman:  { C: ['優しそうで、約束を守ってくれそうな感じがしたので信じて黙秘した', '裏切って相手に10年を背負わせるのは心が痛むので黙秘'],
                  D: ['優しそうに見える人ほど裏では何を考えているかわからないので自白', '相手がどうしても自白した方が刑期は短くなるので自白'] },
        alien:  { C: ['翻訳を通してでも黙秘しようと提案してきたので、それを信じてみた', '宇宙人にも仲間意識はあると思うので黙秘'],
                  D: ['宇宙人の考えていることは全く予想できないので、自白して安全をとった', 'ルールを理解しているのか怪しいので自白して5年以内におさえる'] },
        robot:  { C: ['かわいいロボットは嘘をつかなそうだし、プログラム通り黙秘しそう', 'ロボットを裏切るのはかわいそうな気がしたので黙秘'],
                  D: ['ロボットは合理的に計算して自白を選びそうなので自白', 'どちらを選んでも自白したほうが刑期が短いので自白'] },
        shiba:  { C: ['柴犬がかわいそうで、10年も入れられるのは見ていられないので黙秘', 'じっと見つめてくる目がまっすぐで、裏切れなかった'],
                  D: ['犬は取引の意味をわかっていないと思うので、自分のことを優先して自白', '犬なら罪に問われても大丈夫そうな気がして自白した'] },
        computer: { C: ['コンピュータは提案した通りに実行しそうなので、黙秘が一番得', '論理的に黙秘を提案しているので、最適解として黙秘を選ぶはずだと思った'],
                  D: ['機械は感情がないので平気で自白しそう。裏切られて10年はいやだ', '支配戦略は自白なので、コンピュータならそれを選ぶと考えて自白'] },
        child:  { C: ['子どもを裏切るなんてできない。おうちに帰してあげたい', '子どもは素直なので約束を守ってくれると思い黙秘した', '大人として子どもを守るべきだと思ったので黙秘'],
                  D: ['子どもは怖くなってすぐ話してしまいそうなので、自白しておいた', 'どうせすぐ泣いて全部話しそうだから自白するしかない'] },
      };
      const nick = ['ねこ', 'たぬき', 'ポチ', 'すし', 'りんご', 'うさぎ', 'ゆず', 'こむぎ', 'まめ', 'ハル', 'そら', 'もち', 'くま', 'ペンギン', 'みかん', 'ラテ', 'つくし', 'トマト', 'カエル', 'ひよこ', 'いるか', 'のり', 'あんず', 'きなこ'];
      const out = [];
      nick.forEach((nk, i) => {
        const sid = '2024A' + String(100 + i);
        const sess = 'demo' + i;
        const coopBias = (rnd() - 0.5) * 0.5;
        const order = chars.slice().sort(() => rnd() - 0.5);
        order.forEach(([id, name, p], k) => {
          const c = rnd() < p + coopBias ? 1 : 0;
          const e = rnd() < (c ? 0.82 : 0.25) ? 1 : 0;
          const pc = rnd() < 0.5 ? 1 : 0;
          const my = c ? (pc ? 1 : 10) : (pc ? 0 : 5);
          const r = {
            row_id: sess + '-' + (k + 1), session_id: sess, student_id: sid, nickname: nk, attempt: 1, trial: k + 1,
            character_id: id, character_name: name, choice: c ? 'silent' : 'confess', cooperate: c,
            expect: e ? 'silent' : 'confess', expect_cooperate: e, reason: pick(R[id][c ? 'C' : 'D']),
            rt_ms: Math.round(2500 + rnd() * 9000), rt_first_ms: Math.round(1500 + rnd() * 4000), changed_mind: rnd() < 0.15 ? 1 : 0, viewed_table: rnd() < 0.3 ? 1 : 0,
            rt_reason_ms: Math.round(12000 + rnd() * 30000), partner_choice: pc ? 'silent' : 'confess', partner_cooperate: pc, my_years: my, partner_years: pc ? (c ? 1 : 10) : (c ? 0 : 5),
            comp_answer: 0, comp_correct: 1, device: rnd() < 0.7 ? 'smartphone' : 'pc', started_at: '2026-11-10 10:4' + (i % 10) + ':00',
            received_at: '2026-11-10 10:5' + (i % 10) + ':00', hidden: '', teacher_primary: '', app_version: 'demo',
          };
          r.reason_len = r.reason.length;
          Object.assign(r, classify(r));
          out.push(r);
        });
      });
      return out;
    }
    return { handle, reset() { try { localStorage.removeItem(KEY); } catch (e) {} } };
  })();

  window.PD_COMMON = { CATS, MIND, DEMO, call, store, sleep, Demo };
})();
