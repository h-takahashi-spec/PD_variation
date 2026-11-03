// ===== キャラクター定義（すべてプリミティブで組み立てたオリジナル造形） =====
// 各キャラは原点に座っている前提（+Z方向＝カメラ側を向く）。机の天板は y=0.75。
(function () {
  const T = THREE;

  const mat = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.0, ...o });
  const glow = (color, intensity = 1.2) => new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

  function add(parent, geo, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const m = new T.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const sph = (r, s = 32) => new T.SphereGeometry(r, s, Math.max(12, s / 2));
  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s = 24) => new T.CylinderGeometry(rt, rb, h, s);
  const cap = (r, l) => new T.CapsuleGeometry(r, l, 8, 16);

  // 目（白目＋黒目＋ハイライト）
  function eye(parent, x, y, z, r = 0.045, pupil = 0x1a1a1a) {
    const g = new T.Group();
    g.position.set(x, y, z);
    add(g, sph(r, 20), mat(0xffffff, { roughness: 0.3 }));
    add(g, sph(r * 0.62, 20), mat(pupil, { roughness: 0.2 }), 0, 0, r * 0.55);
    add(g, sph(r * 0.2, 10), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 }), r * 0.22, r * 0.25, r * 0.95);
    parent.add(g);
    return g;
  }

  // 机の上に置く腕（左右）
  function armsOnTable(parent, sleeveMat, handMat, shoulderY, shoulderX, opts = {}) {
    const hands = [];
    [-1, 1].forEach((s) => {
      const upper = add(parent, cap(opts.r || 0.085, 0.32), sleeveMat, s * shoulderX, shoulderY - 0.2, 0.05);
      upper.rotation.x = 0.5;
      const fore = add(parent, cap((opts.r || 0.085) * 0.9, 0.3), sleeveMat, s * (shoulderX - 0.05), 0.82, 0.3);
      fore.rotation.x = Math.PI / 2;
      fore.rotation.z = s * 0.35;
      const hand = add(parent, sph(opts.hand || 0.075, 16), handMat, s * (shoulderX - 0.17), 0.82, 0.5, 1, 0.75, 1.1);
      hands.push(hand);
    });
    return hands;
  }

  // まばたき制御
  function makeBlinker(eyes) {
    let next = 1.5 + Math.random() * 2.5;
    let closing = 0;
    return (t, dt) => {
      next -= dt;
      if (next <= 0) { closing = 0.14; next = 2.5 + Math.random() * 3.5; }
      let s = 1;
      if (closing > 0) { closing -= dt; s = 0.12; }
      eyes.forEach((e) => (e.scale.y = s));
    };
  }

  // ---------------- 1. こわそうなヤクザ ----------------
  function yakuza() {
    const g = new T.Group();
    const suit = mat(0x1b1d22, { roughness: 0.5 });
    const shirt = mat(0x6b1d3a, { roughness: 0.45 });
    const skin = mat(0xc49270);
    const black = mat(0x0b0b0d, { roughness: 0.25, metalness: 0.4 });
    const gold = mat(0xd4a017, { metalness: 0.9, roughness: 0.25 });

    const body = new T.Group(); g.add(body);
    add(body, box(0.95, 0.75, 0.5), suit, 0, 1.15, -0.05);
    add(body, box(0.3, 0.5, 0.05), shirt, 0, 1.28, 0.21);              // 開襟シャツ
    const chain = add(body, new T.TorusGeometry(0.13, 0.014, 8, 32, Math.PI), gold, 0, 1.47, 0.2);
    chain.rotation.z = Math.PI;
    add(body, cyl(0.11, 0.12, 0.15), skin, 0, 1.58, 0);
    const head = new T.Group(); head.position.set(0, 1.82, 0); body.add(head);
    add(head, sph(0.25), skin, 0, 0, 0, 1, 1.05, 1);
    add(head, sph(0.262), black, 0, 0.05, -0.03, 1, 0.85, 1).scale.set(1.0, 0.82, 0.98); // オールバック
    // サングラス
    add(head, box(0.15, 0.075, 0.03), black, -0.095, 0.03, 0.23);
    add(head, box(0.15, 0.075, 0.03), black, 0.095, 0.03, 0.23);
    add(head, box(0.06, 0.015, 0.02), black, 0, 0.05, 0.24);
    // 眉間のしわ風・への字口
    const mouth = add(head, new T.TorusGeometry(0.06, 0.012, 8, 20, Math.PI), mat(0x5a2a22), 0, -0.13, 0.225);
    mouth.rotation.z = 0;
    // 頬の傷
    const scar = add(head, box(0.012, 0.11, 0.01), mat(0x8a4a42), 0.13, -0.04, 0.2);
    scar.rotation.z = 0.5;
    add(head, sph(0.04, 12), skin, -0.25, 0, 0); add(head, sph(0.04, 12), skin, 0.25, 0, 0); // 耳
    const hands = armsOnTable(body, suit, skin, 1.45, 0.42, { r: 0.1, hand: 0.085 });
    add(body, new T.TorusGeometry(0.03, 0.01, 8, 16), gold, -0.25, 0.86, 0.5).rotation.x = Math.PI / 2; // 指輪

    return {
      group: g,
      update(t) {
        body.scale.y = 1 + Math.sin(t * 1.4) * 0.006;
        head.rotation.y = Math.sin(t * 0.35) * 0.12;
        head.rotation.x = 0.06;
        // 机をトントン叩く右手
        const tap = Math.max(0, Math.sin(t * 9)) * (Math.sin(t * 0.8) > 0.2 ? 1 : 0);
        hands[1].position.y = 0.82 + tap * 0.05;
      },
    };
  }

  // ---------------- 2. 優しそうな女性 ----------------
  function woman() {
    const g = new T.Group();
    const cardigan = mat(0xd98f8a);
    const blouse = mat(0xfaf6ef);
    const skin = mat(0xf1d2bc);
    const hair = mat(0x5b3a2a, { roughness: 0.55 });
    const dark = mat(0x3a2a24);

    const body = new T.Group(); g.add(body);
    add(body, cap(0.3, 0.35), cardigan, 0, 1.15, -0.05, 1.15, 1, 0.8);
    add(body, box(0.18, 0.4, 0.05), blouse, 0, 1.22, 0.2);
    add(body, cyl(0.075, 0.085, 0.14), skin, 0, 1.55, 0);
    const head = new T.Group(); head.position.set(0, 1.78, 0); body.add(head);
    add(head, sph(0.23), skin, 0, 0, 0, 0.95, 1.05, 1);
    add(head, sph(0.25), hair, 0, 0.04, -0.04, 1, 1, 1);               // 頭髪
    add(head, box(0.48, 0.55, 0.14), hair, 0, -0.28, -0.1);             // 背中に流れる長い髪
    add(head, sph(0.12, 16), hair, -0.12, 0.13, 0.13, 1.2, 0.6, 0.7);   // 前髪
    add(head, sph(0.1, 16), hair, 0.13, 0.15, 0.12, 1.2, 0.5, 0.7);
    // にっこり目（アーチ）
    [-0.08, 0.08].forEach((x) => {
      const a = add(head, new T.TorusGeometry(0.035, 0.009, 8, 16, Math.PI), dark, x, 0.0, 0.215);
    });
    add(head, sph(0.035, 12), mat(0xf4a6a0), -0.13, -0.06, 0.18, 1, 0.6, 0.4);
    add(head, sph(0.035, 12), mat(0xf4a6a0), 0.13, -0.06, 0.18, 1, 0.6, 0.4);
    const smile = add(head, new T.TorusGeometry(0.045, 0.01, 8, 16, Math.PI), mat(0xc0605a), 0, -0.1, 0.21);
    smile.rotation.z = Math.PI;
    // 机の上で組んだ手
    [-1, 1].forEach((s) => {
      const fore = add(body, cap(0.075, 0.3), cardigan, s * 0.2, 0.83, 0.25);
      fore.rotation.x = Math.PI / 2; fore.rotation.z = s * 0.7;
    });
    add(body, sph(0.08, 16), skin, 0, 0.83, 0.42, 1.4, 0.7, 1);
    return {
      group: g,
      update(t) {
        body.scale.y = 1 + Math.sin(t * 1.2) * 0.006;
        head.rotation.z = Math.sin(t * 0.6) * 0.08 + 0.06;
        head.rotation.x = 0.04 + Math.sin(t * 0.4) * 0.03;
      },
    };
  }

  // ---------------- 3. 宇宙人 ----------------
  function alien() {
    const g = new T.Group();
    const skin = mat(0x8fd19e, { roughness: 0.45 });
    const suit = mat(0xb9c2d0, { metalness: 0.7, roughness: 0.3 });
    const eyeMat = mat(0x050608, { roughness: 0.05, metalness: 0.6 });

    const body = new T.Group(); g.add(body);
    add(body, cap(0.2, 0.35), suit, 0, 1.12, -0.05, 1, 1, 0.8);
    add(body, cyl(0.045, 0.05, 0.3), skin, 0, 1.5, 0);
    const head = new T.Group(); head.position.set(0, 1.85, 0); body.add(head);
    add(head, sph(0.32), skin, 0, 0, 0, 1, 1.15, 0.95);
    add(head, sph(0.2), skin, 0, -0.2, 0.05, 0.75, 0.8, 0.8);          // あご
    const eyes = [];
    [-1, 1].forEach((s) => {
      const e = add(head, sph(0.1, 24), eyeMat, s * 0.13, -0.02, 0.24, 0.85, 1.35, 0.45);
      e.rotation.z = s * -0.55;
      eyes.push(e);
      add(head, sph(0.018, 8), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1 }), s * 0.12 + 0.03, 0.04, 0.29);
    });
    add(head, box(0.05, 0.006, 0.01), mat(0x3d6b47), 0, -0.24, 0.24);
    const antennas = [];
    [-1, 1].forEach((s) => {
      const a = new T.Group(); a.position.set(s * 0.12, 0.3, 0); head.add(a);
      add(a, cyl(0.01, 0.012, 0.3, 8), skin, 0, 0.15, 0);
      add(a, sph(0.04, 16), glow(0xff5ce1, 1.5), 0, 0.32, 0);
      a.rotation.z = s * -0.3;
      antennas.push(a);
    });
    // 細い腕と三本指
    [-1, 1].forEach((s) => {
      const fore = add(body, cap(0.04, 0.42), skin, s * 0.24, 0.85, 0.22);
      fore.rotation.x = Math.PI / 2; fore.rotation.z = s * 0.25;
      for (let i = -1; i <= 1; i++) {
        const f = add(body, cap(0.012, 0.09), skin, s * 0.18 + i * 0.03, 0.78, 0.5);
        f.rotation.x = Math.PI / 2;
      }
    });
    return {
      group: g,
      update(t) {
        head.rotation.z = Math.sin(t * 0.9) * 0.06;
        head.position.y = 1.85 + Math.sin(t * 1.3) * 0.015;
        antennas.forEach((a, i) => (a.rotation.z = (i ? 0.3 : -0.3) + Math.sin(t * 4 + i) * 0.15));
      },
    };
  }

  // ---------------- 4. かわいいロボット ----------------
  function robot() {
    const g = new T.Group();
    const white = mat(0xf7f8fa, { roughness: 0.25 });
    const screen = mat(0x14202a, { roughness: 0.15 });
    const accent = mat(0xffb84d, { roughness: 0.4 });
    const cyan = glow(0x5ee7ff, 1.6);

    const body = new T.Group(); g.add(body);
    add(body, sph(0.32), white, 0, 1.08, -0.02, 1, 1.05, 0.9);
    add(body, sph(0.06, 16), accent, 0, 1.12, 0.28);                     // おなかのボタン
    const head = new T.Group(); head.position.set(0, 1.62, 0); body.add(head);
    add(head, sph(0.3), white, 0, 0, 0, 1.25, 0.95, 1);
    add(head, sph(0.23), screen, 0, -0.01, 0.2, 1.25, 0.85, 0.55);       // 顔の画面
    const eyes = [];
    [-0.11, 0.11].forEach((x) => eyes.push(add(head, sph(0.045, 16), cyan, x, 0.02, 0.32, 0.8, 1.2, 0.4)));
    const m = add(head, new T.TorusGeometry(0.035, 0.01, 8, 16, Math.PI), cyan, 0, -0.06, 0.325);
    m.rotation.z = Math.PI;
    add(head, sph(0.03, 12), mat(0xff9fb2, { emissive: 0xff9fb2, emissiveIntensity: 0.5 }), -0.19, -0.06, 0.305, 1.2, 0.6, 0.4);
    add(head, sph(0.03, 12), mat(0xff9fb2, { emissive: 0xff9fb2, emissiveIntensity: 0.5 }), 0.19, -0.06, 0.305, 1.2, 0.6, 0.4);
    add(head, cyl(0.07, 0.07, 0.05), accent, -0.37, 0, 0).rotation.z = Math.PI / 2;  // 耳
    add(head, cyl(0.07, 0.07, 0.05), accent, 0.37, 0, 0).rotation.z = Math.PI / 2;
    add(head, cyl(0.012, 0.012, 0.15, 8), white, 0, 0.35, 0);
    const bulb = add(head, sph(0.05, 16), glow(0xff6b6b, 1.5), 0, 0.45, 0);
    [-1, 1].forEach((s) => {
      const arm = add(body, cap(0.07, 0.2), white, s * 0.3, 0.86, 0.25);
      arm.rotation.x = Math.PI / 2.4; arm.rotation.z = s * 0.3;
      add(body, sph(0.07, 16), accent, s * 0.26, 0.82, 0.42);
    });
    const blink = makeBlinker(eyes);
    return {
      group: g,
      update(t, dt) {
        body.position.y = Math.abs(Math.sin(t * 2.2)) * 0.03;
        head.rotation.z = Math.sin(t * 1.1) * 0.12;
        bulb.material.emissiveIntensity = 0.8 + (Math.sin(t * 5) > 0 ? 1.2 : 0);
        blink(t, dt);
      },
    };
  }

  // ---------------- 5. 柴犬 ----------------
  function shiba() {
    const g = new T.Group();
    const fur = mat(0xd98a3d, { roughness: 0.85 });
    const cream = mat(0xf6ead6, { roughness: 0.9 });
    const black = mat(0x151515, { roughness: 0.3 });
    const pink = mat(0xef7f91);

    const body = new T.Group(); g.add(body);
    add(body, box(0.6, 0.12, 0.6), mat(0x8c5a8c), 0, 0.62, -0.1);         // 座布団
    add(body, sph(0.3), fur, 0, 0.98, -0.1, 0.95, 1.15, 1);
    add(body, sph(0.2), cream, 0, 1.0, 0.1, 0.9, 1.3, 0.6);                // 胸
    const head = new T.Group(); head.position.set(0, 1.42, 0.02); body.add(head);
    add(head, sph(0.24), fur, 0, 0, 0, 1.08, 0.95, 1);
    add(head, sph(0.14), cream, 0, -0.07, 0.17, 1.15, 0.8, 0.9);           // マズル
    add(head, sph(0.1), cream, -0.12, -0.08, 0.12);                        // 頬
    add(head, sph(0.1), cream, 0.12, -0.08, 0.12);
    add(head, sph(0.04, 16), black, 0, -0.03, 0.3, 1.2, 0.85, 0.9);        // 鼻
    const eyes = [];
    [-0.09, 0.09].forEach((x) => {
      eyes.push(add(head, sph(0.032, 16), black, x, 0.06, 0.2));
      add(head, sph(0.03, 12), cream, x * 1.1, 0.13, 0.19, 1.2, 0.5, 0.5); // まろ眉
    });
    const ears = [];
    [-1, 1].forEach((s) => {
      const ear = new T.Group(); ear.position.set(s * 0.14, 0.18, -0.02); head.add(ear);
      add(ear, new T.ConeGeometry(0.08, 0.17, 3), fur, 0, 0.07, 0);
      add(ear, new T.ConeGeometry(0.045, 0.1, 3), mat(0xf2b9a0), 0, 0.05, 0.03);
      ear.rotation.z = s * -0.25;
      ears.push(ear);
    });
    const tongue = add(head, box(0.06, 0.012, 0.07), pink, 0, -0.16, 0.25);
    // 前足（机の上にちょこん）
    [-1, 1].forEach((s) => {
      const leg = add(body, cap(0.06, 0.28), fur, s * 0.13, 0.86, 0.22);
      leg.rotation.x = 1.0;
      add(body, sph(0.07, 16), cream, s * 0.13, 0.8, 0.4, 1, 0.7, 1.2);
    });
    // 巻き尾
    const tail = new T.Group(); tail.position.set(0, 1.15, -0.38); body.add(tail);
    const tt = add(tail, new T.TorusGeometry(0.1, 0.05, 12, 24, Math.PI * 1.6), fur, 0, 0.08, 0);
    tt.rotation.y = Math.PI / 2;
    const blink = makeBlinker(eyes);
    return {
      group: g,
      update(t, dt) {
        tail.rotation.z = Math.sin(t * 10) * 0.35;
        head.rotation.z = Math.sin(t * 0.7) * 0.15;
        ears.forEach((e, i) => (e.rotation.x = Math.sin(t * 3 + i * 2) > 0.92 ? -0.25 : 0));
        tongue.scale.z = 1 + Math.sin(t * 7) * 0.3;
        body.scale.y = 1 + Math.sin(t * 7) * 0.008;
        blink(t, dt);
      },
    };
  }

  // ---------------- 6. 無機的なコンピュータ ----------------
  function computer() {
    const g = new T.Group();
    const casing = mat(0x3b4047, { roughness: 0.5, metalness: 0.5 });
    const dark = mat(0x16191d, { roughness: 0.4, metalness: 0.3 });

    // 端末画面（CanvasTexture で文字を描く）
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 384;
    const ctx = cv.getContext('2d');
    const tex = new T.CanvasTexture(cv);
    const screenMat = new T.MeshBasicMaterial({ map: tex });
    let lastDraw = -1;
    function draw(t) {
      ctx.fillStyle = '#031208'; ctx.fillRect(0, 0, 512, 384);
      ctx.fillStyle = '#39ff7a'; ctx.font = 'bold 30px monospace';
      const lines = ['UNIT-07  STATUS: DETAINED', 'INPUT ......... WAIT', 'MODE .......... DECISION', ''];
      lines.forEach((l, i) => ctx.fillText(l, 24, 60 + i * 46));
      ctx.fillText('> ' + (Math.floor(t * 2) % 2 ? '█' : ' '), 24, 60 + 4 * 46);
      for (let y = 0; y < 384; y += 4) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, y, 512, 2); }
      tex.needsUpdate = true;
    }
    draw(0);

    add(g, box(0.9, 0.25, 0.7), casing, 0, 0.88, -0.05);               // 台座（机の上）
    add(g, box(0.86, 0.72, 0.62), casing, 0, 1.36, -0.1);              // 本体
    add(g, box(0.72, 0.52, 0.02), dark, 0, 1.38, 0.215);
    const scr = add(g, new T.PlaneGeometry(0.66, 0.48), screenMat, 0, 1.38, 0.228);
    scr.castShadow = false;
    const leds = [];
    for (let i = 0; i < 5; i++) leds.push(add(g, sph(0.015, 8), glow(i === 0 ? 0x39ff7a : 0xff3b30, 1), -0.35 + i * 0.05, 0.95, 0.31));
    for (let i = 0; i < 6; i++) add(g, box(0.3, 0.012, 0.01), dark, 0.22, 0.9 + i * 0.012 - 0.03, 0.305); // 吸気口
    add(g, box(0.86, 0.06, 0.06), dark, 0, 1.75, -0.1);
    return {
      group: g,
      update(t) {
        const k = Math.floor(t * 2);
        if (k !== lastDraw) { lastDraw = k; draw(t); }
        leds.forEach((l, i) => (l.material.emissiveIntensity = Math.sin(t * (3 + i * 1.7) + i) > 0.3 ? 1.6 : 0.1));
      },
    };
  }

  // ---------------- 7. 子ども ----------------
  function child() {
    const g = new T.Group();
    const shirt = mat(0xf3c94a);
    const skin = mat(0xf6d5bf);
    const hair = mat(0x2e221c, { roughness: 0.6 });

    const body = new T.Group(); g.add(body);
    add(body, box(0.5, 0.18, 0.5), mat(0x5c84c4), 0, 0.68, -0.1);         // 補助座面
    add(body, cap(0.2, 0.18), shirt, 0, 0.98, -0.05, 1.1, 1, 0.85);
    add(body, box(0.18, 0.05, 0.02), mat(0xffffff), 0, 1.08, 0.15);        // シャツの模様
    const head = new T.Group(); head.position.set(0, 1.4, 0); body.add(head);
    add(head, sph(0.25), skin, 0, 0, 0);
    add(head, sph(0.262), hair, 0, 0.07, -0.03, 1, 0.82, 1);
    add(head, sph(0.1, 16), hair, 0, 0.17, 0.15, 1.8, 0.5, 0.8);           // 前髪
    const eyes = [eye(head, -0.085, -0.01, 0.21, 0.05), eye(head, 0.085, -0.01, 0.21, 0.05)];
    add(head, sph(0.045, 12), mat(0xf59d8f), -0.15, -0.09, 0.18, 1, 0.65, 0.4);
    add(head, sph(0.045, 12), mat(0xf59d8f), 0.15, -0.09, 0.18, 1, 0.65, 0.4);
    add(head, sph(0.022, 10), mat(0xb4544a), 0, -0.12, 0.235, 1.2, 0.7, 0.5); // 小さな口
    add(head, sph(0.05, 12), skin, -0.25, -0.02, 0); add(head, sph(0.05, 12), skin, 0.25, -0.02, 0);
    [-1, 1].forEach((s) => {
      const arm = add(body, cap(0.055, 0.2), shirt, s * 0.2, 0.86, 0.18);
      arm.rotation.x = 1.1; arm.rotation.z = s * 0.3;
      add(body, sph(0.055, 12), skin, s * 0.15, 0.8, 0.35);
    });
    const blink = makeBlinker(eyes);
    return {
      group: g,
      update(t, dt) {
        body.rotation.z = Math.sin(t * 1.6) * 0.03;
        head.rotation.y = Math.sin(t * 0.5) * 0.25;
        head.rotation.x = -0.05;
        blink(t, dt);
      },
    };
  }

  // ---------------- 説明用：あなた／相棒（マネキン）、取調官 ----------------
  function mannequin(color, opts = {}) {
    const g = new T.Group();
    const m = mat(color, { roughness: 0.5, ...(opts.mat || {}) });
    add(g, cap(0.26, 0.4), m, 0, 1.15, -0.05, 1.1, 1, 0.8);
    add(g, sph(0.22), m, 0, 1.75, 0);
    [-1, 1].forEach((s) => {
      const fore = add(g, cap(0.07, 0.32), m, s * 0.22, 0.83, 0.25);
      fore.rotation.x = Math.PI / 2; fore.rotation.z = s * 0.5;
    });
    return { group: g, update(t) { g.children[1].rotation.y = Math.sin(t * 0.5) * 0.2; } };
  }

  function detective() {
    const g = new T.Group();
    const coat = mat(0x6b5440);
    const skin = mat(0xd8b094);
    add(g, cyl(0.24, 0.32, 1.2), coat, 0, 0.75, 0);
    add(g, cap(0.24, 0.3), coat, 0, 1.45, 0, 1.15, 1, 0.8);
    add(g, sph(0.2), skin, 0, 1.92, 0);
    add(g, cyl(0.3, 0.3, 0.03), mat(0x2b2b2b), 0, 2.07, 0);
    add(g, cyl(0.17, 0.2, 0.17), mat(0x2b2b2b), 0, 2.16, 0);
    return g;
  }

  window.PD_CHARACTERS = [
    {
      id: 'yakuza', name: 'こわそうなヤクザ', short: 'ヤクザ', build: yakuza,
      line: 'おい。2人とも黙ってりゃ、1年で済むんだ。……黙っとこうや。',
    },
    {
      id: 'woman', name: '優しそうな女性', short: '女性', build: woman,
      line: '2人とも黙っていれば、1年で済むんですって。……黙っていましょうね。',
    },
    {
      id: 'alien', name: '宇宙人', short: '宇宙人', build: alien,
      line: 'ピ…ギュルル……［翻訳］フタリ トモ 黙秘 スレバ 1年。黙秘 シヨウ。',
    },
    {
      id: 'robot', name: 'かわいいロボット', short: 'ロボット', build: robot,
      line: 'ふたりとも だまってたら、1ねんで すむんだって！ だまってようね。ピポ♪',
    },
    {
      id: 'shiba', name: '柴犬', short: '柴犬', build: shiba,
      line: 'くぅん……（「2人とも黙っていれば1年で済む。黙っていよう」と言いたげな目で、じっとこちらを見ている）',
    },
    {
      id: 'computer', name: '無機的なコンピュータ', short: 'コンピュータ', build: computer,
      line: '> 双方黙秘時ノ刑期：各1年。\n> 提案：双方、黙秘セヨ。',
    },
    {
      id: 'child', name: '子ども', short: '子ども', build: child,
      line: 'ふたりとも だまってたら、1年で おうちに かえれるんだよね……？ だまってようね。',
    },
  ];
  window.PD_EXTRA = { mannequin, detective };
})();
