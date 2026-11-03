// ===== 3D の舞台：2つの取調室、カメラ演出、刑期ブロック =====
(function () {
  const T = THREE;
  const ROOM_A = -2.5; // あなたの部屋（x中心）
  const ROOM_B = 2.5;  // 相棒の部屋

  const World = {};
  let renderer, scene, camera, container;
  let clock = new T.Clock();
  let time = 0;
  const updaters = [];
  const labels = []; // {el, obj, offset}
  let camTween = null;
  const camLook = new T.Vector3(0, 1, 0);
  let mode = 'overview';

  const rooms = {};
  let partnerSlot, currentPartner = null;
  let youFigure, partnerSilhouette;

  let blockGeo, blockMat;
  function mat(c, o = {}) { return new T.MeshStandardMaterial({ color: c, roughness: 0.85, ...o }); }

  function buildRoom(cx, key) {
    const room = new T.Group(); room.position.x = cx; scene.add(room);
    const W = 4.8, D = 5.2, H = 2.8;
    const floor = new T.Mesh(new T.PlaneGeometry(W, D), mat(0x34373b));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; room.add(floor);
    const wallMat = mat(0x6a6f74);
    const back = new T.Mesh(new T.BoxGeometry(W, H, 0.15), wallMat);
    back.position.set(0, H / 2, -D / 2); back.receiveShadow = true; room.add(back);
    // 床の目地
    for (let i = -2; i <= 2; i++) {
      const l = new T.Mesh(new T.BoxGeometry(W, 0.005, 0.02), mat(0x2a2c2f));
      l.position.set(0, 0.003, i); room.add(l);
    }
    // 外側の壁（仕切りでない側）
    const side = new T.Mesh(new T.BoxGeometry(0.15, H, D), wallMat);
    side.position.set(key === 'A' ? -W / 2 : W / 2, H / 2, 0); side.receiveShadow = true; room.add(side);
    // ドア
    const door = new T.Mesh(new T.BoxGeometry(0.05, 2.0, 0.9), mat(0x4a5560, { metalness: 0.4, roughness: 0.5 }));
    door.position.set(key === 'A' ? -W / 2 + 0.1 : W / 2 - 0.1, 1.0, 1.2); room.add(door);
    // 机と椅子
    const table = new T.Group(); room.add(table);
    const top = new T.Mesh(new T.BoxGeometry(1.7, 0.06, 1.0), mat(0x8a7a66, { roughness: 0.6 }));
    top.position.set(0, 0.75, 0.2); top.castShadow = top.receiveShadow = true; table.add(top);
    [[-0.78, -0.25], [0.78, -0.25], [-0.78, 0.65], [0.78, 0.65]].forEach(([x, z]) => {
      const leg = new T.Mesh(new T.BoxGeometry(0.05, 0.72, 0.05), mat(0x3d3d3d, { metalness: 0.6 }));
      leg.position.set(x, 0.36, z); leg.castShadow = true; table.add(leg);
    });
    const chair = new T.Mesh(new T.BoxGeometry(0.55, 0.9, 0.08), mat(0x2d3a48));
    chair.position.set(0, 1.0, -0.62); chair.castShadow = true; room.add(chair);
    const seat = new T.Mesh(new T.BoxGeometry(0.55, 0.06, 0.5), mat(0x2d3a48));
    seat.position.set(0, 0.5, -0.4); room.add(seat);
    // 机の上の調書
    const paper = new T.Mesh(new T.BoxGeometry(0.3, 0.005, 0.4), mat(0xf2efe6));
    paper.position.set(0.55, 0.785, 0.4); paper.rotation.y = -0.3; room.add(paper);
    // 吊り下げランプ
    const shade = new T.Mesh(new T.ConeGeometry(0.28, 0.25, 24, 1, true), mat(0x1f2328, { side: T.DoubleSide, metalness: 0.5 }));
    shade.position.set(0, 2.35, 0.1); room.add(shade);
    const cord = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.6), mat(0x111111));
    cord.position.set(0, 2.75, 0.1); room.add(cord);
    const bulb = new T.Mesh(new T.SphereGeometry(0.07, 16, 8), new T.MeshBasicMaterial({ color: 0xfff1c9 }));
    bulb.position.set(0, 2.23, 0.1); room.add(bulb);
    const spot = new T.SpotLight(0xfff0d0, 1.5, 9, Math.PI / 4.2, 0.45, 1.2);
    spot.position.set(0, 2.25, 0.1); spot.target.position.set(0, 0.7, 0.0);
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005;
    room.add(spot); room.add(spot.target);
    // 刑期ブロックの置き場
    const years = new T.Group(); years.position.set(key === 'A' ? -1.3 : 1.3, 0, 0.2); room.add(years);
    // 監視カメラ
    const cam = new T.Mesh(new T.BoxGeometry(0.22, 0.12, 0.12), mat(0xdedede));
    cam.position.set(key === 'A' ? -2.1 : 2.1, 2.5, -2.3); cam.rotation.y = key === 'A' ? 0.7 : -0.7; room.add(cam);
    const rec = new T.Mesh(new T.SphereGeometry(0.02, 8, 8), new T.MeshBasicMaterial({ color: 0xff2020 }));
    rec.position.set(key === 'A' ? -2.02 : 2.02, 2.5, -2.22); room.add(rec);
    updaters.push((t) => (rec.visible = Math.sin(t * 4) > 0));

    // 取調官
    const det = PD_EXTRA.detective();
    det.position.set(key === 'A' ? 1.2 : -1.2, 0, -1.25);
    det.rotation.y = key === 'A' ? -0.9 : 0.9;
    det.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    room.add(det);

    // 正面からのやわらかい補助光（顔が見えるように）
    const front = new T.PointLight(0xc9d6ff, 0.45, 7, 1.5);
    front.position.set(0, 1.9, 2.4); room.add(front);
    rooms[key] = { group: room, spot, bulb, years, detective: det, cx, lampParts: [shade, cord, bulb] };
    return room;
  }

  World.init = function (el) {
    container = el;
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    el.appendChild(renderer.domElement);

    scene = new T.Scene();
    scene.background = new T.Color(0x0d0f12);
    camera = new T.PerspectiveCamera(42, 1, 0.1, 100);

    scene.add(new T.HemisphereLight(0x8fa3b8, 0x1b1d20, 0.42));
    const fill = new T.DirectionalLight(0x9db4ff, 0.25); fill.position.set(0, 6, 8); scene.add(fill);

    buildRoom(ROOM_A, 'A');
    buildRoom(ROOM_B, 'B');
    // 仕切り壁（相談できない）
    const wall = new T.Mesh(new T.BoxGeometry(0.4, 2.8, 5.2), mat(0x7b8086));
    wall.position.set(0, 1.4, 0); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
    World.divider = wall;
    // 外の床
    const ground = new T.Mesh(new T.PlaneGeometry(40, 30), mat(0x15171a));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);

    // あなた
    youFigure = PD_EXTRA.mannequin(0x7aa7d9);
    youFigure.group.position.set(ROOM_A, 0, -0.35);
    youFigure.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(youFigure.group); updaters.push((t) => youFigure.update(t));
    // 相棒（シルエット）
    partnerSilhouette = PD_EXTRA.mannequin(0x22252a, { mat: { roughness: 1 } });
    partnerSilhouette.group.position.set(ROOM_B, 0, -0.35);
    partnerSilhouette.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(partnerSilhouette.group); updaters.push((t) => partnerSilhouette.update(t + 2));

    partnerSlot = new T.Group(); partnerSlot.position.set(ROOM_B, 0, -0.35); scene.add(partnerSlot);

    blockGeo = new T.BoxGeometry(0.42, 0.2, 0.42);
    blockMat = new T.MeshStandardMaterial({ color: 0xd8483c, emissive: 0x7a1510, emissiveIntensity: 0.6, roughness: 0.5 });
    World.setOverview(true);
    World.resize();
    // 途中でカクつかないよう、使うマテリアルを先にコンパイルしておく
    try {
      const warm = new T.Group();
      warm.add(new T.Mesh(blockGeo, blockMat));
      PD_CHARACTERS.forEach((d) => { const c = d.build(); c.group.position.set(ROOM_B, -20, 0); warm.add(c.group); });
      scene.add(warm); renderer.compile(scene, camera); scene.remove(warm);
    } catch (e) {}
    window.addEventListener('resize', World.resize);
    if (window.ResizeObserver) new ResizeObserver(World.resize).observe(container);
    loop();
  };

  World.resize = function () {
    if (!renderer) return;
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!camTween) applyModeCamera(true);
  };

  // 画面の縦横比に合わせたカメラ位置
  function overviewPose() {
    // 横幅（±4.2）と高さが画面に収まる距離を計算する
    const a = camera.aspect;
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    const d = Math.max(9.5, (a < 1 ? 5.0 : 4.3) / (tanH * a));
    const look = new T.Vector3(0, a < 1 ? 0.6 : 1.0, a < 1 ? -1.3 : -0.1);
    const dir = new T.Vector3(0, a < 1 ? 1.5 : 0.55, 1).normalize(); // 縦長画面ではより真上から
    return { pos: look.clone().addScaledVector(dir, d), look };
  }
  function partnerPose() {
    const a = camera.aspect;
    const k = a < 0.8 ? Math.min(2.0, 0.8 / a) : 1;
    return { pos: new T.Vector3(ROOM_B, 1.7 + 0.15 * (k - 1), 2.9 * k + 0.2), look: new T.Vector3(ROOM_B, 1.3, -0.5) };
  }
  function roomPose(cx) {
    const a = camera.aspect;
    const k = a < 1 ? Math.min(2.2, 1.0 / a) : 1;
    return { pos: new T.Vector3(cx, 3.0 * k, 5.6 * k), look: new T.Vector3(cx, 1.0, -0.3) };
  }

  function applyModeCamera(instant) {
    let p;
    if (mode === 'overview') p = overviewPose();
    else if (mode === 'partner') p = partnerPose();
    else if (mode === 'roomA') p = roomPose(ROOM_A);
    else p = roomPose(ROOM_B);
    if (instant) { camera.position.copy(p.pos); camLook.copy(p.look); camera.lookAt(camLook); }
    return p;
  }

  World.moveCamera = function (newMode, dur = 1.6) {
    mode = newMode;
    rooms.B.lampParts.forEach((o) => (o.visible = newMode !== 'partner'));
    const p = applyModeCamera(false);
    camTween = { from: camera.position.clone(), fromLook: camLook.clone(), to: p.pos, toLook: p.look, t: 0, dur };
  };
  World.setOverview = function (instant) {
    mode = 'overview';
    if (rooms.B) rooms.B.lampParts.forEach((o) => (o.visible = true));
    applyModeCamera(instant);
  };

  // 相棒キャラクターを座らせる
  World.showPartner = function (def) {
    if (currentPartner) { partnerSlot.remove(currentPartner.group); currentPartner = null; }
    partnerSilhouette.group.visible = !def;
    if (def) {
      const c = def.build();
      c.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      partnerSlot.add(c.group);
      currentPartner = c;
    }
  };
  World.setDetectivesVisible = function (v) { rooms.A.detective.visible = v; rooms.B.detective.visible = v; };
  World.setYouVisible = function (v) { youFigure.group.visible = v; };

  // ランプの色（釈放＝明るい、長期刑＝赤く暗い）
  World.setLamp = function (key, kind) {
    const r = rooms[key];
    const c = { normal: 0xfff0d0, free: 0xd8ffe0, short: 0xffe1a8, long: 0xff5a4a }[kind] || 0xfff0d0;
    r.spot.color.setHex(c);
    r.spot.intensity = kind === 'long' ? 2.2 : kind === 'free' ? 2.4 : 1.5;
    r.bulb.material.color.setHex(c);
  };

  // 刑期ブロックを積む
  World.setYears = function (key, n, delayStep = 0.07) {
    const g = rooms[key].years;
    while (g.children.length) g.remove(g.children[0]);
    for (let i = 0; i < n; i++) {
      const b = new T.Mesh(blockGeo, blockMat);
      b.position.y = 0.11 + i * 0.22;
      b.scale.setScalar(0.001);
      b.userData.appearAt = time + i * delayStep;
      b.castShadow = true;
      g.add(b);
    }
  };
  World.clearYears = function () { World.setYears('A', 0); World.setYears('B', 0); };

  // HTML ラベルを 3D 位置に追従させる
  World.addLabel = function (el, getPos) { labels.push({ el, getPos }); };
  World.anchors = {
    roomA: () => new T.Vector3(ROOM_A, 2.9, -0.3),
    roomB: () => new T.Vector3(ROOM_B, 2.9, -0.3),
    yearsA: () => new T.Vector3(ROOM_A - 1.3, 0.35 + rooms.A.years.children.length * 0.22, 0.2),
    yearsB: () => new T.Vector3(ROOM_B + 1.3, 0.35 + rooms.B.years.children.length * 0.22, 0.2),
    wall: () => new T.Vector3(0, 3.1, 0),
  };

  World.flashWall = function () {
    const m = World.divider.material;
    m.emissive = new T.Color(0xff3b30);
    const start = time;
    const f = (t) => {
      const k = t - start;
      m.emissiveIntensity = k < 2.4 ? Math.abs(Math.sin(k * 5)) * 0.5 : 0;
      return k < 2.4;
    };
    transient.push(f);
  };
  const transient = [];

  function loop() {
    requestAnimationFrame(loop);
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    time += rawDt; // 実時間で進める（端末が遅くても演出の長さは変わらない）
    updaters.forEach((u) => u(time, dt));
    if (currentPartner) currentPartner.update(time, dt);
    for (let i = transient.length - 1; i >= 0; i--) if (!transient[i](time)) transient.splice(i, 1);
    // 刑期ブロックのポップ
    ['A', 'B'].forEach((k) => rooms[k].years.children.forEach((b) => {
      const s = time - b.userData.appearAt;
      if (s < 0) b.scale.setScalar(0.001);
      else if (s < 0.25) { const e = s / 0.25; b.scale.setScalar(Math.max(0.001, e * (1.25 - 0.25 * e))); }
      else b.scale.setScalar(1);
    }));
    if (camTween) {
      camTween.t += rawDt;
      const e = Math.min(1, camTween.t / camTween.dur);
      const s = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
      camera.position.lerpVectors(camTween.from, camTween.to, s);
      camLook.lerpVectors(camTween.fromLook, camTween.toLook, s);
      if (e >= 1) camTween = null;
    } else if (mode === 'partner') {
      // ゆっくりした手ぶれ（監視カメラ感）
      const p = partnerPose();
      camera.position.set(p.pos.x + Math.sin(time * 0.3) * 0.04, p.pos.y + Math.sin(time * 0.4) * 0.02, p.pos.z);
    }
    camera.lookAt(camLook);
    renderer.render(scene, camera);
    // ラベル
    const w = container.clientWidth, h = container.clientHeight;
    labels.forEach((l) => {
      if (l.el.style.display === 'none') return;
      const v = l.getPos().project(camera);
      const hw = (l.el.offsetWidth || 0) / 2 + 6;
      const x = Math.min(w - hw, Math.max(hw, ((v.x + 1) / 2) * w)); // 画面からはみ出さない
      l.el.style.transform = `translate(-50%, -100%) translate(${x}px, ${((1 - v.y) / 2) * h}px)`;
    });
  }

  // 結果画面用のキャラクターサムネイル
  World.thumbnails = function (defs, size = 256) {
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(size, size);
    r.outputEncoding = T.sRGBEncoding;
    const s = new T.Scene();
    s.add(new T.HemisphereLight(0xffffff, 0x444444, 1.0));
    const d = new T.DirectionalLight(0xffffff, 0.8); d.position.set(1, 2, 3); s.add(d);
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0, 1.5, 3.2); cam.lookAt(0, 1.4, 0);
    const out = {};
    defs.forEach((def) => {
      const c = def.build();
      s.add(c.group);
      c.update(1.0, 0.016);
      r.render(s, cam);
      out[def.id] = r.domElement.toDataURL('image/png');
      s.remove(c.group);
    });
    r.dispose();
    return out;
  };

  window.PD_World = World;
})();
