"use strict";
/*
 * NPPAD-Edge, browser port.
 *
 * A faithful JavaScript re-implementation of the pure NumPy edge
 * runtime in the NPPAD-Edge project (nppad_edge/features.py +
 * bundle.py PrimaryModel), driven by the same exported parameters
 * (data/model.bin, layout in data/model.json):
 *
 *   raw window (6 x 88)
 *     -> LogHeavy -> ChannelScaler -> clip +/-10
 *     -> zero pad to 12 steps
 *     -> MultiRocket features (49,728) + HYDRA features (1,024)
 *     -> standardisation -> ridge head -> softmax
 *
 * Verified at build time against the NumPy runtime by
 * tools/verify_js.mjs on every shipped scenario window.
 */

function f32(x) { return Math.fround(x); }

class EdgeModel {
  constructor(modelJson, buffer) {
    this.classes = modelJson.classes;
    this.k = modelJson.constants;
    const L = modelJson.layout;
    this.a = {};
    for (const name of Object.keys(L)) {
      const { offset, shape, dtype } = L[name];
      const n = shape.reduce((s, v) => s * v, 1);
      this.a[name] = dtype === "float32"
        ? new Float32Array(buffer, offset, n)
        : new Int32Array(buffer, offset, n);
    }
  }

  preprocess(win) {
    // win: 6 x 88 raw values -> Float32Array(6*88), clip +/-10
    const T = this.k.steps, C = this.k.channels;
    const X = new Float32Array(T * C);
    for (let t = 0; t < T; t++)
      for (let c = 0; c < C; c++) X[t * C + c] = win[t][c];
    const idx = this.a.pre_log_idx, s = this.a.pre_log_s;
    for (let j = 0; j < idx.length; j++) {
      const c = idx[j], sc = s[j];
      for (let t = 0; t < T; t++) {
        const i = t * C + c;
        X[i] = f32(Math.log10(1 + Math.max(X[i], 0) / sc));
      }
    }
    const mu = this.a.pre_mu, sd = this.a.pre_sd, clip = this.k.clip;
    for (let i = 0; i < X.length; i++) {
      const c = i % C;
      let v = f32((X[i] - mu[c]) / sd[c]);
      X[i] = v > clip ? clip : (v < -clip ? -clip : v);
    }
    // transpose to (C, padTo), zero padded
    const P = this.k.padTo;
    const x = new Float32Array(C * P);
    for (let t = 0; t < T; t++)
      for (let c = 0; c < C; c++) x[c * P + t] = X[t * C + c];
    return x; // (C, P)
  }

  // ---- MultiRocket ----
  alphaGamma(x, C, T, dilation, refT) {
    const KL = 9, pad = ((KL - 1) * dilation) / 2;
    const A = new Float32Array(C * T), G = new Float32Array(C * T);
    for (let i = 0; i < C * T; i++) { A[i] = f32(-x[i]); G[i] = f32(3 * x[i]); }
    const Ca = A.slice();
    const Cg = new Float32Array(KL * C * T);
    for (let i = 0; i < C * T; i++) Cg[4 * C * T + i] = G[i];
    let end = refT - pad;
    for (let gi = 0; gi < 4; gi++) {
      if (end > 0) {
        for (let c = 0; c < C; c++) {
          const base = c * T, gbase = (gi * C + c) * T;
          for (let j = 0; j < end; j++) {
            Ca[base + (T - end) + j] = f32(Ca[base + (T - end) + j] + A[base + j]);
            Cg[gbase + (T - end) + j] = G[base + j];
          }
        }
      }
      end += dilation;
    }
    let start = dilation;
    for (let gi = 5; gi < 9; gi++) {
      if (start < T) {
        for (let c = 0; c < C; c++) {
          const base = c * T, gbase = (gi * C + c) * T;
          for (let j = 0; j < T - start; j++) {
            Ca[base + j] = f32(Ca[base + j] + A[base + j + start]);
            Cg[gbase + j] = G[base + j + start];
          }
        }
      }
      start += dilation;
    }
    return [Ca, Cg];
  }

