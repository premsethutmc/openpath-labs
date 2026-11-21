// Minimal WebGL renderer for engineering scenes: boxes and cylinders, one light, translucency.
// No dependencies. Matrices are column-major Float32Array(16).

export const m4 = {
  id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
    }
    return o;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  },
  lookAt(e, t, u) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = norm(sub(e, t)), x = norm(cross(u, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
  translate: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
  scale: (x, y, z) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]),
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  chain(...ms) { return ms.reduce((a, b) => m4.mul(a, b)); },
};

// Normal matrix = transpose(inverse(upper 3×3)). In column-major storage that is simply inverse(A) written row by row.
function normalMatrix(m) {
  const A = (r, c) => m[c * 4 + r];
  const c00 = A(1, 1) * A(2, 2) - A(1, 2) * A(2, 1), c01 = A(1, 2) * A(2, 0) - A(1, 0) * A(2, 2), c02 = A(1, 0) * A(2, 1) - A(1, 1) * A(2, 0);
  const det = A(0, 0) * c00 + A(0, 1) * c01 + A(0, 2) * c02 || 1;
  const inv = [
    [c00, A(0, 2) * A(2, 1) - A(0, 1) * A(2, 2), A(0, 1) * A(1, 2) - A(0, 2) * A(1, 1)],
    [c01, A(0, 0) * A(2, 2) - A(0, 2) * A(2, 0), A(0, 2) * A(1, 0) - A(0, 0) * A(1, 2)],
    [c02, A(0, 1) * A(2, 0) - A(0, 0) * A(2, 1), A(0, 0) * A(1, 1) - A(0, 1) * A(1, 0)],
  ];
  return new Float32Array(inv.flat().map(v => v / det));
}

function boxGeometry() {
  const p = [], n = [], idx = [];
  const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
  for (const [a, b, c, s] of faces) {
    const base = p.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const q = [0, 0, 0]; q[a] = u * 0.5; q[b] = v * 0.5 * s; q[c] = 0.5 * s;
      p.push(...q); const nn = [0, 0, 0]; nn[c] = s; n.push(...nn);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { p, n, idx };
}

function cylinderGeometry(seg = 28) {
  const p = [], n = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    p.push(x, -0.5, z, x, 0.5, z); n.push(x, 0, z, x, 0, z);
  }
  for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  for (const y of [-0.5, 0.5]) {
    const c = p.length / 3; p.push(0, y, 0); n.push(0, Math.sign(y), 0);
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; p.push(Math.cos(a), y, Math.sin(a)); n.push(0, Math.sign(y), 0); }
    for (let i = 0; i < seg; i++) y > 0 ? idx.push(c, c + 1 + i, c + 2 + i) : idx.push(c, c + 2 + i, c + 1 + i);
  }
  return { p, n, idx };
}

const VS = `attribute vec3 aP; attribute vec3 aN; uniform mat4 uVP; uniform mat4 uM; uniform mat3 uN;
varying vec3 vN; varying vec3 vW;
void main(){ vec4 w = uM * vec4(aP,1.0); vW = w.xyz; vN = uN * aN; gl_Position = uVP * w; }`;
const FS = `precision mediump float; uniform vec4 uC; uniform vec3 uL; uniform vec3 uEye; uniform float uShine; uniform float uGlow;
varying vec3 vN; varying vec3 vW;
void main(){ vec3 N = normalize(vN); vec3 V = normalize(uEye - vW); if (dot(N,V) < 0.0) N = -N;
  float d = max(dot(N, uL), 0.0); float fill = max(dot(N, normalize(vec3(-0.4,0.3,-0.8))), 0.0) * 0.25;
  vec3 h = normalize(uL + V); float sp = pow(max(dot(N,h),0.0), 48.0) * uShine;
  float rim = pow(1.0 - max(dot(N,V),0.0), 3.0) * 0.18;
  vec3 col = uC.rgb * (0.30 + 0.70*d + fill) + sp + rim + uC.rgb * uGlow;
  gl_FragColor = vec4(col, uC.a); }`;

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  gl.useProgram(prog);
  const loc = n => gl.getUniformLocation(prog, n), aP = gl.getAttribLocation(prog, 'aP'), aN = gl.getAttribLocation(prog, 'aN');
  const U = { vp: loc('uVP'), m: loc('uM'), n: loc('uN'), c: loc('uC'), l: loc('uL'), eye: loc('uEye'), shine: loc('uShine'), glow: loc('uGlow') };
  const upload = g => {
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.p), gl.STATIC_DRAW);
    const nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.n), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(g.idx), gl.STATIC_DRAW);
    return { vb, nb, ib, count: g.idx.length };
  };
  const geoms = { box: upload(boxGeometry()), cyl: upload(cylinderGeometry()) };
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function draw(items, cam) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const eye = [cam.target[0] + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)];
    const vp = m4.mul(m4.perspective(0.75, w / h, 1, 500), m4.lookAt(eye, cam.target, [0, 1, 0]));
    gl.uniformMatrix4fv(U.vp, false, vp);
    const L = [0.45, 0.8, 0.55], l = Math.hypot(...L); gl.uniform3f(U.l, L[0] / l, L[1] / l, L[2] / l); gl.uniform3f(U.eye, ...eye);
    const solid = items.filter(i => (i.color[3] ?? 1) >= 1), glass = items.filter(i => (i.color[3] ?? 1) < 1);
    const pass = (list, transparent) => {
      gl.depthMask(!transparent); transparent ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);
      transparent ? gl.disable(gl.CULL_FACE) : gl.enable(gl.CULL_FACE);
      for (const it of list) {
        const g = geoms[it.shape];
        gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(aP);
        gl.bindBuffer(gl.ARRAY_BUFFER, g.nb); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(aN);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib);
        gl.uniformMatrix4fv(U.m, false, it.m); gl.uniformMatrix3fv(U.n, false, normalMatrix(it.m));
        gl.uniform4f(U.c, it.color[0], it.color[1], it.color[2], it.color[3] ?? 1);
        gl.uniform1f(U.shine, it.shine ?? 0.25); gl.uniform1f(U.glow, it.glow ?? 0);
        gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_SHORT, 0);
      }
    };
    pass(solid, false); pass(glass, true);
  }
  return { draw, gl };
}

export const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, a];
