"use strict";
/* Real time 3D plant scene for plant.html (Three.js, vendored).
 *
 * Replaces the flat SVG schematic inside #plantSvg when WebGL is
 * available; plant.js falls back to the SVG when init() returns false.
 *
 * Honesty contract, same as the drawing it replaces: every number on
 * screen is written by plant.js render() into overlay label elements
 * whose ids are val_<CHANNEL>, from the recorded series in
 * data/plant.json. This file only positions those labels, drives the
 * core glow from the recorded PWR value, and animates decorative flow
 * pulses whose speed follows the recorded WRCA / WSTA flows. The
 * pulses are not measurements and are never labelled as numbers.
 */
window.Plant3D = (() => {
  const noop = { init: () => false, onStep: () => {} };
  if (!window.THREE) return noop;
  try {
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) return noop;
  } catch (e) { return noop; }

  const T = window.THREE;
  let renderer, scene, camera, coreMat, coreLight, haloMat, rotor;
  let wrap, labelLayer, W = 0, H = 0;
  const labels = [];           // {el, anchor:Vector3}
  const flowPaths = [];        // {curve, len, kind, pulses:[{mesh, off}]}
  const state = { glow: 1, glowT: 1, prim: 1, primT: 1, steam: 0.5, steamT: 0.5 };
  const cam = { az: 0.42, pol: 1.22, rad: 19.5, tAz: 0.42, tPol: 1.22, tRad: 19.5,
                target: new T.Vector3(0.1, 2.3, 0.9), auto: true };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- label definitions: same channels, same grouping as the SVG */
  const LABELS = [
    { t: "CONTAINMENT<br>(REACTOR BUILDING)", a: [-9.3, 6.0, -0.8], ax: -100, ch: ["PRB", "TRB"] },
    { t: "REACTOR PRESSURE VESSEL", a: [-6.9, 4.3, -0.4], ch: ["TF", "TAVG", "LVCR", "PWR"] },
    { t: "PRESSURIZER", a: [0.9, 5.6, -3.4], ch: ["P", "LVPZ"] },
    { t: "STEAM GENERATOR A", a: [-2.5, 7.5, 1.7], ch: ["PSGA", "LSGA", "NSGA"] },
    { t: "HOT LEG", a: [-3.3, 4.6, 0.5], ch: ["THA"] },
    { t: "COLD LEG", a: [-2.9, 1.8, 2.8], ch: ["TCA"] },
    { t: "REACTOR COOLANT PUMP", a: [-4.3, 2.85, 2.7], ch: ["WRCA"] },
    { t: "STEAM LINE", a: [3.6, 7.8, 1.7], ch: ["WSTA"] },
    { t: "TURBINE", a: [3.45, 3.3, 1.7], ch: ["TBLD"] },
    { t: "GENERATOR", a: [5.9, 3.3, 1.7], ch: [], note: "no measurement recorded" },
    { t: "CONDENSER", a: [3.45, 1.95, 4.3], ch: [], note: "no measurement recorded" },
    { t: "FEEDWATER RETURN", a: [0.2, 1.3, 4.6], ch: ["WFWA"] },
  ];

  function makeLabels() {
    labelLayer.innerHTML = "";
    labels.length = 0;
    for (const L of LABELS) {
      const el = document.createElement("div");
      el.className = "p3d-label";
      let html = `<div class="t">${L.t}</div>`;
      for (const code of L.ch) html += `<div class="v" id="val_${code}"></div>`;
      if (L.note) html += `<div class="n">${L.note}</div>`;
      el.innerHTML = html;
      labelLayer.appendChild(el);
      labels.push({ el, anchor: new T.Vector3(L.a[0], L.a[1], L.a[2]), align: L.ax === undefined ? -50 : L.ax });
    }
  }

  /* ---------- geometry helpers */
  function pipe(points, r, mat, kind, nPulses, pulseColor) {
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(p[0], p[1], p[2])));
    const geo = new T.TubeGeometry(curve, 40, r, 12, false);
    const mesh = new T.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    if (kind && nPulses > 0) {
      const pulses = [];
      const pg = new T.SphereGeometry(r * 0.42, 10, 10);
      const pm = new T.MeshBasicMaterial({ color: pulseColor });
      for (let i = 0; i < nPulses; i++) {
        const m = new T.Mesh(pg, pm);
        m.scale.set(1.9, 1, 1);
        scene.add(m);
        pulses.push({ mesh: m, off: i / nPulses });
      }
      flowPaths.push({ curve, len: curve.getLength(), kind, pulses });
    }
    return curve;
  }
  function vessel(x, z, r, y0, y1, mat, wedge) {
    const g = new T.Group();
    const bodyLen = y1 - y0;
    const body = wedge
      ? new T.Mesh(new T.CylinderGeometry(r, r, bodyLen, 40, 1, true, 1.3, Math.PI * 2 - 1.5), mat)
      : new T.Mesh(new T.CylinderGeometry(r, r, bodyLen, 40), mat);
    body.position.set(x, y0 + bodyLen / 2, z);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const top = new T.Mesh(new T.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    top.position.set(x, y1, z); top.castShadow = true;
    g.add(top);
    const bot = new T.Mesh(new T.SphereGeometry(r, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat);
    bot.position.set(x, y0, z); bot.castShadow = true;
    g.add(bot);
    const ringT = new T.Mesh(new T.TorusGeometry(r + 0.015, 0.035, 10, 48), mat);
    ringT.rotation.x = Math.PI / 2; ringT.position.set(x, y1, z);
    g.add(ringT);
    scene.add(g);
    return g;
  }

  function buildScene() {
    scene = new T.Scene();
    scene.background = new T.Color(0x060d18);
    scene.fog = new T.Fog(0x060d18, 30, 60);
    camera = new T.PerspectiveCamera(42, 1, 0.1, 200);

    /* lights */
    scene.add(new T.HemisphereLight(0xbdd7f2, 0x16233a, 0.8));
    const key = new T.DirectionalLight(0xffffff, 1.15);
    key.position.set(9, 15, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -12; key.shadow.camera.right = 12;
    key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
    key.shadow.camera.far = 45; key.shadow.bias = -0.0004;
    scene.add(key);
    const fill = new T.DirectionalLight(0x88aaff, 0.32);
    fill.position.set(-10, 6, -9);
    scene.add(fill);

    /* materials */
    const steel = new T.MeshStandardMaterial({ color: 0x9fb4c8, metalness: 0.85, roughness: 0.38 });
    const steelLight = new T.MeshStandardMaterial({ color: 0xb2c6d8, metalness: 0.85, roughness: 0.3 });
    const steelDark = new T.MeshStandardMaterial({ color: 0x5d7186, metalness: 0.8, roughness: 0.5 });
    const pipeMat = new T.MeshStandardMaterial({ color: 0xa9c2d8, metalness: 0.85, roughness: 0.28, transparent: true, opacity: 0.5 });
    const steamPipeMat = new T.MeshStandardMaterial({ color: 0xd8b489, metalness: 0.8, roughness: 0.32, transparent: true, opacity: 0.5 });
    const shellMat = new T.MeshStandardMaterial({ color: 0x6fa8c9, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false });
    const accent = new T.MeshStandardMaterial({ color: 0xc78f3d, metalness: 0.65, roughness: 0.42 });

    /* ground and pads */
    const ground = new T.Mesh(new T.CircleGeometry(19, 48),
      new T.MeshStandardMaterial({ color: 0x0a1524, metalness: 0.1, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    const grid = new T.GridHelper(36, 36, 0x1d3a5f, 0x122540);
    grid.position.y = 0.01;
    grid.material.transparent = true; grid.material.opacity = 0.35;
    scene.add(grid);
    const padMat = new T.MeshStandardMaterial({ color: 0x11223c, metalness: 0.2, roughness: 0.9 });
    const pad1 = new T.Mesh(new T.CylinderGeometry(5.1, 5.1, 0.18, 48), padMat);
    pad1.position.set(-3.4, 0.09, 0); pad1.receiveShadow = true; scene.add(pad1);
    const pad2 = new T.Mesh(new T.BoxGeometry(7.4, 0.18, 3.6), padMat);
    pad2.position.set(4.1, 0.09, 1.7); pad2.receiveShadow = true; scene.add(pad2);
    const pad3 = new T.Mesh(new T.BoxGeometry(3.6, 0.18, 2.0), padMat);
    pad3.position.set(3.45, 0.09, 4.3); pad3.receiveShadow = true; scene.add(pad3);

    /* containment: transparent shell + dome + structural rings */
    const cont = new T.Group();
    const wall = new T.Mesh(new T.CylinderGeometry(4.3, 4.3, 6.4, 48, 1, true), shellMat);
    wall.position.set(-3.4, 0.18 + 3.2, 0);
    cont.add(wall);
    const dome = new T.Mesh(new T.SphereGeometry(4.3, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
    dome.scale.set(1, 0.45, 1);
    dome.position.set(-3.4, 0.18 + 6.4, 0);
    cont.add(dome);
    const base = new T.Mesh(new T.CylinderGeometry(4.42, 4.5, 0.35, 48), steelDark);
    base.position.set(-3.4, 0.18, 0); base.castShadow = true; base.receiveShadow = true;
    cont.add(base);
    for (const ry of [3.3, 6.55]) {
      const ring = new T.Mesh(new T.TorusGeometry(4.32, 0.045, 8, 64),
        new T.MeshStandardMaterial({ color: 0x5d7186, metalness: 0.7, roughness: 0.5, transparent: true, opacity: 0.55 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(-3.4, ry, 0);
      cont.add(ring);
    }
    scene.add(cont);

    /* reactor vessel with cutaway wedge and glowing core */
    vessel(-4.7, -0.4, 1.0, 1.05, 3.95, steel, true);
    coreMat = new T.MeshStandardMaterial({ color: 0x20100a, emissive: 0xff6a00, emissiveIntensity: 1.6, roughness: 0.6, metalness: 0.1 });
    const core = new T.Mesh(new T.CylinderGeometry(0.82, 0.82, 1.45, 24), coreMat);
    core.position.set(-4.7, 1.95, -0.4);
    scene.add(core);
    haloMat = new T.MeshBasicMaterial({ color: 0xff7d1f, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false });
    const halo = new T.Mesh(new T.SphereGeometry(1.25, 24, 18), haloMat);
    halo.position.set(-4.7, 1.95, -0.4);
    scene.add(halo);
    coreLight = new T.PointLight(0xff7d1f, 1.6, 9, 1.6);
    coreLight.position.set(-4.7, 2.0, -0.4);
    scene.add(coreLight);
    /* control rod drive stubs on the vessel head */
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (!i && !j) continue;
      const stub = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 0.55, 8), steelDark);
      stub.position.set(-4.7 + i * 0.42, 5.15, -0.4 + j * 0.42);
      stub.castShadow = true;
      scene.add(stub);
    }

    /* pressurizer on its skirt */
    const skirt = new T.Mesh(new T.CylinderGeometry(0.6, 0.66, 1.0, 24), steelDark);
    skirt.position.set(-1.15, 0.68, -2.2); skirt.castShadow = true; scene.add(skirt);
    vessel(-1.15, -2.2, 0.52, 1.2, 4.35, steelLight, false);

    /* steam generator */
    vessel(-1.5, 1.7, 0.95, 0.65, 4.85, steelLight, false);
    const sgBand = new T.Mesh(new T.CylinderGeometry(0.97, 0.97, 0.28, 40), steelDark);
    sgBand.position.set(-1.5, 1.75, 1.7); sgBand.castShadow = true; scene.add(sgBand);

    /* reactor coolant pump: volute + motor + rotating coupling */
    const volute = new T.Mesh(new T.SphereGeometry(0.62, 28, 20), steel);
    volute.scale.set(1, 0.72, 1);
    volute.position.set(-4.3, 0.72, 2.7);
    volute.castShadow = true; volute.receiveShadow = true;
    scene.add(volute);
    const motor = new T.Mesh(new T.CylinderGeometry(0.33, 0.36, 1.0, 20), accent);
    motor.position.set(-4.3, 1.62, 2.7); motor.castShadow = true; scene.add(motor);
    rotor = new T.Group();
    const disc = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.09, 20), steelDark);
    rotor.add(disc);
    const vane = new T.Mesh(new T.BoxGeometry(0.52, 0.05, 0.1), steelLight);
    vane.position.y = 0.07;
    rotor.add(vane);
    rotor.position.set(-4.3, 2.18, 2.7);
    scene.add(rotor);
    const pumpBase = new T.Mesh(new T.BoxGeometry(1.1, 0.22, 1.1), steelDark);
    pumpBase.position.set(-4.3, 0.29, 2.7); pumpBase.receiveShadow = true; scene.add(pumpBase);

    /* primary loop piping with flow pulses (semi-transparent so the
       pulses inside can be seen) */
    pipe([[-3.85, 3.35, -0.3], [-3.0, 3.5, 0.5], [-2.2, 3.25, 1.3], [-1.78, 2.95, 1.6]], 0.27, pipeMat, "prim", 4, 0x54e0ff);
    pipe([[-1.72, 1.0, 2.2], [-2.8, 0.85, 2.5], [-3.85, 0.78, 2.62]], 0.27, pipeMat, "prim", 3, 0x54e0ff);
    pipe([[-4.42, 0.85, 2.18], [-4.62, 1.0, 1.4], [-4.7, 1.18, 0.62]], 0.27, pipeMat, "prim", 3, 0x54e0ff);
    /* pressurizer surge line */
    pipe([[-1.15, 1.1, -2.2], [-1.6, 1.7, -1.35], [-2.3, 2.7, -0.3], [-2.95, 3.42, 0.42]], 0.09, steelDark, null, 0, 0);
    /* steam line: SG top, up, across, down into the turbine */
    pipe([[-1.5, 5.5, 1.7], [-1.5, 6.1, 1.7], [0.6, 6.25, 1.7], [2.55, 6.1, 1.7], [2.6, 4.2, 1.7], [2.6, 2.75, 1.7]], 0.24, steamPipeMat, "steam", 5, 0xffb454);
    /* feedwater return: condenser back to the steam generator */
    pipe([[2.0, 0.55, 4.3], [0.2, 0.45, 4.55], [-1.2, 0.55, 3.6], [-1.48, 0.72, 2.68]], 0.13, steamPipeMat, null, 0, 0);

    /* turbine: three casings on a pedestal, shaft to the generator */
    const turb = new T.Group();
    const ped = new T.Mesh(new T.BoxGeometry(3.6, 0.85, 2.0), steelDark);
    ped.position.set(3.45, 0.6, 1.7); ped.castShadow = true; ped.receiveShadow = true;
    turb.add(ped);
    const casings = [[2.45, 0.72, 0.85], [3.4, 0.88, 1.05], [4.42, 1.05, 0.85]];
    for (const [cx, cr, cl] of casings) {
      const c = new T.Mesh(new T.CylinderGeometry(cr, cr, cl, 28), steel);
      c.rotation.z = Math.PI / 2;
      c.position.set(cx, 1.85, 1.7);
      c.castShadow = true; c.receiveShadow = true;
      turb.add(c);
      const foot = new T.Mesh(new T.BoxGeometry(cl * 0.7, 0.5, 1.1), steelDark);
      foot.position.set(cx, 1.15, 1.7);
      turb.add(foot);
    }
    const shaft = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.75, 14), steelLight);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(5.22, 1.85, 1.7);
    turb.add(shaft);
    scene.add(turb);

    /* generator */
    const gen = new T.Group();
    const gped = new T.Mesh(new T.BoxGeometry(2.2, 0.85, 2.0), steelDark);
    gped.position.set(5.95, 0.6, 1.7); gped.castShadow = true; gped.receiveShadow = true;
    gen.add(gped);
    const gbody = new T.Mesh(new T.CylinderGeometry(0.92, 0.92, 1.8, 32), steel);
    gbody.rotation.z = Math.PI / 2;
    gbody.position.set(5.95, 1.85, 1.7);
    gbody.castShadow = true; gbody.receiveShadow = true;
    gen.add(gbody);
    const gband = new T.Mesh(new T.TorusGeometry(0.93, 0.05, 10, 40), accent);
    gband.rotation.y = Math.PI / 2;
    gband.position.set(5.95, 1.85, 1.7);
    gen.add(gband);
    const gend = new T.Mesh(new T.CylinderGeometry(0.55, 0.7, 0.4, 24), steelDark);
    gend.rotation.z = Math.PI / 2;
    gend.position.set(7.05, 1.85, 1.7);
    gend.castShadow = true;
    gen.add(gend);
    scene.add(gen);

    /* condenser box + exhaust duct from the LP casing */
    const cond = new T.Mesh(new T.BoxGeometry(3.0, 1.05, 1.45),
      new T.MeshStandardMaterial({ color: 0x87a5bd, metalness: 0.75, roughness: 0.45 }));
    cond.position.set(3.45, 0.7, 4.3);
    cond.castShadow = true; cond.receiveShadow = true;
    scene.add(cond);
    const duct = new T.Mesh(new T.BoxGeometry(0.95, 1.5, 1.5), steelDark);
    duct.position.set(4.42, 1.15, 3.05);
    duct.rotation.x = 0.5;
    duct.castShadow = true;
    scene.add(duct);
  }

  /* ---------- camera orbit: drag to turn, wheel / pinch to zoom */
  function bindOrbit(el) {
    const ptrs = new Map();
    let lastPinch = 0;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => {
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      cam.auto = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) {
        cam.tAz -= (e.clientX - prev[0]) * 0.0052;
        cam.tPol = clamp(cam.tPol - (e.clientY - prev[1]) * 0.0052, 0.2, 1.45);
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (lastPinch > 0) cam.tRad = clamp(cam.tRad * (lastPinch / d), 7.5, 27);
        lastPinch = d;
      }
    });
    const release = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = 0; };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      cam.auto = false;
      cam.tRad = clamp(cam.tRad * (e.deltaY > 0 ? 1.1 : 0.9), 7.5, 27);
    }, { passive: false });
  }

  function resize() {
    if (!wrap || !renderer) return;
    W = wrap.clientWidth;
    H = Math.max(320, Math.min(640, Math.round(W * 0.58)));
    renderer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  const proj = new T.Vector3();
  function placeLabels() {
    for (const L of labels) {
      proj.copy(L.anchor).project(camera);
      if (proj.z > 1 || proj.z < -1) { L.el.style.opacity = "0"; continue; }
      const x = (proj.x * 0.5 + 0.5) * W;
      const y = (-proj.y * 0.5 + 0.5) * H;
      L.el.style.opacity = "1";
      L.el.style.transform = `translate(${L.align}%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    }
  }

  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    /* ease the driven values so steps do not jolt the scene */
    state.glow += (state.glowT - state.glow) * Math.min(1, dt * 5);
    state.prim += (state.primT - state.prim) * Math.min(1, dt * 3);
    state.steam += (state.steamT - state.steam) * Math.min(1, dt * 3);
    const flick = 1 + Math.sin(now * 0.011) * 0.05 + Math.sin(now * 0.023) * 0.03;
    coreMat.emissiveIntensity = (0.15 + 2.2 * state.glow) * flick;
    coreLight.intensity = (0.2 + 2.4 * state.glow) * flick;
    haloMat.opacity = 0.03 + 0.17 * state.glow;
    if (rotor) rotor.rotation.y += dt * 9 * state.prim;
    /* flow pulses */
    for (const fp of flowPaths) {
      const speed = fp.kind === "steam" ? 2.6 * state.steam : 2.3 * state.prim;
      for (const p of fp.pulses) {
        p.off = (p.off + (speed * dt) / fp.len) % 1;
        const pos = fp.curve.getPointAt(p.off);
        const tan = fp.curve.getTangentAt(p.off);
        p.mesh.position.copy(pos);
        p.mesh.lookAt(pos.clone().add(tan));
      }
    }
    /* camera */
    if (cam.auto) cam.tAz += dt * 0.02;
    cam.az += (cam.tAz - cam.az) * Math.min(1, dt * 7);
    cam.pol += (cam.tPol - cam.pol) * Math.min(1, dt * 7);
    cam.rad += (cam.tRad - cam.rad) * Math.min(1, dt * 7);
    camera.position.set(
      cam.target.x + cam.rad * Math.sin(cam.pol) * Math.sin(cam.az),
      cam.target.y + cam.rad * Math.cos(cam.pol),
      cam.target.z + cam.rad * Math.sin(cam.pol) * Math.cos(cam.az));
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
    placeLabels();
  }

  function init(container) {
    try {
      wrap = document.createElement("div");
      wrap.className = "p3d-wrap";
      wrap.innerHTML = `<div class="p3d-labels"></div><div class="p3d-hint">DRAG TO TURN · SCROLL TO ZOOM</div>`;
      labelLayer = wrap.querySelector(".p3d-labels");
      container.innerHTML = "";
      container.appendChild(wrap);
      renderer = new T.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.domElement.className = "p3d-canvas";
      wrap.insertBefore(renderer.domElement, labelLayer);
      buildScene();
      makeLabels();
      resize();
      window.addEventListener("resize", resize);
      bindOrbit(renderer.domElement);
      requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
      return true;
    } catch (e) {
      try { container.innerHTML = ""; } catch (ignored) { /* container gone */ }
      return false;
    }
  }

  function onStep(series, idx) {
    if (!series) return;
    const pwr = series.PWR ? series.PWR[idx] : null;
    const wrca = series.WRCA ? series.WRCA[idx] : null;
    const wsta = series.WSTA ? series.WSTA[idx] : null;
    state.glowT = pwr === null || pwr === undefined ? 0 : clamp(pwr / 100, 0, 1);
    state.primT = wrca === null || wrca === undefined ? 0 : clamp(wrca / 17000, 0, 1.6);
    state.steamT = wsta === null || wsta === undefined ? 0 : clamp(Math.max(wsta, 0) / 1900, 0, 1.3);
  }

  return { init, onStep };
})();