  biasFeatures(Cc, biases, b0, B, out4) {
    const T = Cc.length;
    if (T === 0) { out4[0] = 0; out4[1] = 0; out4[2] = 0; out4[3] = -1; return; }
    for (let b = 0; b < B; b++) {
      const bias = biases[b0 + b];
      let cnt = 0, idxSum = 0, last = 0, stretch = -Infinity;
      let excess = 0;
      for (let j = 0; j < T; j++) {
        const v = Cc[j];
        if (v > bias) { cnt++; idxSum += j; excess = f32(excess + f32(v + bias)); }
        if (v < bias) { const st = j - last; if (st > stretch) stretch = st; last = j; }
      }
      const tail = (T - 1) - last;
      if (tail > stretch) stretch = tail;
      out4[b * 4 + 0] = cnt / T;
      out4[b * 4 + 1] = stretch;
      out4[b * 4 + 2] = cnt > 0 ? excess / Math.max(cnt, 1) : 0;
      out4[b * 4 + 3] = cnt > 0 ? idxSum / Math.max(cnt, 1) : -1;
    }
  }

  mrHalf(x, C, T, nchan, chan, dil, nfpd, bias, out, offset, nf, refT) {
    const dilation = dil[0], pad = ((9 - 1) * dilation) / 2;
    const [A, G] = this.alphaGamma(x, C, T, dilation, refT);
    const nFeat = nfpd[0];
    let chanStart = 0, featStart = 0;
    const tmp = new Float32Array(4 * 128);
    for (let ki = 0; ki < nchan.length; ki++) {
      const nch = nchan[ki];
      const taps = this.a.mr_indices;
      const i0 = taps[ki * 3], i1 = taps[ki * 3 + 1], i2 = taps[ki * 3 + 2];
      let Cc = null;
      for (let r = 0; r < nch; r++) {
        const c = chan[chanStart + r], base = c * T;
        const M = new Float32Array(T);
        for (let t = 0; t < T; t++) {
          let v = A[base + t];
          v = f32(v + G[(i0 * C + c) * T + t]);
          v = f32(v + G[(i1 * C + c) * T + t]);
          v = f32(v + G[(i2 * C + c) * T + t]);
          M[t] = v;
        }
        if (r === 0) Cc = M;
        else for (let t = 0; t < T; t++) Cc[t] = f32(Cc[t] + M[t]);
      }
      chanStart += nch;
      const padding1 = (0 + ki) % 2;
      let Cuse = Cc;
      if (padding1 === 1 && pad > 0) {
        Cuse = pad * 2 < Cc.length ? Cc.slice(pad, Cc.length - pad)
                                   : new Float32Array(0);
      }
      this.biasFeatures(Cuse, bias, featStart, nFeat, tmp);
      for (let b = 0; b < nFeat; b++) {
        const idx = offset + featStart + b;
        out[idx] = tmp[b * 4 + 0];
        out[idx + nf] = tmp[b * 4 + 1];
        out[idx + 2 * nf] = tmp[b * 4 + 2];
        out[idx + 3 * nf] = tmp[b * 4 + 3];
      }
      featStart += nFeat;
    }
  }

  multirocket(x, C, P) {
    const nf = this.a.mr0_bias.length; // 6216 per half
    const out = new Float32Array(nf * 8);
    this.mrHalf(x, C, P, this.a.mr0_nchan, this.a.mr0_chan,
      this.a.mr0_dil, this.a.mr0_nfpd, this.a.mr0_bias, out, 0, nf, P);
    const xd = new Float32Array(C * (P - 1));
    for (let c = 0; c < C; c++)
      for (let t = 0; t < P - 1; t++)
        xd[c * (P - 1) + t] = f32(x[c * P + t + 1] - x[c * P + t]);
    // diff half reuses the raw half's channel subsets (aeon semantics)
    this.mrHalf(xd, C, P - 1, this.a.mr0_nchan, this.a.mr0_chan,
      this.a.mr1_dil, this.a.mr1_nfpd, this.a.mr1_bias, out, nf * 4, nf, P);
    return out;
  }

