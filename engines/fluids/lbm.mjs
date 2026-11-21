// Fluids engine v1: 2D lattice Boltzmann method (D2Q9, two-relaxation-time collision, Λ = 3/16).
// Solves the incompressible Navier–Stokes equations in the low-Mach limit. Lattice units: dx = dt = 1, ρ ≈ 1,
// pressure p = ρ/3. Solid cells use half-way bounce-back (no-slip); forces on bodies by momentum exchange.
// Boundaries: x = 0 velocity inlet (equilibrium), x = nx−1 zero-gradient outlet; y walls are no-slip ('walls')
// or periodic ('open', an unbounded stream approximated by a periodic array).

const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1], EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];

export class Tunnel {
  constructor(nx, ny, { nu = 0.02, u0 = 0.06, walls = 'open', profile = 'uniform', force = 0, periodicX = false, les = false } = {}) {
    Object.assign(this, { nx, ny, nu, u0, walls, profile, force, periodicX, les });
    const N = nx * ny;
    this.f = new Float32Array(9 * N); this.g = new Float32Array(9 * N);
    this.solid = new Uint8Array(N);       // 1 = wall, 2 = measured body
    this.rho = new Float32Array(N); this.ux = new Float32Array(N); this.uy = new Float32Array(N);
    this.fx = 0; this.fy = 0; this.t = 0;
    if (walls === 'walls') for (let x = 0; x < nx; x++) { this.solid[x] = 1; this.solid[(ny - 1) * nx + x] = 1; }
    for (let k = 0; k < N; k++) this.setEq(k, 1, this.inletU(Math.floor(k / nx)), 0);
  }
  inletU(y) {
    if (this.profile === 'none') return 0;
    if (this.profile === 'parabolic') { const H = this.ny - 2, s = (y - 0.5) / H; return s <= 0 || s >= 1 ? 0 : 6 * this.u0 * s * (1 - s); } // mean = u0
    return this.u0;
  }
  setEq(k, rho, ux, uy) {
    const usq = 1.5 * (ux * ux + uy * uy);
    for (let i = 0; i < 9; i++) { const eu = 3 * (EX[i] * ux + EY[i] * uy); this.f[9 * k + i] = W[i] * rho * (1 + eu + 0.5 * eu * eu - usq); }
    this.rho[k] = rho; this.ux[k] = ux; this.uy[k] = uy;
  }
  setNu(nu) { this.nu = Math.max(nu, 0.0005); }
  healthy() { for (let k = 0; k < this.rho.length; k += 7) if (!Number.isFinite(this.rho[k]) || this.rho[k] > 3 || this.rho[k] < 0.3) return false; return true; }
  // Mark cells inside a shape function (x, y) → bool as solid body (2) or wall (1); clearing with value 0.
  paint(fn, value = 2) {
    for (let y = 1; y < this.ny - 1; y++) for (let x = 1; x < this.nx - 1; x++) if (fn(x, y)) {
      const k = y * this.nx + x; this.solid[k] = value;
      if (value === 0) this.setEq(k, 1, 0, 0);
    }
  }
  clearBodies() { for (let k = 0; k < this.solid.length; k++) if (this.solid[k] === 2) { this.solid[k] = 0; this.setEq(k, 1, 0, 0); } }

