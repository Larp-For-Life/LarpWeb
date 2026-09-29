/* =========================================================
   LARP FOR LIFE — interakce
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const small = matchMedia('(max-width: 760px)').matches;

  const MEMBERS = Array.isArray(window.LFL_MEMBERS) ? window.LFL_MEMBERS : [];
  const SAYINGS = Array.isArray(window.LFL_SAYINGS) ? window.LFL_SAYINGS : [];
  const CONTACTS = Array.isArray(window.LFL_CONTACTS) ? window.LFL_CONTACTS : [];

  const state = {
    vw: innerWidth,
    vh: innerHeight,
    scrollY: scrollY,
    lastScrollY: scrollY,
    velocity: 0,
    pointer: { x: innerWidth / 2, y: innerHeight * 0.45, active: false, lastMove: 0 },
    pulse: 0,
    flash: 0,
    tilt: null,
  };

  /* ---------- pomocné ---------- */

  function roman(n) {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
    return out;
  }

  const fullName = (m) => [m.name, m.nick ? `„${m.nick}“` : '', m.surname].filter(Boolean).join(' ');

  const GLYPHS = '!<>-_\\/[]{}=+*^?#01XVΛ';
  function scramble(el, text, duration = 900) {
    if (!el) return;
    if (reduced || !text) { el.textContent = text || ''; return; }
    cancelAnimationFrame(el._scr || 0);
    const chars = Array.from(text);
    const reveal = chars.map((_, i) => (i / Math.max(1, chars.length)) * 0.6 + Math.random() * 0.4);
    const start = performance.now();
    const tick = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        out += (c === ' ' || t >= reveal[i]) ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (t < 1) el._scr = requestAnimationFrame(tick);
    };
    el._scr = requestAnimationFrame(tick);
  }

  function pageOffset(el) {
    let x = 0, y = 0;
    while (el) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
    return { x, y };
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }

  /* ---------- filmové zrno ---------- */

  function makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    document.documentElement.style.setProperty('--noise', `url(${c.toDataURL('image/png')})`);
  }

  /* =========================================================
     MLHA — WebGL shader
     ========================================================= */

  function initFog() {
    const canvas = $('#fog');
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }
    if (!gl) { canvas.classList.add('is-fallback'); return null; }

    const vs = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
    const fs = `
      precision mediump float;
      uniform vec2 u_res;
      uniform float u_time;
      uniform vec2 u_light;
      uniform float u_scroll;
      uniform float u_pulse;

      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
        return v;
      }
      void main(){
        vec2 uv = gl_FragCoord.xy / u_res;
        vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
        float t = u_time * 0.035;
        vec2 drift = vec2(0.0, u_scroll * 0.35);
        vec2 q = vec2(fbm(p * 1.4 + t + drift), fbm(p * 1.4 - t + vec2(3.1, 1.7) + drift));
        float f = fbm(p * 2.1 + q * 1.9 + vec2(t * 0.6, -t * 0.4) + drift);
        float fog = smoothstep(0.3, 0.9, f);

        vec2 m = (u_light - 0.5 * u_res) / u_res.y;
        float d = length(p - m);
        float light = exp(-d * 2.6);
        float core = exp(-d * 9.0);

        float c = fog * (0.05 + light * 0.34 + u_pulse * 0.25) + core * 0.035 + light * 0.02;
        c += u_pulse * 0.06 * exp(-d * 1.5);
        c *= 1.0 - 0.55 * length(uv - 0.5);
        gl_FragColor = vec4(vec3(c), 1.0);
      }`;

    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) { canvas.classList.add('is-fallback'); return null; }
    const prog = gl.createProgram();
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.classList.add('is-fallback'); return null; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(prog, 'u_res'),
      time: gl.getUniformLocation(prog, 'u_time'),
      light: gl.getUniformLocation(prog, 'u_light'),
      scroll: gl.getUniformLocation(prog, 'u_scroll'),
      pulse: gl.getUniformLocation(prog, 'u_pulse'),
    };

    const scale = small ? 0.35 : 0.45;
    const light = { x: state.vw / 2, y: state.vh * 0.45 };

    function resize() {
      canvas.width = Math.max(2, Math.round(state.vw * scale));
      canvas.height = Math.max(2, Math.round(state.vh * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();

    return {
      resize,
      render(now) {
        const p = state.pointer;
        const idle = !p.active || now - p.lastMove > 4000;
        const lx = idle ? state.vw * (0.5 + Math.sin(now * 0.00021) * 0.28) : p.x;
        const ly = idle ? state.vh * (0.45 + Math.cos(now * 0.00017) * 0.2) : p.y;
        light.x = lerp(light.x, lx, idle ? 0.01 : 0.05);
        light.y = lerp(light.y, ly, idle ? 0.01 : 0.05);
        gl.uniform2f(u.res, canvas.width, canvas.height);
        gl.uniform1f(u.time, reduced ? 12.0 : now / 1000);
        gl.uniform2f(u.light, light.x * scale, (state.vh - light.y) * scale);
        gl.uniform1f(u.scroll, state.scrollY / state.vh);
        gl.uniform1f(u.pulse, state.pulse);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }

  /* =========================================================
     HERO — 3D písmena LARP / FOR / LIFE
     Každé písmeno má vlastní 3D prostor se stejnou „kamerou“
     (perspective-origin míří na střed scény). Prohlížeč tak nemusí
     vzájemně rozřezávat a třídit vrstvy různě natočených písmen,
     což byl hlavní zdroj sekání. Pořadí písmen řešíme přes z-index.
     Blikání a zhasínání běží přes Web Animations (opacity) na GPU.
     ========================================================= */

  const hero = {
    el: $('.hero'),
    stage: $('#heroStage'),
    title: $('#heroTitle'),
    words: [],
    letters: [],
    rx: 0,
    ry: 0,
    visible: true,
    acronymOn: false,
    ripples: [],
    last: { op: '' },
  };
  const DEG = Math.PI / 180;

  function buildHero() {
    const DEPTH = small ? 7 : 12;
    const STEP = small ? 0.026 : 0.021; // em
    hero.words = $$('.word', hero.title);
    hero.words.forEach((word, wi) => {
      Array.from(word.dataset.text).forEach((c, ci) => {
        const ch = document.createElement('span');
        ch.className = 'ch';
        ch.setAttribute('aria-hidden', 'true');
        const intro = document.createElement('span');
        intro.className = 'ch-intro';
        const inner = document.createElement('span');
        inner.className = 'ch-inner';
        let html = '';
        for (let d = DEPTH; d >= 1; d--) {
          const l = 42 - (d / DEPTH) * 36;
          html += `<span class="ch-layer ch-side" style="--z:${(-d * STEP).toFixed(3)}em;--l:${l.toFixed(1)}%">${c}</span>`;
        }
        html += `<span class="ch-layer ch-glow">${c}</span><span class="ch-layer ch-face">${c}</span>`;
        inner.innerHTML = html;
        intro.appendChild(inner);
        ch.appendChild(intro);
        word.appendChild(ch);
        const L = {
          el: ch, intro, inner, word: wi, index: ci,
          face: $('.ch-face', inner), glow: $('.ch-glow', inner), sides: $$('.ch-side', inner),
          cx: 0, cy: 0, z: 0, vz: 0, rx: 0, vrx: 0, ry: 0, vry: 0, g: 0.55, lastG: -1, ready: false,
          pre: '', post: '', wpre: '', wpost: '', lpre: '', lpost: '', dx: 0, dy: 0, zEff: 0, zi: -1,
        };
        intro.addEventListener('animationend', (e) => {
          if (e.target !== intro || L.ready) return;
          L.ready = true;
          inner.classList.add('is-set');
          L.glow.style.opacity = L.g.toFixed(3);
          L.lastG = L.g;
        });
        hero.letters.push(L);
      });
    });
    hero.order = hero.letters.slice();
  }

  function measureHero() {
    hero.top = pageOffset(hero.el).y;
    const so = pageOffset(hero.stage);
    const ox = so.x + hero.stage.offsetWidth * 0.5, oy = so.y + hero.stage.offsetHeight * 0.45;
    const to = pageOffset(hero.title);
    const tcx = to.x + hero.title.offsetWidth / 2, tcy = to.y + hero.title.offsetHeight / 2;
    const wc = hero.words.map((w) => { const o = pageOffset(w); return { x: o.x + w.offsetWidth / 2, y: o.y + w.offsetHeight / 2 }; });
    const tr = (x, y) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    for (const L of hero.letters) {
      const o = pageOffset(L.el);
      const w = L.el.offsetWidth, h = L.el.offsetHeight;
      L.cx = o.x + w / 2;
      L.cy = o.y + h / 2;
      L.dx = L.cx - tcx;
      L.dy = L.cy - tcy;
      // transformace nadpisu, slova a písmena složené v souřadnicích písmena
      L.pre = tr(tcx - o.x, tcy - o.y);
      L.post = tr(o.x - tcx, o.y - tcy);
      L.wpre = tr(wc[L.word].x - o.x, wc[L.word].y - o.y);
      L.wpost = tr(o.x - wc[L.word].x, o.y - wc[L.word].y);
      L.lpre = tr(w / 2, h / 2);
      L.lpost = tr(-w / 2, -h / 2);
      L.el.style.perspectiveOrigin = `${(ox - o.x).toFixed(1)}px ${(oy - o.y).toFixed(1)}px`;
    }
  }

  function introHero() {
    let delay = 0;
    hero.words.forEach((_, wi) => {
      hero.letters.filter((L) => L.word === wi).forEach((L, i) => {
        setTimeout(() => L.el.classList.add('is-in'), reduced ? 0 : delay + i * 90);
      });
      delay += 480;
    });
    setTimeout(() => document.body.classList.add('is-ready'), reduced ? 0 : 1250);
    if (!reduced) {
      setTimeout(() => acronym(), 3300);
      setTimeout(idleFlicker, 5200);
    }
  }

  const FLICK_AT = [0, 0.08, 0.14, 0.22, 0.3, 0.44, 0.52, 1];
  const FLICK_V = [1, 0.12, 0.9, 0.05, 1, 0.35, 1, 1];
  const flickFrames = (m) => FLICK_AT.map((offset, k) => ({ offset, opacity: FLICK_V[k] * m }));

  function flicker(L) {
    if (!L.ready || reduced || (hero.acronymOn && L.index !== 0)) return;
    L.face.animate(flickFrames(1), { duration: 750 });
    L.glow.animate(flickFrames(L.g), { duration: 750 });
  }

  // chvíle, kdy zůstane svítit jen L · F · L
  function acronym(hold = 1700) {
    if (reduced || hero.acronymOn) return;
    hero.acronymOn = true;
    const anims = [];
    const run = (el, opacity) => anims.push(el.animate([{ opacity }], { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }));
    for (const L of hero.letters) {
      if (!L.ready) continue;
      if (L.index === 0) run(L.glow, 1);
      else {
        run(L.face, 0.06);
        run(L.glow, 0);
        for (const s of L.sides) run(s, 0.18);
      }
    }
    setTimeout(() => {
      anims.forEach((a) => { a.onfinish = () => a.cancel(); a.reverse(); });
      setTimeout(() => { hero.acronymOn = false; }, 950);
    }, hold);
  }

  function idleFlicker() {
    if (hero.visible && !document.hidden) flicker(hero.letters[(Math.random() * hero.letters.length) | 0]);
    setTimeout(idleFlicker, 1800 + Math.random() * 4200);
  }

  // klik pošle přes písmena plynulou vlnu (žádné poskakování ani náhoda)
  const RIPPLE = { speed: 1.4, dur: 1200, life: 3200 }; // px/ms, ms, ms

  function heroImpulse(x, y) {
    const py = y + state.scrollY;
    hero.ripples.push({ x, y: py, t: performance.now() });
    if (hero.ripples.length > 4) hero.ripples.shift();
    const ring = document.createElement('span');
    ring.className = 'shock';
    ring.style.left = `${x}px`;
    ring.style.top = `${py - (hero.top || 0)}px`;
    hero.el.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove());
  }

  function ripplePulse(now) {
    if (!hero.ripples.length) return 0;
    hero.ripples = hero.ripples.filter((r) => now - r.t < RIPPLE.life);
    let p = 0;
    for (const r of hero.ripples) {
      const tau = (now - r.t) / 1600;
      if (tau < 1) p = Math.max(p, Math.sin(Math.PI * tau) ** 2 * 0.75);
    }
    return p;
  }

  function updateHero(now) {
    const { vw, vh, scrollY: sy, pointer } = state;
    hero.visible = sy < vh * 1.15;
    if (!hero.visible) return;

    const idle = !pointer.active || now - pointer.lastMove > 4000;
    const tilt = state.tilt && now - state.tilt.t < 1500 ? state.tilt : null;
    let nx, ny;
    if (reduced) {
      nx = 0; ny = 0;
    } else if (tilt && idle) {
      nx = tilt.x; ny = tilt.y;
    } else if (idle) {
      nx = Math.sin(now * 0.00031) * 0.4;
      ny = Math.cos(now * 0.00023) * 0.26;
    } else {
      nx = pointer.x / vw - 0.5;
      ny = pointer.y / vh - 0.5;
    }
    hero.rx = lerp(hero.rx, -ny * 24, 0.055);
    hero.ry = lerp(hero.ry, nx * 34, 0.055);

    const p = clamp(sy / (vh * 0.85), 0, 1.3);
    const trx = hero.rx + p * 28, tryy = hero.ry;
    const T = `translate3d(0, ${(p * 12).toFixed(2)}vh, ${(-p * 160).toFixed(1)}px) rotateX(${trx.toFixed(2)}deg) rotateY(${tryy.toFixed(2)}deg)`;
    const W = [
      `translate3d(${(-p * 26).toFixed(2)}vw, 0, ${(p * 140).toFixed(1)}px) rotateY(${(-p * 18).toFixed(2)}deg)`,
      `translate3d(0, 0, ${(p * 480).toFixed(1)}px)`,
      `translate3d(${(p * 26).toFixed(2)}vw, 0, ${(p * 140).toFixed(1)}px) rotateY(${(p * 18).toFixed(2)}deg)`,
    ];
    const WZ = [p * 140, p * 480, p * 140];
    const sRy = Math.sin(tryy * DEG), sRx = Math.sin(trx * DEG), cRx = Math.cos(trx * DEG);
    const op = (1 - clamp((p - 0.3) / 0.6, 0, 1)).toFixed(3);
    if (op !== hero.last.op) { hero.stage.style.opacity = op; hero.last.op = op; }

    const R = Math.max(vw, vh) * 0.3;
    const px = pointer.x, py = pointer.y + sy;
    const influenceOn = pointer.active && !idle && !reduced;
    for (const L of hero.letters) {
      const dx = px - L.cx, dy = py - L.cy;
      const inf = influenceOn ? Math.pow(clamp(1 - Math.hypot(dx, dy) / R, 0, 1), 2) : 0;
      const tz = inf * 150;
      const try_ = clamp(dx / R, -1, 1) * inf * 38;
      const trx = clamp(-dy / R, -1, 1) * inf * 34;

      L.vz = (L.vz + (tz - L.z) * 0.075) * 0.8;
      L.z += L.vz;
      L.vry = (L.vry + (try_ - L.ry) * 0.07) * 0.82;
      L.ry += L.vry;
      L.vrx = (L.vrx + (trx - L.rx) * 0.07) * 0.82;
      L.rx += L.vrx;

      // vlny po kliknutí: hladký „kopec“ sin², písmeno se nakloní po směru vlny
      let wz = 0, wrx = 0, wry = 0, wg = 0;
      for (const r of hero.ripples) {
        const rdx = L.cx - r.x, rdy = L.cy - r.y;
        const d = Math.hypot(rdx, rdy) || 1;
        const tau = (now - r.t - d / RIPPLE.speed) / RIPPLE.dur;
        if (tau <= 0 || tau >= 1) continue;
        const fall = 1 / (1 + d / (vw * 0.5));
        const bump = Math.sin(Math.PI * tau) ** 2;
        const swing = Math.sin(2 * Math.PI * tau) * fall;
        wz += 140 * bump * fall;
        wry += (rdx / d) * swing * 16;
        wrx += (-rdy / d) * swing * 13;
        wg += bump * fall;
      }
      const z = L.z + wz;

      L.inner.style.transform = `${L.pre} ${T} ${L.post} ${L.wpre} ${W[L.word]} ${L.wpost} ${L.lpre} translate3d(0,0,${z.toFixed(1)}px) rotateX(${(L.rx + wrx).toFixed(2)}deg) rotateY(${(L.ry + wry).toFixed(2)}deg) ${L.lpost}`;
      L.zEff = z + WZ[L.word] - L.dx * sRy * cRx + L.dy * sRx;
      L.g = lerp(L.g, Math.min(1, 0.5 + inf * 0.5 + wg * 0.45), 0.15);
      if (L.ready && Math.abs(L.g - L.lastG) > 0.015) {
        L.glow.style.opacity = L.g.toFixed(3);
        L.lastG = L.g;
      }
    }
    // bližší písmeno se kreslí navrch
    hero.order.sort((a, b) => a.zEff - b.zEff);
    hero.order.forEach((L, r) => { if (L.zi !== r) { L.el.style.zIndex = String(r + 1); L.zi = r; } });
  }

  function initHero() {
    hero.el.addEventListener('pointerdown', (e) => {
      if (reduced || e.button > 0) return;
      heroImpulse(e.clientX, e.clientY);
    });
  }

  // na telefonu nápis naklápí náklon zařízení
  function initDeviceTilt() {
    if (finePointer || reduced || !('DeviceOrientationEvent' in window)) return;
    const onOrientation = (e) => {
      if (e.gamma == null || e.beta == null) return;
      state.tilt = {
        x: clamp(e.gamma / 30, -1, 1) * 0.5,
        y: clamp((e.beta - 40) / 30, -1, 1) * 0.5,
        t: performance.now(),
      };
    };
    const enable = () => addEventListener('deviceorientation', onOrientation);
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      hero.el.addEventListener('pointerdown', () => {
        DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') enable(); }).catch(() => {});
      }, { once: true });
    } else {
      enable();
    }
  }

  function startClock() {
    const el = $('#clock');
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const d = new Date();
      el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  /* =========================================================
     LARP HLÁŠKY — samy se pomalu střídají (scroll neblokují)
     ========================================================= */

  const SAYING_MS = 7000;
  const sayings = {
    section: $('#hlasky'),
    stage: $('#sayings'),
    ticksEl: $('#sayingsTicks'),
    items: [],
    ticks: [],
    idx: -1,
    visible: false,
    timer: 0,
    resetTimer: 0,
    rx: 0,
    ry: 0,
  };

  function buildSayings() {
    const list = SAYINGS.length ? SAYINGS : ["There's no limit to the *larp*."];
    sayings.section.style.setProperty('--saying-ms', `${SAYING_MS}ms`);
    list.forEach((raw) => {
      const p = document.createElement('p');
      p.className = 'saying';
      let wi = 0, prev = null, glued = false;
      String(raw).split(/(\*[^*]+\*)/).forEach((part) => {
        if (!part) return;
        const em = part.length > 2 && part[0] === '*' && part[part.length - 1] === '*';
        const text = em ? part.slice(1, -1) : part;
        text.split(/(\s+)/).forEach((tok) => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { p.appendChild(document.createTextNode(' ')); glued = false; return; }
          // interpunkce hned za zvýrazněným slovem zůstane s ním na řádku
          if (prev && glued && !em && prev.classList.contains('sw--em')) {
            const tail = document.createElement('span');
            tail.className = 'sw-tail';
            tail.textContent = tok;
            prev.appendChild(tail);
            return;
          }
          const s = document.createElement('span');
          s.className = 'sw' + (em ? ' sw--em' : '');
          s.style.setProperty('--i', wi++);
          s.textContent = tok;
          p.appendChild(s);
          prev = s;
          glued = true;
        });
      });
      sayings.stage.appendChild(p);
      sayings.items.push(p);
      const tick = document.createElement('i');
      sayings.ticksEl.appendChild(tick);
      sayings.ticks.push(tick);
    });
    if (sayings.items.length < 2) sayings.ticksEl.hidden = true;

    new IntersectionObserver(([e]) => {
      sayings.visible = e.isIntersecting;
      if (sayings.visible && sayings.idx === -1) showSaying(0);
      scheduleSaying();
    }, { threshold: 0.35 }).observe(sayings.section);
    document.addEventListener('visibilitychange', scheduleSaying);
  }

  function showSaying(i) {
    const prev = sayings.idx;
    sayings.idx = i;
    sayings.items.forEach((it, k) => {
      it.classList.toggle('is-active', k === i);
      it.classList.toggle('is-past', k === prev && k !== i);
    });
    sayings.ticks.forEach((t, k) => t.classList.toggle('is-on', k === i));
    // odcházející hláška se po odletu potichu vrátí dolů, připravená na další kolo
    clearTimeout(sayings.resetTimer);
    sayings.resetTimer = setTimeout(() => {
      sayings.items.forEach((it, k) => { if (k !== sayings.idx) it.classList.remove('is-past'); });
    }, 2000);
  }

  function scheduleSaying() {
    clearTimeout(sayings.timer);
    sayings.ticks.forEach((t) => t.classList.remove('is-run'));
    if (!sayings.visible || document.hidden || sayings.items.length < 2) return;
    const tick = sayings.ticks[sayings.idx];
    if (tick) { void tick.offsetWidth; tick.classList.add('is-run'); }
    sayings.timer = setTimeout(() => {
      showSaying((sayings.idx + 1) % sayings.items.length);
      scheduleSaying();
    }, SAYING_MS);
  }

  function updateSayings(now) {
    if (!sayings.visible || reduced) return;
    const { pointer, vw, vh } = state;
    const active = pointer.active && now - pointer.lastMove < 4000;
    const tx = active ? (pointer.x / vw - 0.5) * 16 : Math.sin(now * 0.0003) * 4;
    const ty = active ? -(pointer.y / vh - 0.5) * 12 : Math.cos(now * 0.00025) * 3;
    sayings.ry = lerp(sayings.ry, tx, 0.05);
    sayings.rx = lerp(sayings.rx, ty, 0.05);
    sayings.stage.style.transform = `rotateX(${sayings.rx.toFixed(2)}deg) rotateY(${sayings.ry.toFixed(2)}deg)`;
  }

  /* =========================================================
     PÁSKY
     ========================================================= */

  const tapes = { el: $('.tapes'), items: [], visible: false };

  function buildTapes() {
    const unit = '<span>Larp</span><i class="tape-sep"></i><span>For</span><i class="tape-sep"></i><span>Life</span><i class="tape-sep"></i>';
    $$('.tape-track').forEach((track) => {
      track.innerHTML = `<span class="tape-chunk">${unit.repeat(4)}</span><span class="tape-chunk">${unit.repeat(4)}</span>`;
      tapes.items.push({ track, dir: Number(track.dataset.speed) || 1, x: 0, w: 0 });
    });
    measureTapes();
    new IntersectionObserver(([e]) => { tapes.visible = e.isIntersecting; }).observe(tapes.el);
  }

  function measureTapes() {
    tapes.items.forEach((t) => { t.w = t.track.firstElementChild.offsetWidth; });
  }

  function updateTapes(dt) {
    if (!tapes.visible || reduced) return;
    const boost = 1 + Math.min(12, Math.abs(state.velocity) * 0.6);
    const sign = state.velocity < -0.5 ? -1 : 1;
    for (const t of tapes.items) {
      if (!t.w) continue;
      t.x += t.dir * sign * boost * dt * 0.05;
      const pos = ((t.x % t.w) + t.w) % t.w;
      t.track.style.transform = `translate3d(${(-pos).toFixed(2)}px,0,0)`;
    }
  }

  /* =========================================================
     BLIKAJÍCÍ LFL — řada log, která nepravidelně zhasínají
     ========================================================= */

  const signs = { el: $('#signs'), track: $('#signsTrack'), items: [], x: 0, w: 0, visible: false };

  const SIGN_PATTERNS = [
    { w: 0.45, dur: [280, 660], k: [[0, 0], [0.15, 0.9], [0.3, 0.1], [0.5, 1], [0.75, 0.2], [1, 0]] },
    { w: 0.4, dur: [1600, 4200], k: [[0, 0], [0.04, 0.8], [0.07, 0.05], [0.11, 1], [0.14, 0.3], [0.18, 1], [0.8, 1], [0.83, 0.15], [0.86, 1], [1, 0]] },
    { w: 0.15, dur: [1400, 2600], k: [[0, 0], [0.35, 0.7], [0.5, 1], [0.65, 0.7], [1, 0]] },
  ];

  function buildSigns() {
    const N = 8;
    const unit = () => '<span class="sign"><img class="sign-off" src="assets/lfl-glow.png" alt=""><img class="sign-on" src="assets/lfl-glow.png" alt=""></span>';
    signs.track.innerHTML = [0, 1].map(() => `<div class="signs-chunk">${Array.from({ length: N }, unit).join('')}</div>`).join('');
    $$('.sign', signs.track).forEach((el, i) => {
      const s = { el, on: $('.sign-on', el), anim: null, hover: null };
      if (reduced) s.on.style.opacity = i % 3 === 1 ? '1' : '0';
      if (finePointer && !reduced) {
        el.addEventListener('pointerenter', () => lightSign(s, true));
        el.addEventListener('pointerleave', () => lightSign(s, false));
      }
      signs.items.push(s);
    });
    measureSigns();
    new IntersectionObserver(([e]) => { signs.visible = e.isIntersecting; }).observe(signs.el);
    if (!reduced) setTimeout(signsTick, 400);
  }

  function measureSigns() {
    const chunk = signs.track.firstElementChild;
    signs.w = chunk ? chunk.offsetWidth : 0;
  }

  function flickerSign(s) {
    if (s.anim || s.hover) return;
    let r = Math.random();
    const pat = SIGN_PATTERNS.find((p) => (r -= p.w) < 0) || SIGN_PATTERNS[0];
    const duration = pat.dur[0] + Math.random() * (pat.dur[1] - pat.dur[0]);
    s.anim = s.on.animate(pat.k.map(([offset, opacity]) => ({ offset, opacity })), { duration });
    s.anim.onfinish = () => { s.anim = null; };
  }

  function lightSign(s, on) {
    if (s.anim) { s.anim.cancel(); s.anim = null; }
    if (s.hover) s.hover.cancel();
    s.hover = on
      ? s.on.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.15, offset: 0.22 }, { opacity: 1, offset: 0.36 }, { opacity: 1 }], { duration: 420, fill: 'forwards' })
      : null;
    if (!on) s.on.animate([{ opacity: 1 }, { opacity: 0.25, offset: 0.2 }, { opacity: 0.8, offset: 0.32 }, { opacity: 0 }], { duration: 520 });
  }

  function signsTick() {
    if (signs.visible && !document.hidden) {
      const k = Math.random() < 0.35 ? 2 : 1;
      for (let i = 0; i < k; i++) flickerSign(signs.items[(Math.random() * signs.items.length) | 0]);
    }
    setTimeout(signsTick, 160 + Math.random() * 480);
  }

  function updateSigns(dt) {
    if (!signs.visible || reduced || !signs.w) return;
    const boost = 1 + Math.min(8, Math.abs(state.velocity) * 0.4);
    const dir = state.velocity < -0.5 ? 1 : -1;
    signs.x += dir * boost * dt * 0.03;
    const pos = ((signs.x % signs.w) + signs.w) % signs.w;
    signs.track.style.transform = `translate3d(${(-pos).toFixed(2)}px,0,0)`;
  }

  /* =========================================================
     LARPERS — hranatý mechanismus
     Členové jsou čtvercové dlaždice na čtvercové dráze. Mechanismus
     se každých pár vteřin pootočí o jedno místo; dlaždice, která
     dojede do brány nahoře, se vyvolá na oltáři uprostřed.
     Klik na jinou dlaždici ji k bráně přivolá, klik na oltář
     (nebo na dlaždici v bráně) otevře detail.
     ========================================================= */

  function placeholderPhoto() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
      <defs>
        <radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#2b2b2b"/><stop offset=".6" stop-color="#101010"/><stop offset="1" stop-color="#050505"/></radialGradient>
        <radialGradient id="s" cx="50%" cy="30%" r="60%"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></radialGradient>
      </defs>
      <rect width="300" height="400" fill="url(#g)"/>
      <ellipse cx="150" cy="168" rx="54" ry="64" fill="#070707"/>
      <path d="M28 400 C30 300 84 252 150 252 C216 252 270 300 272 400 Z" fill="#070707"/>
      <rect width="300" height="400" fill="url(#s)"/>
      <text x="150" y="192" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="66" fill="#2e2e2e">?</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s{2,}/g, ' '));
  }
  const PLACEHOLDER = placeholderPhoto();
  const photoOf = (i) => (MEMBERS[i] && MEMBERS[i].photo) || PLACEHOLDER;

  const TRACK = 12.5;               // odsazení dráhy od okraje (cqw)
  const SIDE = 100 - 2 * TRACK;     // strana dráhy
  const PER = SIDE * 4;             // obvod dráhy
  const HALF = SIDE / 2;
  const DIAL_MS = 4200;

  const dial = {
    el: $('#sigil'),
    tilt: $('#sigilTilt'),
    marks: $('#sigilMarks'),
    tilesWrap: $('#sigilTiles'),
    altar: $('#altar'),
    altarPhoto: $('#altarPhoto'),
    imgs: $$('.altar-img'),
    imgIdx: 0,
    scan: $('#altarScan'),
    num: $('#altarNum'),
    first: $('#altarFirst'),
    nick: $('#altarNick'),
    last: $('#altarLast'),
    gate: $('#sigilGate'),
    pulse: $('#sigilPulse'),
    tiles: [],
    rot: 0,
    active: -1,
    moving: false,
    hovering: false,
    visible: false,
    timer: 0,
    box: { x: 0, y: 0, w: 1, h: 1 },
    rx: 0,
    ry: 0,
  };
  const tiles = dial.tiles;
  const mod = (a, n) => ((a % n) + n) % n;

  // bod na dráze: u = vzdálenost od brány (nahoře uprostřed) po směru hodin
  function trackPoint(u) {
    u = mod(u, PER);
    if (u < HALF) return [50 + u, TRACK];
    u -= HALF;
    if (u < SIDE) return [100 - TRACK, TRACK + u];
    u -= SIDE;
    if (u < SIDE) return [100 - TRACK - u, 100 - TRACK];
    u -= SIDE;
    if (u < SIDE) return [TRACK, 100 - TRACK - u];
    u -= SIDE;
    return [TRACK + u, TRACK];
  }
  const tileTransform = ([x, y]) => `translate(${x.toFixed(3)}cqw, ${y.toFixed(3)}cqw)`;
  const slotOf = (j, r) => ((j - r) / MEMBERS.length) * PER;

  function buildSigilMarks() {
    let h = '';
    // rysky visící z vnitřního rámu, v bráně mezera
    for (let k = 0; k <= 40; k++) {
      const p = 30 + k * 23.5, len = k % 5 === 0 ? 24 : 12;
      if (!(p > 430 && p < 570)) h += `<line x1="${p}" y1="30" x2="${p}" y2="${30 + len}"/>`;
      h += `<line x1="${p}" y1="970" x2="${p}" y2="${970 - len}"/>`;
      h += `<line x1="30" y1="${p}" x2="${30 + len}" y2="${p}"/>`;
      h += `<line x1="970" y1="${p}" x2="${970 - len}" y2="${p}"/>`;
    }
    // olovnice nad bránou
    h += '<line x1="500" y1="4" x2="500" y2="36"/>';
    // křížky v rozích pásu
    [[4, 4], [970, 4], [4, 970], [970, 970]].forEach(([x, y]) => {
      h += `<line x1="${x}" y1="${y}" x2="${x + 26}" y2="${y + 26}"/><line x1="${x + 26}" y1="${y}" x2="${x}" y2="${y + 26}"/>`;
    });
    // nápis v pásu rámu
    const long = 'LARP · FOR · LIFE · LARP · FOR · LIFE · LARP · FOR · LIFE · LARP · FOR · LIFE';
    const short = 'LARP · FOR · LIFE · LARP · FOR';
    const t = (x, y, len, str, rot) => `<text x="${x}" y="${y + 4}" text-anchor="middle" textLength="${len}" lengthAdjust="spacing"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}>${str}</text>`;
    h += t(255, 17, 380, short) + t(745, 17, 380, short);
    h += t(983, 500, 880, long, 90) + t(500, 983, 880, long, 180) + t(17, 500, 880, long, -90);
    dial.marks.innerHTML = h;
  }

  function buildSigil() {
    const n = MEMBERS.length;
    // s víc členy se dlaždice zmenší, aby se na dráhu vešly
    const size = Math.min(14, (PER / Math.max(n, 1)) * 0.6);
    dial.el.style.setProperty('--tile', `${size.toFixed(2)}cqw`);
    buildSigilMarks();

    MEMBERS.forEach((m, j) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.style.setProperty('--i', j);
      b.dataset.cursor = '+';
      b.setAttribute('aria-label', fullName(m) || `Člen ${j + 1}`);
      b.innerHTML = `<span class="tile-in"><span class="tile-photo"><img src="${esc(photoOf(j))}" alt="" loading="lazy" decoding="async"></span><span class="tile-num">${roman(j + 1)}</span></span>`;
      const img = $('img', b);
      img.addEventListener('error', () => { img.src = PLACEHOLDER; }, { once: true });
      b.addEventListener('click', () => onTile(j));
      dial.tilesWrap.appendChild(b);
      tiles.push(b);
    });
    placeTiles();

    dial.altar.addEventListener('click', () => {
      if (dial.active >= 0 && !dial.moving) openModal(dial.active, dial.altarPhoto);
    });
    dial.el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      dial.hovering = true;
      clearTimeout(dial.timer);
    });
    dial.el.addEventListener('pointerleave', () => {
      dial.hovering = false;
      scheduleDial();
    });
    document.addEventListener('visibilitychange', scheduleDial);

    new IntersectionObserver(([e]) => {
      dial.visible = e.isIntersecting;
      dial.el.classList.toggle('is-offscreen', !dial.visible);
      if (dial.visible && !dial.el.classList.contains('is-revealed')) {
        dial.el.classList.add('is-revealed');
        setTimeout(() => { if (dial.active === -1 && n) arrive(); }, reduced ? 0 : 1700);
      }
      scheduleDial();
    }, { threshold: 0.3 }).observe(dial.el);
  }

  function placeTiles() {
    tiles.forEach((t, j) => { t.style.transform = tileTransform(trackPoint(slotOf(j, dial.rot))); });
  }

  // pootočí mechanismus na rotaci r1; dlaždice jedou po dráze i přes rohy
  function turnTo(r1, instant = false) {
    const r0 = dial.rot;
    dial.rot = r1;
    clearTimeout(dial.timer);
    if (instant || reduced || r0 === r1) {
      tiles.forEach((t) => t.getAnimations().forEach((a) => a.cancel()));
      dial.moving = false;
      placeTiles();
      arrive(true);
      return;
    }
    depart();
    dial.moving = true;
    const duration = 1100 + (Math.abs(r1 - r0) - 1) * 320;
    let left = tiles.length;
    tiles.forEach((t, j) => {
      const uA = slotOf(j, r0), uB = slotOf(j, r1);
      const lo = Math.min(uA, uB), hi = Math.max(uA, uB);
      const corners = [];
      for (let k = Math.ceil((lo - HALF) / SIDE); HALF + k * SIDE < hi; k++) {
        const c = HALF + k * SIDE;
        if (c > lo + 1e-6) corners.push(c);
      }
      if (uB < uA) corners.reverse();
      const frames = [uA, ...corners, uB].map((u) => ({ transform: tileTransform(trackPoint(u)), offset: (u - uA) / (uB - uA) }));
      t.style.transform = frames[frames.length - 1].transform;
      const a = t.animate(frames, { duration, easing: 'cubic-bezier(.7,0,.2,1)' });
      a.onfinish = () => {
        if (--left > 0) return;
        dial.moving = false;
        arrive();
      };
    });
  }

  function depart() {
    tiles.forEach((t) => t.classList.remove('is-gate'));
    dial.altar.classList.add('is-dim');
  }

  function arrive(quiet = false) {
    const n = MEMBERS.length;
    if (!n) return;
    const i = mod(dial.rot, n);
    const m = MEMBERS[i];
    const changed = i !== dial.active;
    dial.active = i;
    tiles.forEach((t, j) => {
      t.classList.toggle('is-gate', j === i);
      t.dataset.cursor = j === i ? '+' : '↻';
    });
    dial.el.classList.add('has-active');
    dial.altar.classList.remove('is-dim');

    if (changed) {
      const next = dial.imgs[dial.imgIdx ^ 1], cur = dial.imgs[dial.imgIdx];
      next.onerror = () => { next.onerror = null; next.src = PLACEHOLDER; };
      next.src = photoOf(i);
      next.style.zIndex = '1';
      cur.style.zIndex = '0';
      next.classList.add('is-on');
      cur.classList.remove('is-on');
      dial.imgIdx ^= 1;
      dial.num.textContent = roman(i + 1);
      dial.nick.textContent = m.nick ? `„${m.nick}“` : '';
      dial.altar.setAttribute('aria-label', fullName(m));
      if (quiet || reduced) {
        dial.first.textContent = m.name || '';
        dial.last.textContent = m.surname || '';
      } else {
        scramble(dial.first, m.name || '', 700);
        scramble(dial.last, m.surname || '', 850);
        // fotka se odkryje shora jako závěrka, se skenovací linkou
        const ease = 'cubic-bezier(.75,0,.15,1)';
        const hgt = dial.altar.offsetHeight;
        next.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { duration: 1000, easing: ease });
        dial.scan.animate([
          { transform: 'translateY(0)', opacity: 1 },
          { transform: `translateY(${hgt}px)`, opacity: 1, offset: 0.95 },
          { transform: `translateY(${hgt}px)`, opacity: 0 },
        ], { duration: 1000, easing: ease });
        dial.gate.animate([{ transform: 'scale(1.35)', opacity: 0.2 }, { transform: 'scale(1)', opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
        dial.pulse.animate([{ transform: 'translateY(-100%)' }, { transform: 'translateY(240%)' }], { duration: 700, easing: 'cubic-bezier(.5,0,.5,1)' });
      }
    }
    scheduleDial();
  }

  function onTile(j) {
    if (dial.moving) return;
    if (j === dial.active) { openModal(j, $('.tile-photo', tiles[j])); return; }
    const n = MEMBERS.length;
    const d = mod(j - mod(dial.rot, n), n);
    turnTo(d <= n / 2 ? dial.rot + d : dial.rot - (n - d));
  }

  // okamžitě (bez animace) postaví člena i do brány — pro detail
  function dialSet(i) {
    const n = MEMBERS.length;
    const d = mod(i - mod(dial.rot, n), n);
    turnTo(d <= n / 2 ? dial.rot + d : dial.rot - (n - d), true);
  }

  function scheduleDial() {
    clearTimeout(dial.timer);
    if (!dial.visible || dial.hovering || modal.open || document.hidden || reduced || MEMBERS.length < 2 || dial.active < 0 || dial.moving) return;
    dial.timer = setTimeout(() => turnTo(dial.rot + 1), DIAL_MS);
  }

  function measureSigil() {
    const o = pageOffset(dial.el);
    dial.box = { x: o.x, y: o.y, w: dial.el.offsetWidth, h: dial.el.offsetHeight };
  }

  function updateSigil(now) {
    if (!dial.visible || reduced) return;
    const b = dial.box, p = state.pointer;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2 - state.scrollY;
    const active = p.active && now - p.lastMove < 4000;
    const tx = active ? clamp((p.x - cx) / (b.w * 0.8), -1, 1) * 10 : Math.sin(now * 0.0003) * 3;
    const ty = active ? clamp((p.y - cy) / (b.h * 0.8), -1, 1) * -8 : Math.cos(now * 0.00025) * 2;
    dial.ry = lerp(dial.ry, tx, 0.06);
    dial.rx = lerp(dial.rx, ty, 0.06);
    dial.tilt.style.transform = `rotateX(${dial.rx.toFixed(2)}deg) rotateY(${dial.ry.toFixed(2)}deg)`;
  }

  /* =========================================================
     DETAIL ČLENA — modal se „sdíleným“ přechodem fotky
     ========================================================= */

  const modal = {
    el: $('#modal'),
    media: $('#modalMedia'),
    img: $('#modalImg'),
    num: $('#modalNum'),
    name: $('#modalName'),
    first: $('#modalFirst'),
    nick: $('#modalNick'),
    last: $('#modalLast'),
    quote: $('#modalQuote'),
    bio: $('#modalBio'),
    facts: $('#modalFacts'),
    deckWrap: $('#modalDeck'),
    deck: $('#deck'),
    deckCards: [],
    close: $('.modal-close'),
    prev: $('#modalPrev'),
    next: $('#modalNext'),
    index: -1,
    open: false,
    busy: false,
    lastFocus: null,
  };

  function buildDeck() {
    if (MEMBERS.length < 2) { modal.deckWrap.hidden = true; return; }
    modal.deck.innerHTML = MEMBERS.map((m, i) => `
      <button type="button" class="deck-card" data-i="${i}" aria-label="${esc(fullName(m) || `Člen ${i + 1}`)}">
        <img src="${esc(photoOf(i))}" alt="" loading="lazy"><span>${roman(i + 1)}</span>
      </button>`).join('');
    modal.deckCards = $$('.deck-card', modal.deck);
    modal.deckCards.forEach((b) => {
      const img = $('img', b);
      img.addEventListener('error', () => { img.src = PLACEHOLDER; }, { once: true });
      b.addEventListener('click', () => goTo(Number(b.dataset.i)));
    });
  }

  function layoutDeck(i) {
    const stepPx = small ? 40 : 46;
    modal.deckCards.forEach((b, j) => {
      const d = j - i, ad = Math.abs(d);
      const hidden = ad > 4;
      b.style.setProperty('--dx', `${d * stepPx}px`);
      b.style.setProperty('--sc', d === 0 ? '1.3' : '1');
      b.style.opacity = hidden ? '0' : String(1 - ad * 0.18);
      b.style.zIndex = String(50 - ad);
      b.style.pointerEvents = hidden ? 'none' : '';
      b.tabIndex = hidden ? -1 : 0;
      b.classList.toggle('is-active', d === 0);
    });
  }

  function fillModal(i) {
    const m = MEMBERS[i] || {};
    modal.img.src = photoOf(i);
    modal.img.alt = m.photo ? fullName(m) : '';
    modal.img.onerror = () => { modal.img.onerror = null; modal.img.src = PLACEHOLDER; };
    modal.num.textContent = roman(i + 1);
    modal.first.textContent = m.name || '';
    modal.nick.textContent = m.nick ? `„${m.nick}“` : '';
    modal.last.textContent = m.surname || '';
    modal.name.setAttribute('aria-label', fullName(m));
    modal.quote.textContent = m.quote ? `„${m.quote}“` : '';
    modal.bio.textContent = m.bio || '';
    modal.facts.innerHTML = (Array.isArray(m.facts) ? m.facts : [])
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    layoutDeck(i);
  }

  function scrambleName(i, duration) {
    const m = MEMBERS[i] || {};
    scramble(modal.first, m.name || '', duration);
    scramble(modal.last, m.surname || '', duration + 150);
  }

  function flyGhost(src, from, to, done, r0 = '14px', r1 = '14px', fade = false) {
    if (reduced) { done(); return; }
    const g = document.createElement('div');
    g.className = 'ghost';
    g.innerHTML = `<img src="${esc(src)}" alt="">`;
    document.body.appendChild(g);
    const box = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const anim = g.animate([
      { ...box(from), borderRadius: r0, transform: 'perspective(1200px) rotateY(0deg) scale(1)' },
      { transform: 'perspective(1200px) rotateY(-10deg) scale(1.03)', offset: 0.45 },
      { ...box(to), borderRadius: r1, transform: 'perspective(1200px) rotateY(0deg) scale(1)', opacity: fade ? 0 : 1 },
    ], { duration: 900, easing: 'cubic-bezier(.75,0,.15,1)', fill: 'forwards' });
    anim.onfinish = () => { done(); requestAnimationFrame(() => g.remove()); };
  }

  function lockScroll(on) {
    const sbw = innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = on && sbw > 0 ? `${sbw}px` : '';
    document.body.classList.toggle('is-locked', on);
  }

  function openModal(i, fromEl) {
    if (modal.busy || modal.open || !MEMBERS[i]) return;
    modal.busy = true;
    modal.open = true;
    modal.index = i;
    modal.lastFocus = document.activeElement;
    fillModal(i);
    lockScroll(true);
    modal.el.scrollTop = 0;
    modal.el.classList.add('is-open');
    modal.el.setAttribute('aria-hidden', 'false');

    const src = fromEl || dial.altarPhoto;
    const from = src.getBoundingClientRect();
    const to = modal.media.getBoundingClientRect();
    clearTimeout(dial.timer);
    src.classList.add('is-src-away');
    modal.src = src;
    flyGhost(photoOf(i), from, to, () => {
      modal.el.classList.add('is-in');
      scrambleName(i, 800);
      modal.close.focus({ preventScroll: true });
      modal.busy = false;
    }, '0px', '2px');
  }

  function closeModal() {
    if (!modal.open || modal.busy) return;
    modal.busy = true;
    const i = modal.index;
    if (dial.active !== i || dial.moving) dialSet(i);
    let to = dial.altarPhoto.getBoundingClientRect();
    if (to.bottom < 0 || to.top > state.vh) {
      const y = scrollY + to.top - (state.vh - to.height) / 2;
      document.documentElement.style.scrollBehavior = 'auto';
      scrollTo(0, y);
      document.documentElement.style.scrollBehavior = '';
      to = dial.altarPhoto.getBoundingClientRect();
    }
    if (modal.src) modal.src.classList.remove('is-src-away');
    dial.altarPhoto.classList.add('is-src-away');
    const from = modal.media.getBoundingClientRect();
    modal.el.classList.remove('is-in');
    modal.el.classList.add('is-closing');
    flyGhost(photoOf(i), from, to, () => {
      dial.altarPhoto.classList.remove('is-src-away');
      modal.el.classList.remove('is-open', 'is-closing', 'is-switching');
      modal.el.setAttribute('aria-hidden', 'true');
      lockScroll(false);
      modal.open = false;
      modal.busy = false;
      scheduleDial();
      if (modal.lastFocus) modal.lastFocus.focus({ preventScroll: true });
    }, '2px', '0px');
  }

  function goTo(next) {
    if (!modal.open || modal.busy || next === modal.index || !MEMBERS[next]) return;
    modal.busy = true;
    layoutDeck(next);
    modal.el.classList.add('is-switching');
    setTimeout(() => {
      modal.index = next;
      fillModal(next);
      dialSet(next);
      requestAnimationFrame(() => {
        modal.el.classList.remove('is-switching');
        scrambleName(next, 700);
        modal.busy = false;
      });
    }, 300);
  }

  const stepModal = (dir) => goTo((modal.index + dir + MEMBERS.length) % MEMBERS.length);

  function initModal() {
    buildDeck();
    $$('[data-close]', modal.el).forEach((b) => b.addEventListener('click', closeModal));
    modal.prev.addEventListener('click', () => stepModal(-1));
    modal.next.addEventListener('click', () => stepModal(1));
    document.addEventListener('keydown', (e) => {
      if (!modal.open) return;
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
      else if (e.key === 'ArrowRight') stepModal(1);
      else if (e.key === 'ArrowLeft') stepModal(-1);
      else if (e.key === 'Tab') {
        const f = $$('button', modal.el).filter((b) => !b.hidden && b.tabIndex >= 0 && !b.closest('[hidden]'));
        const at = f.indexOf(document.activeElement);
        e.preventDefault();
        f[at === -1 ? 0 : (at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    let sx = 0, sy = 0;
    modal.media.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    modal.media.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) stepModal(dx < 0 ? 1 : -1);
    });
  }

  /* =========================================================
     KONTAKT
     ========================================================= */

  const footer = { el: $('#kontakt'), title: $('#footerTitle'), chars: [], logo: $('#footerLogo'), logoBox: { x: 0, y: 0, w: 1, h: 1 }, visible: false, light: { x: 50, y: 50 } };

  function buildContacts() {
    const ul = $('#contacts');
    ul.innerHTML = CONTACTS.map((c, i) => `
      <li class="contact">
        <a href="${esc(c.href || '#')}" ${/^https?:/.test(c.href || '') ? 'target="_blank" rel="noopener"' : ''} data-i="${i}" data-cursor="↗">
          <span class="contact-label">${esc(c.label)}</span>
          <span class="contact-value">${esc(c.value)}</span>
          <span class="contact-arrow" aria-hidden="true">↗</span>
        </a>
      </li>`).join('');
    $$('a', ul).forEach((a) => {
      const c = CONTACTS[Number(a.dataset.i)];
      if (!c.copy) return;
      a.addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(c.value).then(() => toast('Zkopírováno'), () => {});
      });
    });
  }

  function buildFooterTitle() {
    const el = footer.title;
    const text = el.textContent;
    el.textContent = '';
    Array.from(text).forEach((c) => {
      const s = document.createElement('span');
      s.className = 'ft-ch';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = c === ' ' ? ' ' : c;
      el.appendChild(s);
      footer.chars.push({ el: s, cx: 0, cy: 0, w: 900, d: 125 });
    });
    measureFooter();
    new IntersectionObserver(([e]) => { footer.visible = e.isIntersecting; if (e.isIntersecting) measureFooter(); }).observe(footer.el);
  }

  function measureFooter() {
    const saved = footer.chars.map((c) => c.el.style.fontVariationSettings);
    footer.chars.forEach((c) => { c.el.style.fontVariationSettings = ''; });
    footer.chars.forEach((c) => {
      const o = pageOffset(c.el);
      c.cx = o.x + c.el.offsetWidth / 2;
      c.cy = o.y + c.el.offsetHeight / 2;
    });
    footer.chars.forEach((c, i) => { c.el.style.fontVariationSettings = saved[i]; });
    const o = pageOffset(footer.logo);
    footer.logoBox = { x: o.x, y: o.y, w: footer.logo.offsetWidth, h: footer.logo.offsetHeight };
  }

  function updateFooter(now) {
    if (!footer.visible || reduced) return;
    const { pointer, scrollY: sy, vw } = state;
    const R = Math.max(220, vw * 0.22);
    const active = pointer.active && now - pointer.lastMove < 6000;
    for (const c of footer.chars) {
      const dist = Math.hypot(pointer.x - c.cx, pointer.y + sy - c.cy);
      const inf = active ? Math.pow(clamp(1 - dist / R, 0, 1), 1.4) : 0;
      const tw = 900 - inf * 780, td = 125 - inf * 60;
      if (Math.abs(tw - c.w) < 0.5 && Math.abs(td - c.d) < 0.2) continue;
      c.w = lerp(c.w, tw, 0.12);
      c.d = lerp(c.d, td, 0.12);
      c.el.style.fontVariationSettings = `"wght" ${c.w.toFixed(0)}, "wdth" ${c.d.toFixed(1)}`;
    }

    // baterka nad logem
    const b = footer.logoBox;
    const top = b.y - sy;
    if (top + b.h < 0 || top > state.vh) return;
    let tx, ty;
    if (active && finePointer) {
      tx = ((pointer.x - b.x) / b.w) * 100;
      ty = ((pointer.y - top) / b.h) * 100;
    } else {
      tx = 50 + Math.cos(now * 0.0006) * 28;
      ty = 50 + Math.sin(now * 0.0009) * 18;
    }
    footer.light.x = lerp(footer.light.x, tx, 0.08);
    footer.light.y = lerp(footer.light.y, ty, 0.08);
    footer.logo.style.setProperty('--mx', `${footer.light.x.toFixed(2)}%`);
    footer.logo.style.setProperty('--my', `${footer.light.y.toFixed(2)}%`);
  }

  /* =========================================================
     UKAZATEL SCROLLU + SCRAMBLE NADPISŮ
     ========================================================= */

  const railFill = $('.rail-fill');
  let railLast = '';
  function updateRail() {
    const max = document.documentElement.scrollHeight - state.vh;
    const t = `scaleY(${clamp(state.scrollY / (max || 1), 0, 1).toFixed(4)})`;
    if (t !== railLast) { railFill.style.transform = t; railLast = t; }
  }

  function initScrambles() {
    $$('[data-scramble]').forEach((el) => {
      const text = el.textContent;
      el.setAttribute('aria-label', text);
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        scramble(el, text, 1300);
        io.disconnect();
      }, { threshold: 0.6 });
      io.observe(el);
    });
  }

  /* =========================================================
     KURZOR
     ========================================================= */

  const cursor = { el: $('.cursor'), dot: $('.cursor-dot'), ring: $('.cursor-ring'), label: $('.cursor-label'), x: 0, y: 0, down: false };

  function initCursor() {
    if (!finePointer) return;
    document.documentElement.classList.add('has-cursor');
    cursor.x = state.pointer.x;
    cursor.y = state.pointer.y;
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-cursor], a, button');
      const label = t && t.dataset.cursor;
      cursor.el.classList.toggle('is-hover', !!label);
      cursor.el.classList.toggle('is-link', !!t && !label);
      if (label) cursor.label.textContent = label;
    });
    document.addEventListener('pointerdown', () => { cursor.down = true; });
    document.addEventListener('pointerup', () => { cursor.down = false; });
    document.documentElement.addEventListener('pointerleave', () => cursor.el.classList.add('is-hidden'));
    document.documentElement.addEventListener('pointerenter', () => cursor.el.classList.remove('is-hidden'));
  }

  function updateCursor() {
    if (!finePointer) return;
    const p = state.pointer;
    cursor.x = lerp(cursor.x, p.x, 0.2);
    cursor.y = lerp(cursor.y, p.y, 0.2);
    cursor.dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    cursor.ring.style.transform = `translate3d(${cursor.x.toFixed(1)}px, ${cursor.y.toFixed(1)}px, 0)${cursor.down ? ' scale(.8)' : ''}`;
  }

  /* =========================================================
     LOADER
     ========================================================= */

  function runLoader() {
    const loader = $('#loader');
    return new Promise((resolve) => {
      if (reduced) { loader.remove(); resolve(); return; }
      let seen = false;
      try { seen = sessionStorage.getItem('lfl-seen') === '1'; sessionStorage.setItem('lfl-seen', '1'); } catch (e) { /* bez úložiště */ }
      const duration = seen ? 1100 : 2700;
      const count = $('.loader-count', loader);
      const fill = $('.loader-line span', loader);
      const fonts = Promise.race([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        new Promise((r) => setTimeout(r, 3500)),
      ]);
      const start = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        loader.classList.add('is-leaving');
        setTimeout(() => loader.classList.add('is-done'), 450);
        setTimeout(() => loader.remove(), 1600);
        setTimeout(resolve, 300);
      };
      loader.addEventListener('click', finish);
      const frame = (now) => {
        if (done) return;
        const t = clamp((now - start) / duration, 0, 1);
        const e = t < 0.55 ? t * 1.25 : 0.6875 + (1 - Math.pow(1 - (t - 0.55) / 0.45, 3)) * 0.3125;
        const v = clamp(e, 0, 1);
        count.textContent = String(Math.round(v * 100)).padStart(3, '0');
        fill.style.transform = `scaleX(${v.toFixed(3)})`;
        if (t < 1) requestAnimationFrame(frame);
        else fonts.then(() => setTimeout(finish, 220));
      };
      requestAnimationFrame(frame);
    });
  }

  /* =========================================================
     EASTER EGGY — napiš na klávesnici „lfl“ nebo „burdys“
     ========================================================= */

  function eggLfl() {
    const html = document.documentElement;
    [0, 90, 180, 300].forEach((t, i) => setTimeout(() => html.classList.toggle('is-inverted', i % 2 === 0), t));
    hero.letters.forEach((L, i) => setTimeout(() => flicker(L), i * 40));
    signs.items.forEach((s, i) => setTimeout(() => flickerSign(s), i * 30));
    state.flash = 1;
    setTimeout(() => acronym(2200), 600);
  }

  // zprava doleva pomalinku propluje Bonnie; na dotek myši se lekne
  function eggBurdys() {
    if ($('.burd')) return;
    const wrap = document.createElement('div');
    wrap.className = 'burd';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<div class="burd-dodge"><div class="burd-spin"><img alt="" src="img/bonnieburd.png"></div></div>';
    const img = $('img', wrap), dodge = $('.burd-dodge', wrap), spin = $('.burd-spin', wrap);
    document.body.appendChild(wrap);

    let dy = 0, inside = false, cooldown = 0;
    const spook = (dir) => {
      // 1) uskočí od kurzoru (u okraje obrazovky na druhou stranu)
      const jump = innerHeight * 0.3, limit = innerHeight * 0.28;
      let next = dy + dir * jump;
      if (Math.abs(next) > limit) next = dy - dir * jump;
      dy = clamp(next, -limit, limit);
      dodge.style.transform = `translateY(${dy.toFixed(0)}px)`;
      if (reduced) return;
      // 2) protočí se
      spin.animate([
        { transform: 'rotate(0deg) scale(1)' },
        { transform: `rotate(${dir * 200}deg) scale(1.2)`, offset: 0.45 },
        { transform: `rotate(${dir * 360}deg) scale(1)` },
      ], { duration: 900, easing: 'cubic-bezier(.3,.7,.3,1)' });
      // 3) zaglitchuje
      img.animate([
        { filter: 'none' },
        { filter: 'invert(1)', offset: 0.08 },
        { filter: 'none', offset: 0.16 },
        { filter: 'grayscale(1) contrast(3)', offset: 0.28 },
        { filter: 'none', offset: 0.4 },
        { filter: 'invert(1) hue-rotate(90deg)', offset: 0.5 },
        { filter: 'none', offset: 0.62 },
        { filter: 'none' },
      ], { duration: 750 });
      // 4) chvíli prchá rychleji
      const slide = wrap.getAnimations().find((a) => a.animationName === 'burdSlide');
      if (slide) {
        [[0, 4], [350, 2.6], [650, 1.6], [950, 1]].forEach(([t, r]) => setTimeout(() => { slide.playbackRate = r; }, t));
      }
      state.flash = Math.max(state.flash, 0.6);
    };
    const onMove = (e) => {
      const r = img.getBoundingClientRect();
      const hit = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      const now = performance.now();
      if (hit && !inside && now > cooldown) {
        cooldown = now + 1000;
        spook(e.clientY < r.top + r.height / 2 ? 1 : -1);
      }
      inside = hit;
    };
    addEventListener('pointermove', onMove, { passive: true });

    const go = () => wrap.classList.add('is-go');
    (img.decode ? img.decode() : Promise.resolve()).then(go, go);
    wrap.addEventListener('animationend', (e) => {
      if (e.target !== wrap) return;
      removeEventListener('pointermove', onMove);
      wrap.remove();
    });
  }

  function initEasterEgg() {
    const eggs = { lfl: eggLfl, burdys: eggBurdys };
    let buf = '';
    document.addEventListener('keydown', (e) => {
      if (e.key.length !== 1 || modal.open || e.ctrlKey || e.metaKey || e.altKey) return;
      buf = (buf + e.key.toLowerCase()).slice(-12);
      for (const code in eggs) {
        if (buf.endsWith(code)) { buf = ''; eggs[code](); break; }
      }
    });
    console.log('%c LFL ', 'font: 900 42px/1 Arial Black, sans-serif; color:#000; background:#e6e6e6; padding:10px 18px;');
    console.log('%cThere\'s no limit to the larp. Zkus napsat „lfl“.', 'font: 12px monospace; color:#888;');
  }

  /* =========================================================
     START
     ========================================================= */

  let fog = null;

  function measureAll() {
    measureHero();
    measureTapes();
    measureSigil();
    measureSigns();
    measureFooter();
  }

  function onResize() {
    state.vw = innerWidth;
    state.vh = innerHeight;
    measureAll();
    if (fog) fog.resize();
  }

  function loop() {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(64, now - last);
      last = now;
      state.scrollY = scrollY;
      state.velocity = lerp(state.velocity, state.scrollY - state.lastScrollY, 0.2);
      state.lastScrollY = state.scrollY;
      state.flash *= 0.94;
      state.pulse = Math.max(ripplePulse(now), state.flash);

      updateCursor();
      updateHero(now);
      updateSayings(now);
      updateTapes(dt);
      updateSigil(now);
      updateSigns(dt);
      updateFooter(now);
      updateRail();
      if (fog) fog.render(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function init() {
    document.getElementById('year').textContent = new Date().getFullYear();
    makeGrain();
    buildHero();
    buildSayings();
    buildTapes();
    buildSigil();
    buildSigns();
    buildContacts();
    buildFooterTitle();
    initHero();
    initDeviceTilt();
    initModal();
    initScrambles();
    initCursor();
    initEasterEgg();
    startClock();
    fog = initFog();

    addEventListener('pointermove', (e) => {
      state.pointer.x = e.clientX;
      state.pointer.y = e.clientY;
      state.pointer.active = true;
      state.pointer.lastMove = performance.now();
    }, { passive: true });
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(onResize, 150); });
    $('#toTop').addEventListener('click', () => scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }));

    measureAll();
    if (document.fonts) document.fonts.ready.then(measureAll);
    addEventListener('load', measureAll);

    loop();
    runLoader().then(() => {
      document.body.classList.remove('is-loading');
      measureHero();
      introHero();
    });
  }

  init();
})();