  // ---- HYDRA (float64, as in the NumPy port) ----
  hydra(x, C, P) {
    const W = this.a.hy_W, idx = this.a.hy_idx;
    const dil = this.a.hy_dil[0], pad = this.a.hy_pad[0];
    const g = this.k.hydraGroups, k = this.k.hydraKernels;
    const divisor = 2, h = g / divisor;
    const feats = new Float64Array(dil * 1 * divisor * 2 * h * k);
    let fo = 0;
    const xd = new Float64Array(C * (P - 1));
    for (let c = 0; c < C; c++)
      for (let t = 0; t < P - 1; t++) xd[c * (P - 1) + t] = x[c * P + t + 1] - x[c * P + t];
    for (let di2 = 0; di2 < divisor; di2++) {
      const src = di2 === 0 ? x : xd;
      const T = di2 === 0 ? P : P - 1;
      const countMax = new Float64Array(h * k), countMin = new Float64Array(h * k);
      for (let gi = 0; gi < h; gi++) {
        // summed channels for this group: idx layout (1, 2, h, 8)
        const Sg = new Float64Array(T);
        for (let r = 0; r < 8; r++) {
          const c = idx[(di2 * h + gi) * 8 + r];
          for (let t = 0; t < T; t++) Sg[t] += src[c * T + t];
        }
        const xp = new Float64Array(T + 2 * pad);
        for (let t = 0; t < T; t++) xp[t + pad] = Sg[t];
        const Tout = xp.length - dil * 8;
        const Z = new Float64Array(k * Tout);
        for (let j = 0; j < k; j++) {
          // W layout (1, 2, k*h, 9): kernel (gi*k + j)
          const wbase = (di2 * (k * h) + gi * k + j) * 9;
          for (let t = 0; t < Tout; t++) {
            let acc = 0;
            for (let m = 0; m < 9; m++) acc += W[wbase + m] * xp[t + m * dil];
            Z[j * Tout + t] = acc;
          }
        }
        for (let t = 0; t < Tout; t++) {
          let amax = 0, vmax = -Infinity, amin = 0, vmin = Infinity;
          for (let j = 0; j < k; j++) {
            const v = Z[j * Tout + t];
            if (v > vmax) { vmax = v; amax = j; }
            if (v < vmin) { vmin = v; amin = j; }
          }
          countMax[gi * k + amax] += vmax;
          countMin[gi * k + amin] += 1;
        }
      }
      feats.set(countMax, fo); fo += h * k;
      feats.set(countMin, fo); fo += h * k;
    }
    return feats;
  }

  predict(win) {
    const C = this.k.channels, P = this.k.padTo;
    const x = this.preprocess(win);
    const fmr = this.multirocket(x, C, P);
    const fhy = this.hydra(x, C, P);
    const nf = fmr.length, nh = fhy.length;
    const f = new Float32Array(nf + nh);
    const mu = this.a.feat_mu, sd = this.a.feat_sd;
    for (let i = 0; i < nf; i++) f[i] = f32((fmr[i] - mu[i]) / sd[i]);
    const hmu = this.a.hy_mu, hsig = this.a.hy_sigma;
    for (let i = 0; i < nh; i++) {
      const xs = Math.sqrt(Math.max(fhy[i], 0));
      f[nf + i] = ((xs - hmu[i]) * (xs !== 0 ? 1 : 0)) / hsig[i];
    }
    const coef = this.a.head_coef, icpt = this.a.head_intercept;
    const nCls = this.classes.length;
    const logits = new Float64Array(nCls);
    for (let j = 0; j < nCls; j++) {
      let acc = 0;
      for (let i = 0; i < f.length; i++) acc += f[i] * coef[i * nCls + j];
      logits[j] = acc + icpt[j];
    }
    let mx = -Infinity;
    for (let j = 0; j < nCls; j++) if (logits[j] > mx) mx = logits[j];
    let sum = 0;
    const proba = new Float64Array(nCls);
    for (let j = 0; j < nCls; j++) { proba[j] = Math.exp(logits[j] - mx); sum += proba[j]; }
    for (let j = 0; j < nCls; j++) proba[j] /= sum;
    let best = 0;
    for (let j = 0; j < nCls; j++) if (proba[j] > proba[best]) best = j;
    return { pred: this.classes[best], conf: proba[best],
             proba: Array.from(proba), best };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { EdgeModel };
}