  step(n = 1) {
    const { nx, ny, solid } = this;
    // Sponge: viscosity rises smoothly over the last `sponge` fraction of the tunnel so pressure waves leaving the
    // domain are absorbed instead of reflecting back (keeps acoustic noise out of the force measurement).
    const spongeStart = this.periodicX ? Infinity : Math.floor(nx * (1 - (this.sponge ?? 0.15)));
    const rates = new Float64Array(nx * 2);
    for (let x = 0; x < nx; x++) {
      const z = x < spongeStart ? 0 : (x - spongeStart) / Math.max(1, nx - spongeStart), nuX = this.nu * (1 + 40 * z * z);
      const tP = 3 * nuX + 0.5; rates[2 * x] = 1 / tP; rates[2 * x + 1] = 1 / ((3 / 16) / (tP - 0.5) + 0.5);
    }
    let wP = rates[0], wM = rates[1];
    const open = this.walls === 'open', perX = !!this.periodicX, F = this.force;
    const post = new Float64Array(9);
    const ux_ = this.ux, uy_ = this.uy, rho_ = this.rho;
    for (let s = 0; s < n; s++) {
      const f = this.f, g = this.g;
      let Fx = 0, Fy = 0;
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const k = y * nx + x;
        if (solid[k]) continue;
        wP = rates[2 * x]; wM = rates[2 * x + 1];
        const b = 9 * k;
        let rho, ux, uy;
        if (!perX && (x === 0 || x === nx - 1)) {
          // inlet: prescribed velocity, density from the neighbour; outlet: fixed pressure (ρ = 1), velocity from the neighbour
          const kn = x === 0 ? k + 1 : k - 1;
          if (x === 0) { ux = this.inletU(y); uy = 0; rho = rho_[kn] || 1; } else { ux = ux_[kn]; uy = uy_[kn]; rho = 1; }
          const us = 1.5 * (ux * ux + uy * uy);
          for (let i = 0; i < 9; i++) { const eu = 3 * (EX[i] * ux + EY[i] * uy); f[b + i] = W[i] * rho * (1 + eu + 0.5 * eu * eu - us); }
        } else {
          const f0 = f[b], f1 = f[b + 1], f2 = f[b + 2], f3 = f[b + 3], f4 = f[b + 4], f5 = f[b + 5], f6 = f[b + 6], f7 = f[b + 7], f8 = f[b + 8];
          rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
          ux = (f1 - f3 + f5 - f6 - f7 + f8 + 0.5 * F) / rho; uy = (f2 - f4 + f5 + f6 - f7 - f8) / rho;
        }
        rho_[k] = rho; ux_[k] = ux; uy_[k] = uy;
        const usq = 1.5 * (ux * ux + uy * uy), r9 = rho / 9, r36 = rho / 36;
        const e0 = 4 * r9 * (1 - usq);
        const a1 = 3 * ux, a2 = 3 * uy, a5 = 3 * (ux + uy), a6 = 3 * (-ux + uy);
        // equilibria (symmetric and antisymmetric parts per opposite pair)
        const s1 = r9 * (1 + 0.5 * a1 * a1 - usq), d1 = r9 * a1;
        const s2 = r9 * (1 + 0.5 * a2 * a2 - usq), d2 = r9 * a2;
        const s5 = r36 * (1 + 0.5 * a5 * a5 - usq), d5 = r36 * a5;
        const s6 = r36 * (1 + 0.5 * a6 * a6 - usq), d6 = r36 * a6;
        const g0 = f[b], g1 = f[b + 1], g3 = f[b + 3], g2 = f[b + 2], g4 = f[b + 4], g5 = f[b + 5], g7 = f[b + 7], g6 = f[b + 6], g8 = f[b + 8];
        if (this.les) {
          // Smagorinsky sub-grid model (C = 0.1): extra eddy viscosity from the non-equilibrium momentum flux. Lets the
          // tunnel run at higher Reynolds numbers without blowing up; labelled as a turbulence model in the interface.
          const n1 = g1 - (s1 + d1), n3 = g3 - (s1 - d1), n2 = g2 - (s2 + d2), n4 = g4 - (s2 - d2);
          const n5 = g5 - (s5 + d5), n7 = g7 - (s5 - d5), n6 = g6 - (s6 + d6), n8 = g8 - (s6 - d6);
          const pxx = n1 + n3 + n5 + n6 + n7 + n8, pyy = n2 + n4 + n5 + n6 + n7 + n8, pxy = n5 - n6 + n7 - n8;
          const Q = Math.sqrt(pxx * pxx + pyy * pyy + 2 * pxy * pxy), tau0 = 1 / rates[2 * x];
          const tau = 0.5 * (tau0 + Math.sqrt(tau0 * tau0 + 18 * Math.SQRT2 * 0.01 * Q / rho));
          wP = 1 / tau; wM = 1 / ((3 / 16) / (tau - 0.5) + 0.5);
        }
        post[0] = g0 - wP * (g0 - e0);
        let p = 0.5 * (g1 + g3), m = 0.5 * (g1 - g3);
        post[1] = g1 - wP * (p - s1) - wM * (m - d1); post[3] = g3 - wP * (p - s1) + wM * (m - d1);
        p = 0.5 * (g2 + g4); m = 0.5 * (g2 - g4);
        post[2] = g2 - wP * (p - s2) - wM * (m - d2); post[4] = g4 - wP * (p - s2) + wM * (m - d2);
        p = 0.5 * (g5 + g7); m = 0.5 * (g5 - g7);
        post[5] = g5 - wP * (p - s5) - wM * (m - d5); post[7] = g7 - wP * (p - s5) + wM * (m - d5);
        p = 0.5 * (g6 + g8); m = 0.5 * (g6 - g8);
        post[6] = g6 - wP * (p - s6) - wM * (m - d6); post[8] = g8 - wP * (p - s6) + wM * (m - d6);
        // Guo forcing split for TRT: odd (antisymmetric) part relaxes with ω−, even part with ω+
        if (F) for (let i = 0; i < 9; i++) post[i] += W[i] * F * ((1 - 0.5 * wM) * 3 * EX[i] + (1 - 0.5 * wP) * (-3 * ux + 9 * (EX[i] * ux + EY[i] * uy) * EX[i]));
        for (let i = 0; i < 9; i++) {
          let tx = x + EX[i], ty = y + EY[i];
          if (open) ty = ty < 0 ? ny - 1 : ty >= ny ? 0 : ty;
          if (perX) tx = tx < 0 ? nx - 1 : tx >= nx ? 0 : tx;
          else if (tx < 0 || tx >= nx) continue;   // leaves through inlet/outlet; those cells are reset next step
          if (ty < 0 || ty >= ny) { g[b + OPP[i]] = post[i]; continue; }
          const kt = ty * nx + tx, st = solid[kt];
          if (st) {
            g[b + OPP[i]] = post[i];                 // half-way bounce-back
            if (st === 2) { Fx += 2 * post[i] * EX[i]; Fy += 2 * post[i] * EY[i]; }
          } else g[9 * kt + i] = post[i];
        }
      }
      this.f = g; this.g = f; this.fx = Fx; this.fy = Fy; this.t++;
    }
  }
  // Pressure (lattice) and vorticity for display
  pressure(k) { return this.rho[k] / 3; }
  vorticity(x, y) {
    const { nx } = this, k = y * nx + x;
    if (x < 1 || y < 1 || x >= nx - 1 || y >= this.ny - 1) return 0;
    return (this.uy[k + 1] - this.uy[k - 1]) / 2 - (this.ux[k + nx] - this.ux[k - nx]) / 2;
  }
}

// Shapes in lattice coordinates.
export const shapes = {
  circle: (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r,
  rect: (x0, y0, w, h) => (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h,
  // NACA 4-digit symmetric section (0012 → t = 0.12), chord c, leading edge at (x0, y0), angle of attack in degrees (nose up).
  naca: (x0, y0, c, t, aoaDeg) => {
    const a = aoaDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);   // y is up: positive angle = nose up
    return (x, y) => {
      const dx = x - x0, dy = y - y0, u = (dx * ca - dy * sa) / c, v = (dx * sa + dy * ca) / c;
      if (u < 0 || u > 1) return false;
      const yt = 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
      return Math.abs(v) <= yt;
    };
  },
};
