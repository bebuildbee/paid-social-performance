/* Allo Bank PayLater · Paid Social dashboard
   Reads window.DASH_DATA (data.js). No external libraries. */
(() => {
  'use strict';
  const D = window.DASH_DATA;
  const IDX = Object.fromEntries(D.metrics.map((m, i) => [m, i]));
  const COLORS = { Meta: '#333333', TikTok: '#FFAF03' };
  const CHANNELS = ['Meta', 'TikTok'];
  const CAP = 500000;
  const state = { period: 'ytd', ch: 'all', grain: 'week', sort: 'alpha', search: '', crSort: 'a', crAsc: false, accSort: 'cost', accAsc: false, showUnid: true };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- formatting ---------- */
  const fmtN = (v) => {
    if (v == null || !isFinite(v)) return '–';
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e4) return (v / 1e3).toFixed(1) + 'K';
    return Math.round(v).toLocaleString('en-US');
  };
  const fmtRp = (v) => (v == null || !isFinite(v)) ? '–' : 'Rp' + (v >= 1e6 ? fmtN(v) : (v >= 1e3 ? Math.round(v / 1e3) + 'K' : Math.round(v)));
  const fmtFull = (v) => Math.round(v).toLocaleString('en-US');
  const pct = (v) => (v == null || !isFinite(v)) ? '–' : (v * 100).toFixed(v < .1 ? 1 : 0) + '%';
  const dLabel = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const mLabel = (s) => new Date(s + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short' });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- dates & ranges ---------- */
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5) + 1;
  const weekStart = (s) => { const d = new Date(s + 'T00:00:00Z'); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10); };
  function range() {
    let end = D.updated, start;
    if (state.period === 'custom') { start = state.from; end = state.to; }
    else start = state.period === 'ytd' ? D.start : addDays(end, -(+state.period - 1));
    const len = daysBetween(start, end);
    const pEnd = addDays(start, -1), pStart = addDays(start, -len);
    return { start, end, len, prev: pStart >= D.start ? { start: pStart, end: pEnd } : null };
  }
  const chOK = (c) => state.ch === 'all' || state.ch === c;

  /* ---------- aggregation ---------- */
  const zero = () => new Array(D.metrics.length).fill(0);
  const addV = (a, row, off) => { for (let i = 0; i < D.metrics.length; i++) a[i] += row[i + off]; return a; };
  function sum(r, ch) {
    const v = zero();
    D.daily.forEach((row) => { if (row[0] >= r.start && row[0] <= r.end && (ch ? row[1] === ch : chOK(row[1]))) addV(v, row, 2); });
    return v;
  }
  const kpi = (v) => ({ cost: v[IDX.cost], costAll: v[IDX.costAll], inst: v[IDX.inst], inc: v[IDX.incBe], ab: v[IDX.actBe], a: v[IDX.alphaBe],
    aDb: v[IDX.alpha], aAf: v[IDX.alphaAf], cpa: v[IDX.alphaBe] ? v[IDX.cost] / v[IDX.alphaBe] : null,
    cl: v[IDX.clBe], avgCl: v[IDX.actBe] ? v[IDX.clBe] / v[IDX.actBe] : null });
  function buckets(r, grain) {
    const map = new Map();
    D.daily.forEach((row) => {
      if (row[0] < r.start || row[0] > r.end) return;
      const k = grain === 'month' ? row[0].slice(0, 7) : weekStart(row[0]);
      if (!map.has(k)) map.set(k, { key: k, Meta: zero(), TikTok: zero() });
      addV(map.get(k)[row[1]], row, 2);
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
  const bLabel = (k, grain) => grain === 'month' ? mLabel(k) : new Date(k + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  /* ---------- tooltip ---------- */
  const tip = $('#tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.classList.add('show');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(window.innerWidth - w - 12, Math.max(12, x + 14)) + 'px';
    tip.style.top = Math.max(12, y - h - 14) + 'px';
  }
  const hideTip = () => tip.classList.remove('show');
  const tipRow = (c, label, val) => `<div class="row"><span>${c ? `<i style="background:${c}"></i>` : ''}${label}</span><b>${val}</b></div>`;

  /* ---------- svg helpers ---------- */
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function frame(host, maxY, fmtY, opts = {}) {
    host.innerHTML = '';
    const W = host.clientWidth || 600, H = host.clientHeight || 300;
    const m = { t: 14, r: opts.r || 16, b: 30, l: 52 };
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' }, host);
    const g = el('g', { transform: `translate(${m.l},${m.t})` }, svg);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const axis = el('g', { class: 'axis' }, g);
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = maxY * i / ticks, y = ih - ih * i / ticks;
      el('line', { x1: 0, x2: iw, y1: y, y2: y }, axis);
      const t = el('text', { x: -10, y: y + 4, 'text-anchor': 'end' }, axis); t.textContent = fmtY(v);
    }
    return { svg, g, iw, ih, y: (v) => ih - ih * Math.min(v, maxY) / maxY };
  }
  function xLabels(f, labels, step) {
    const n = labels.length, bw = f.iw / n;
    const every = Math.max(1, Math.ceil(n / Math.floor(f.iw / 64)));
    labels.forEach((l, i) => {
      if (i % every) return;
      const t = el('text', { x: bw * i + bw / 2, y: f.ih + 20, 'text-anchor': 'middle', class: 'axisx' }, f.g);
      t.textContent = l; t.setAttribute('font-size', 11); t.setAttribute('fill', '#8A8A8A');
    });
  }
  function rounded(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  const drawIn = (host) => requestAnimationFrame(() => requestAnimationFrame(() => host.classList.add('drawn')));

  /* ---------- charts ---------- */
  function chartAlpha() {
    const r = range(), bs = buckets(r, state.grain), host = $('#chartAlpha');
    host.classList.remove('drawn');
    const chs = CHANNELS.filter(chOK);
    const tot = bs.map((b) => chs.reduce((s, c) => s + b[c][IDX.alphaBe], 0));
    const f = frame(host, niceMax(Math.max(...tot, 1) * 1.08), fmtN);
    const n = bs.length, bw = f.iw / n, w = Math.min(24, bw * .62);
    bs.forEach((b, i) => {
      let acc = 0; const x = bw * i + (bw - w) / 2;
      chs.forEach((c, ci) => {
        const v = b[c][IDX.alphaBe]; if (!v) return;
        const y0 = f.y(acc), y1 = f.y(acc + v); acc += v;
        const top = ci === chs.length - 1 || chs.slice(ci + 1).every((cc) => !b[cc][IDX.alphaBe]);
        const gap = acc - v > 0 ? 2 : 0;
        const p = el('path', { d: top ? rounded(x, y1, w, Math.max(0, y0 - y1 - gap), 4) : `M${x},${y1}h${w}v${Math.max(0, y0 - y1 - gap)}h${-w}Z`, fill: COLORS[c], class: 'bar' }, f.g);
        p.style.transitionDelay = (i * 18) + 'ms';
      });
      const hit = el('rect', { x: bw * i, y: 0, width: bw, height: f.ih, class: 'hit' }, f.g);
      hit.addEventListener('mousemove', (e) => showTip(`<b>${state.grain === 'month' ? mLabel(b.key) + ' ' + b.key.slice(0, 4) : 'Week of ' + dLabel(b.key)}</b>` +
        chs.map((c) => tipRow(COLORS[c], c, fmtFull(b[c][IDX.alphaBe]))).join('') + (chs.length > 1 ? tipRow(null, 'Total', fmtFull(tot[i])) : ''), e.clientX, e.clientY));
      hit.addEventListener('mouseleave', hideTip);
    });
    // label the peak
    const iMax = tot.indexOf(Math.max(...tot));
    if (iMax >= 0 && tot[iMax]) { const t = el('text', { x: bw * iMax + bw / 2, y: f.y(tot[iMax]) - 8, 'text-anchor': 'middle', class: 'endlabel' }, f.g); t.textContent = fmtN(tot[iMax]); }
    xLabels(f, bs.map((b) => bLabel(b.key, state.grain)));
    legend('#legAlpha', chs.map((c) => [COLORS[c], c]));
    drawIn(host);
  }

  function chartCpa() {
    const r = range(), bs = buckets(r, state.grain), host = $('#chartCpa');
    host.classList.remove('drawn');
    const chs = CHANNELS.filter(chOK);
    const series = chs.map((c) => ({ c, v: bs.map((b) => b[c][IDX.alphaBe] >= 5 ? b[c][IDX.cost] / b[c][IDX.alphaBe] : null) }));
    const all = series.flatMap((s) => s.v).filter((v) => v != null);
    const maxY = niceMax(Math.min(Math.max(...all, CAP * 1.4), 4e6));
    const f = frame(host, maxY, (v) => fmtRp(v), { r: 56 });
    const n = bs.length, bw = f.iw / n, xAt = (i) => bw * i + bw / 2;
    // cap line
    el('line', { x1: 0, x2: f.iw, y1: f.y(CAP), y2: f.y(CAP), stroke: '#8A8A8A', 'stroke-width': 1.5, 'stroke-dasharray': '5 5' }, f.g);
    const cl = el('text', { x: f.iw + 6, y: f.y(CAP) + 4, class: 'caplabel' }, f.g); cl.textContent = 'Cap';
    series.forEach((s) => {
      let d = '', started = false;
      s.v.forEach((v, i) => { if (v == null) { started = false; return; } d += (started ? 'L' : 'M') + xAt(i) + ',' + f.y(v); started = true; });
      if (!d) return;
      const p = el('path', { d, class: 'lineP', stroke: COLORS[s.c] }, f.g);
      const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      requestAnimationFrame(() => requestAnimationFrame(() => { p.style.strokeDashoffset = 0; }));
      const li = s.v.map((v, i) => [v, i]).filter((x) => x[0] != null).pop();
      if (li) {
        el('circle', { cx: xAt(li[1]), cy: f.y(li[0]), r: 5, fill: COLORS[s.c], stroke: '#fff', 'stroke-width': 2 }, f.g);
        const t = el('text', { x: xAt(li[1]) + 9, y: f.y(li[0]) + (s.c === 'Meta' ? 14 : -6), class: 'endlabel' }, f.g); t.textContent = fmtRp(li[0]);
      }
    });
    const xh = el('line', { y1: 0, y2: f.ih, class: 'xhair' }, f.g);
    bs.forEach((b, i) => {
      const hit = el('rect', { x: bw * i, y: 0, width: bw, height: f.ih, class: 'hit' }, f.g);
      hit.addEventListener('mousemove', (e) => {
        xh.setAttribute('x1', xAt(i)); xh.setAttribute('x2', xAt(i)); xh.style.opacity = 1;
        showTip(`<b>${state.grain === 'month' ? mLabel(b.key) + ' ' + b.key.slice(0, 4) : 'Week of ' + dLabel(b.key)}</b>` +
          series.map((s) => tipRow(COLORS[s.c], s.c, s.v[i] == null ? 'too few α' : fmtRp(s.v[i]))).join(''), e.clientX, e.clientY);
      });
      hit.addEventListener('mouseleave', () => { hideTip(); xh.style.opacity = 0; });
    });
    xLabels(f, bs.map((b) => bLabel(b.key, state.grain)));
    legend('#legCpa', chs.map((c) => [COLORS[c], c, 'line']).concat([[null, 'Rp500K cap', 'dash']]));
    drawIn(host);
  }

  function chartAttrib() {
    const r = range(), host = $('#chartAttrib');
    host.classList.remove('drawn');
    const chs = CHANNELS.filter(chOK);
    const src = [['Platform', '#C9C9C9', 'aDb'], ['AppsFlyer', '#6E6E6E', 'aAf'], ['Backend', '#FFAF03', 'a']];
    const vals = chs.map((c) => kpi(sum(r, c)));
    const maxV = Math.max(1, ...vals.flatMap((k) => src.map((s) => k[s[2]])));
    const f = frame(host, niceMax(maxV * 1.1), fmtN);
    const gw = f.iw / chs.length, w = Math.min(24, gw / 6), gap = 6;
    vals.forEach((k, gi) => {
      const total = src.length * w + (src.length - 1) * gap, x0 = gw * gi + (gw - total) / 2;
      src.forEach((s, si) => {
        const v = k[s[2]], x = x0 + si * (w + gap), y = f.y(v);
        const p = el('path', { d: rounded(x, y, w, f.ih - y, 4), fill: s[1], class: 'bar' }, f.g); p.style.transitionDelay = (si * 120) + 'ms';
        const t = el('text', { x: x + w / 2, y: y - 7, 'text-anchor': 'middle', class: 'endlabel' }, f.g); t.textContent = v ? fmtN(v) : '0';
        const hit = el('rect', { x: x - 4, y: 0, width: w + 8, height: f.ih, class: 'hit' }, f.g);
        hit.addEventListener('mousemove', (e) => showTip(`<b>${chs[gi]} · ${s[0]}</b>` + tipRow(s[1], 'α-Activations', fmtFull(v)), e.clientX, e.clientY));
        hit.addEventListener('mouseleave', hideTip);
      });
      const t = el('text', { x: gw * gi + gw / 2, y: f.ih + 22, 'text-anchor': 'middle', class: 'endlabel' }, f.g); t.textContent = chs[gi];
    });
    legend('#legAttrib', src.map((s) => [s[1], s[0]]));
    const missing = chs.filter((c, i) => !vals[i].aAf);
    $('#attribNote').textContent = missing.length ? `AppsFlyer shows 0 for ${missing.join(' and ')} because its AppsFlyer columns haven't been loaded yet.` : 'AppsFlyer counts by install date, so its recent days keep growing.';
    drawIn(host);
  }

  function legend(sel, items) {
    $(sel).innerHTML = items.map(([c, l, kind]) => `<span><i class="${kind || ''}" ${c ? `style="background:${c}"` : ''}></i>${l}</span>`).join('');
  }

  /* ---------- hero, tiles, ticker ---------- */
  function countUp(node, to, fmt, dur = 1100) {
    const from = +(node.dataset.v || 0); node.dataset.v = to;
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); node.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function hero() {
    const r = range(), k = kpi(sum(r));
    $('#rangeLabel').textContent = `${dLabel(r.start)} – ${dLabel(r.end)} · ${r.len} days`;
    countUp($('#heroAlpha'), k.a, fmtFull);
    $('#heroAlphaMeta').innerHTML = `αβ-Activations <b>${fmtFull(k.ab)}</b> · α share <b>${pct(k.ab ? k.a / k.ab : null)}</b>`;
    countUp($('#heroCpa'), k.cpa || 0, (v) => k.cpa ? fmtRp(v) : '–');
    const fill = $('#heroMeter .meter__fill'), ratio = k.cpa ? Math.min(1, k.cpa / (CAP * 2)) : 0;
    fill.style.width = (ratio * 100) + '%'; fill.classList.toggle('over', (k.cpa || 0) > CAP);
    $('#heroMeter').setAttribute('aria-label', `α-CPA ${fmtRp(k.cpa)} against a Rp500K cap`);
    const perDay = k.a / r.len;
    countUp($('#heroPerDay'), perDay, (v) => v.toFixed(1));
    const ring = $('#heroRing .ring__fill'), p = Math.min(1, perDay / 100);
    ring.style.strokeDashoffset = 326.7 * (1 - p);
    $('#heroRing .ring__pct').textContent = Math.round(p * 100) + '%';
  }

  function spark(values, color) {
    const W = 120, H = 34, max = Math.max(...values, 1), n = values.length;
    if (n < 2) return '';
    const pts = values.map((v, i) => [i * (W / (n - 1)), H - 3 - (H - 6) * v / max]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L${W},${H}L0,${H}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${color}"/></svg>`;
  }
  function tiles() {
    const r = range(), k = kpi(sum(r)), pk = r.prev ? kpi(sum(r.prev)) : null;
    const bs = buckets(r, r.len > 120 ? 'week' : (r.len > 14 ? 'week' : 'week'));
    const ser = (fn) => bs.map((b) => fn(kpi(CHANNELS.filter(chOK).reduce((v, c) => v.map((x, i) => x + b[c][i]), zero()))));
    const defs = [
      ['PayLater cost', k.cost, pk && pk.cost, fmtRp, 'neutral', ser((x) => x.cost)],
      ['App installs', k.inst, pk && pk.inst, fmtN, 'up', ser((x) => x.inst)],
      ['Incoming', k.inc, pk && pk.inc, fmtN, 'up', ser((x) => x.inc)],
      ['αβ-Activations', k.ab, pk && pk.ab, fmtN, 'up', ser((x) => x.ab)],
      ['α-Activations', k.a, pk && pk.a, fmtN, 'up', ser((x) => x.a)],
      ['α-CPA', k.cpa, pk && pk.cpa, fmtRp, 'down', ser((x) => x.cpa || 0), true],
      ['Credit limit given', k.cl, pk && pk.cl, fmtRp, 'up', ser((x) => x.cl)],
      ['Avg limit per αβ', k.avgCl, pk && pk.avgCl, fmtRp, 'up', ser((x) => x.avgCl || 0)],
    ];
    $('#tiles').innerHTML = defs.map(([label, v, pv, f, good, s, accent], i) => {
      let delta = `<span class="tile__delta">${r.prev ? 'no data before' : 'vs previous period n/a'}</span>`;
      if (pv) {
        const ch = (v - pv) / pv, dir = ch >= 0 ? 'up' : 'down';
        const cls = good === 'neutral' ? '' : (dir === good ? `${dir}-good` : `${dir}-bad`);
        delta = `<span class="tile__delta ${cls}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch * 100).toFixed(0)}% vs previous ${r.len}d</span>`;
      }
      return `<div class="tile ${accent ? 'tile--accent' : ''} reveal" style="transition-delay:${i * 60}ms"><span class="tile__label">${label}</span><span class="tile__value" data-k="${i}">${f(v)}</span>${delta}${spark(s, accent ? '#FFAF03' : '#333333')}</div>`;
    }).join('');
    observe($$('#tiles .reveal'));
  }
  function ticker() {
    const r = range(), parts = [];
    CHANNELS.forEach((c) => { const k = kpi(sum(r, c)); parts.push(`${c}: <b>${fmtFull(k.a)}</b> α at <b>${fmtRp(k.cpa)}</b> per α`); });
    const top = creatives().filter((x) => !x.unid)[0]; if (top) parts.push(`Top creative: <b>${esc(top.name)}</b> · ${fmtFull(top.a)} α`);
    const k = kpi(sum(r)); parts.push(`Installs → α: <b>${pct(k.inst ? k.a / k.inst : null)}</b>`); parts.push(`α share of αβ: <b>${pct(k.ab ? k.a / k.ab : null)}</b>`);
    parts.push(`Data until <b>${dLabel(D.updated)}</b>`);
    const html = parts.map((p) => `<span>${p}</span>`).join('');
    $('#ticker').innerHTML = html + html;
  }

  /* ---------- funnel ---------- */
  function funnel() {
    const k = kpi(sum(range()));
    const steps = [['App installs', 'platform', k.inst], ['Incoming', 'loan applications', k.inc], ['αβ-Activations', 'all approvals', k.ab], ['α-Activations', 'credit limit above Rp1M', k.a]];
    const max = steps[0][2] || 1;
    $('#funnelBox').innerHTML = steps.map(([n, s, v], i) => {
      const w = Math.max(1.5, v / max * 100), rate = i ? (steps[i - 1][2] ? v / steps[i - 1][2] : null) : null;
      return `<div class="fstep"><div class="fstep__name">${n}<small>${s}</small></div><div class="fstep__bar"><i data-w="${w}"></i><span class="${w < 18 ? 'out' : ''}" style="${w < 18 ? `left:calc(${w}% + 12px)` : ''}">${fmtFull(v)}</span></div><div class="fstep__rate">${i ? `<b>${pct(rate)}</b>of previous step` : '<b>100%</b>starting point'}</div></div>`;
    }).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#funnelBox i').forEach((x, i) => { x.style.transitionDelay = i * 150 + 'ms'; x.style.width = x.dataset.w + '%'; })));
  }

  /* ---------- channel duel ---------- */
  function duel() {
    const r = range(), all = kpi(sum(r, null)), allBoth = kpi(CHANNELS.reduce((v, c) => v.map((x, i) => x + sum(r, c)[i]), zero()));
    $('#duel').innerHTML = CHANNELS.map((c) => {
      const k = kpi(sum(r, c)), share = allBoth.cost ? k.cost / allBoth.cost : 0, aShare = allBoth.a ? k.a / allBoth.a : 0;
      const ratio = k.cpa ? Math.min(1, k.cpa / (CAP * 2)) : 0;
      return `<div class="card chan reveal ${state.ch !== 'all' && state.ch !== c ? 'muted' : ''}">
        <div class="chan__top"><div class="chan__name"><span class="chan__swatch" style="background:${COLORS[c]}"></span>${c}</div><span class="chan__share">${pct(share)} of cost · ${pct(aShare)} of α</span></div>
        <div class="chan__kpis"><div><span>PayLater cost</span><b>${fmtRp(k.cost)}</b></div><div><span>α-Activations</span><b>${fmtFull(k.a)}</b></div><div><span>Installs → α</span><b>${pct(k.inst ? k.a / k.inst : null)}</b></div></div>
        <div class="chan__meter meter"><p>α-CPA <b>${fmtRp(k.cpa)}</b> ${k.cpa ? (k.cpa <= CAP ? '· within the Rp500K cap' : `· ${fmtRp(k.cpa - CAP)} above the cap`) : ''}</p>
          <div class="meter__track"><div class="meter__fill ${(k.cpa || 0) > CAP ? 'over' : ''}" data-w="${ratio * 100}"></div><div class="meter__cap"></div></div>
          <div class="meter__legend"><span>Rp0</span><span>Rp500K</span><span>Rp1M+</span></div></div></div>`;
    }).join('');
    observe($$('#duel .reveal'));
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#duel .meter__fill').forEach((x) => { x.style.width = x.dataset.w + '%'; })));
    void all;
  }

  /* ---------- creatives ---------- */
  function creatives() {
    const r = range(), m0 = r.start.slice(0, 7), m1 = r.end.slice(0, 7), map = new Map();
    D.creatives.forEach((row) => {
      if (row[0] < m0 || row[0] > m1 || !chOK(row[1])) return;
      const key = row[1] + '|' + row[2] + '|' + row[3];
      if (!map.has(key)) map.set(key, { key, ch: row[1], name: row[2], fmt: row[3], unid: row[2] === 'Unidentified', v: zero() });
      addV(map.get(key).v, row, 4);
    });
    return [...map.values()].map((x) => {
      const k = kpi(x.v), info = D.creativeInfo[x.key] || {};
      return { ...x, ...k, cpa: k.a ? k.cost / k.a : null, first: info.first, last: info.last, prev: D.previews[x.key] };
    }).filter((x) => x.costAll > 0 || x.a > 0).sort((a, b) => b.a - a.a);
  }
  function gallery() {
    const all = creatives(), list = all.filter((x) => !x.unid), r = range();
    const winners = list.filter((x) => x.a >= 50 && x.cpa && x.cpa <= 550000).length;
    $('#creativeNote').innerHTML = `<b style="color:#fff">${list.length}</b> creatives ran in ${r.start.slice(0, 7) === r.end.slice(0, 7) ? mLabel(r.end.slice(0, 7)) : 'the selected months'}; <b style="color:#FFAF03">${winners}</b> reached 50+ α at Rp550K or less. Creative figures use whole calendar months.`;
    let top = list.slice();
    if (state.sort === 'cpa') top = top.filter((x) => x.a >= 20 && x.cpa).sort((a, b) => a.cpa - b.cpa);
    if (state.sort === 'cost') top.sort((a, b) => b.costAll - a.costAll);
    top = top.slice(0, 8);
    const maxA = Math.max(1, ...top.map((x) => x.a));
    $('#gallery').innerHTML = top.map((x, i) => {
      const win = x.a >= 50 && x.cpa && x.cpa <= 550000;
      const media = x.prev
        ? `<img loading="lazy" src="${esc(x.prev.img)}" data-alt="${esc(x.prev.img2)}" alt="${esc(x.name)}" referrerpolicy="no-referrer">`
        : `<div class="poster"><div><div class="poster__play" style="margin:auto"></div><div class="poster__name">${esc(x.name)}</div></div></div>`;
      const link = x.ch === 'Meta' && x.prev ? `<a class="cr__link" target="_blank" rel="noopener" href="https://adsmanager.facebook.com/adsmanager/manage/ads?act=${x.prev.acc}&selected_ad_ids=${x.prev.ad}">Open in Ads Manager ↗</a>` : '';
      return `<article class="cr reveal" style="transition-delay:${(i % 4) * 80}ms">
        <div class="cr__media">${media}<span class="cr__rank">#${i + 1}</span><span class="cr__chan">${x.ch}</span>${win ? '<span class="cr__badge cr__badge--win">Winner</span>' : ''}</div>
        <div class="cr__body"><div class="cr__name">${esc(x.name)}</div>${x.prev && x.prev.title ? `<div class="cr__copy">“${esc(x.prev.title)}”</div>` : ''}
          <div class="cr__stats"><div><span>α</span><b>${fmtFull(x.a)}</b></div><div><span>α-CPA</span><b>${fmtRp(x.cpa)}</b></div><div><span>Cost</span><b>${fmtRp(x.cost || x.costAll)}</b></div></div>
          <div class="cr__bar"><i data-w="${x.a / maxA * 100}"></i></div>${link}</div></article>`;
    }).join('') || '<p style="color:#BDBDBD">No creatives with results in this period.</p>';
    $$('#gallery img').forEach((img) => img.addEventListener('error', () => {
      if (img.dataset.alt && img.src !== img.dataset.alt) { img.src = img.dataset.alt; img.dataset.alt = ''; return; }
      const name = img.alt; img.parentElement.insertAdjacentHTML('afterbegin', `<div class="poster"><div><div class="poster__play" style="margin:auto"></div><div class="poster__name">${esc(name)}</div></div></div>`); img.remove();
    }));
    observe($$('#gallery .reveal'));
    tilt($$('#gallery .cr'));
    setTimeout(() => $$('#gallery .cr__bar i').forEach((x) => { x.style.width = x.dataset.w + '%'; }), 200);
    crTable(all);
  }
  function tilt(cards) {
    cards.forEach((c) => {
      c.addEventListener('mousemove', (e) => { const b = c.getBoundingClientRect(), px = (e.clientX - b.left) / b.width - .5, py = (e.clientY - b.top) / b.height - .5; c.style.transform = `perspective(900px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg) translateY(-4px)`; });
      c.addEventListener('mouseleave', () => { c.style.transform = ''; });
    });
  }
  function crTable(list) {
    const cols = [['name', 'Creative'], ['fmt', 'Format'], ['ch', 'Channel'], ['first', 'First seen'], ['cost', 'PayLater cost'], ['inst', 'Installs'], ['inc', 'Incoming'], ['ab', 'αβ'], ['a', 'α'], ['cpa', 'α-CPA'], ['cl', 'Credit limit'], ['avgCl', 'Avg limit / αβ']];
    const q = state.search.toLowerCase();
    const pinned = state.showUnid ? list.filter((x) => x.unid).sort((a, b) => a.ch.localeCompare(b.ch)) : [];
    let rows = list.filter((x) => !x.unid && (!q || x.name.toLowerCase().includes(q)));
    const key = state.crSort, dir = state.crAsc ? 1 : -1;
    rows.sort((a, b) => { const va = a[key], vb = b[key]; if (va == null) return 1; if (vb == null) return -1; return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir; });
    const tr = (x) => `<tr class="${x.unid ? 'row-unid' : ''}"><td class="name">${x.unid ? 'Unidentified <small>backend activations not matched to an ad</small>' : esc(x.name)}</td><td>${x.unid ? '–' : `<span class="fmt fmt--${esc(x.fmt.toLowerCase())}">${esc(x.fmt)}</span>`}</td><td><span class="pill">${x.ch}</span></td><td>${x.first && !x.unid ? dLabel(x.first) : '–'}</td><td>${x.unid ? '–' : fmtRp(x.cost)}</td><td>${x.unid ? '–' : fmtN(x.inst)}</td><td>${fmtN(x.inc)}</td><td>${fmtN(x.ab)}</td><td><b>${fmtFull(x.a)}</b></td><td class="${x.unid || x.cpa == null ? '' : x.cpa <= CAP ? 'cpa-good' : 'cpa-bad'}">${x.unid ? '–' : fmtRp(x.cpa)}</td><td>${fmtRp(x.cl)}</td><td>${fmtRp(x.avgCl)}</td></tr>`;
    $('#crTable').innerHTML = `<thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${k === key ? 'sorted' + (state.crAsc ? ' asc' : '') : ''}">${l}</th>`).join('')}</tr></thead><tbody>` +
      pinned.map(tr).join('') + rows.slice(0, 400).map(tr).join('') + '</tbody>';
    $$('#crTable th').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.k; state.crAsc = state.crSort === k ? !state.crAsc : (k === 'name' || k === 'cpa' || k === 'fmt' || k === 'ch'); state.crSort = k; crTable(list); }));
    const dot = $('#unidDot');
    if (dot && !dot.dataset.wired) {
      dot.dataset.wired = '1';
      dot.addEventListener('click', () => { state.showUnid = !state.showUnid; dot.classList.toggle('off', !state.showUnid); dot.setAttribute('aria-pressed', state.showUnid); crTable(creatives()); });
    }
  }

  /* ---------- accounts ---------- */
  function accounts() {
    const r = range(), m0 = r.start.slice(0, 7), m1 = r.end.slice(0, 7), map = new Map();
    D.accMonthly.forEach((row) => {
      if (row[0] < m0 || row[0] > m1 || !chOK(row[1])) return;
      if (!map.has(row[2])) map.set(row[2], { id: row[2], ch: row[1], v: zero() });
      addV(map.get(row[2]).v, row, 3);
    });
    let rows = [...map.values()].map((x) => { const info = D.accounts[x.id] || {}, k = kpi(x.v); return { ...x, ...k, name: info.name || x.id, pl: info.paylater, spend: k.costAll, cpa: info.paylater === 'Yes' && k.a ? k.cost / k.a : null }; });
    const key = state.accSort, dir = state.accAsc ? 1 : -1;
    rows.sort((a, b) => { const va = a[key], vb = b[key]; if (va == null) return 1; if (vb == null) return -1; return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir; });
    const cols = [['name', 'Account'], ['ch', 'Channel'], ['pl', 'PayLater account'], ['spend', 'Spend'], ['inst', 'Installs'], ['ab', 'αβ'], ['a', 'α'], ['cpa', 'α-CPA'], ['cl', 'Credit limit']];
    $('#accTable').innerHTML = `<thead><tr>${cols.map(([k, l]) => `<th data-k="${k}" class="${k === key ? 'sorted' + (state.accAsc ? ' asc' : '') : ''}">${l}</th>`).join('')}</tr></thead><tbody>` +
      rows.map((x) => `<tr><td class="name">${esc(x.name)}<br><small style="color:#8A8A8A;font-weight:500">${x.id}</small></td><td>${x.ch}</td><td><span class="pill ${x.pl === 'Yes' ? 'pill--yes' : ''}">${x.pl === 'Yes' ? 'Yes · cost counts' : x.pl === 'No' ? 'No · α only' : x.pl || '–'}</span></td><td>${fmtRp(x.spend)}</td><td>${fmtN(x.inst)}</td><td>${fmtN(x.ab)}</td><td><b>${fmtFull(x.a)}</b></td><td class="${x.cpa == null ? '' : x.cpa <= CAP ? 'cpa-good' : 'cpa-bad'}">${x.cpa == null ? '–' : fmtRp(x.cpa)}</td><td>${fmtRp(x.cl)}</td></tr>`).join('') + '</tbody>';
    $$('#accTable th').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.k; state.accAsc = state.accSort === k ? !state.accAsc : (k === 'name' || k === 'cpa'); state.accSort = k; accounts(); }));
  }

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: .12 });
  function observe(nodes) { nodes.forEach((n) => io.observe(n)); }

  /* ---------- wiring ---------- */
  function setOn(id, b) { $$(`#${id} button`).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); }
  function seg(id, key, attr, after, intercept) {
    $$(`#${id} button`).forEach((b) => b.addEventListener('click', () => {
      if (intercept && intercept(b)) { openPop(); return; }
      setOn(id, b); state[key] = b.dataset[attr];
      if (id === 'periodSeg') $('#customLabel').textContent = 'Custom';
      after();
    }));
  }

  /* ---------- custom date range ---------- */
  const pop = $('#datePop'), dFrom = $('#dFrom'), dTo = $('#dTo'), dErr = $('#dErr'), cBtn = $('#customBtn');
  [dFrom, dTo].forEach((i) => { i.min = D.start; i.max = D.updated; });
  function openPop() {
    const r = range();
    dFrom.value = state.from || r.start; dTo.value = state.to || r.end; dErr.textContent = '';
    pop.hidden = false; cBtn.setAttribute('aria-expanded', 'true'); dFrom.focus();
  }
  function closePop() { pop.hidden = true; cBtn.setAttribute('aria-expanded', 'false'); }
  const short = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  function applyCustom() {
    let f = dFrom.value, t = dTo.value;
    if (!f || !t) { dErr.textContent = 'Pick both dates.'; return; }
    if (f > t) { dErr.textContent = '“From” must be on or before “To”.'; return; }
    if (f < D.start) f = D.start; if (t > D.updated) t = D.updated;
    if (f > D.updated || t < D.start) { dErr.textContent = `Data covers ${dLabel(D.start)} to ${dLabel(D.updated)}.`; return; }
    state.from = f; state.to = t; state.period = 'custom';
    setOn('periodSeg', cBtn);
    $('#customLabel').textContent = `${short(f)} – ${short(t)}`;
    closePop(); renderAll();
  }
  $('#dApply').addEventListener('click', applyCustom);
  $('#dCancel').addEventListener('click', closePop);
  [dFrom, dTo].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCustom(); }));
  $$('#dQuick button').forEach((b) => b.addEventListener('click', () => {
    const end = D.updated, y = end.slice(0, 4), m = +end.slice(5, 7);
    const mStart = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}-01`;
    const mEnd = (yy, mm) => addDays(mm === 12 ? `${+yy + 1}-01-01` : mStart(yy, mm + 1), -1);
    const q = { thisMonth: [mStart(y, m), end], lastMonth: m === 1 ? [mStart(+y - 1, 12), mEnd(+y - 1, 12)] : [mStart(y, m - 1), mEnd(y, m - 1)],
      q3: ['2026-07-01', '2026-09-30'], q4: ['2026-10-01', end] }[b.dataset.q];
    dFrom.value = q[0] < D.start ? D.start : q[0]; dTo.value = q[1] > end ? end : q[1]; dErr.textContent = '';
  }));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) closePop(); });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && !cBtn.contains(e.target)) closePop(); });

  /* ---------- full screen ---------- */
  const fsBtn = $('#fsBtn'), root = document.documentElement;
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (!(root.requestFullscreen || root.webkitRequestFullscreen)) fsBtn.hidden = true;
  fsBtn.addEventListener('click', () => {
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  });
  const fsSync = () => {
    const on = !!fsEl();
    root.classList.toggle('is-fullscreen', on);
    fsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
    fsBtn.title = on ? 'Exit full screen' : 'Full screen';
  };
  document.addEventListener('fullscreenchange', fsSync);
  document.addEventListener('webkitfullscreenchange', fsSync);
  function renderAll() { hero(); tiles(); chartAlpha(); chartCpa(); funnel(); duel(); chartAttrib(); gallery(); accounts(); ticker(); }
  seg('periodSeg', 'period', 'p', renderAll, (b) => b.dataset.p === 'custom');
  seg('channelSeg', 'ch', 'c', renderAll);
  seg('grainSeg', 'grain', 'g', () => { chartAlpha(); chartCpa(); });
  seg('sortSeg', 'sort', 's', gallery);
  $('#search').addEventListener('input', (e) => { state.search = e.target.value; crTable(creatives()); });

  let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { chartAlpha(); chartCpa(); chartAttrib(); }, 150); }).observe($('#trend'));

  const nav = $('#nav');
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 10), { passive: true });
  const secIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) $$('.nav__links a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => secIO.observe(s));

  $('#stamp').textContent = 'Data until ' + dLabel(D.updated);
  $('#footStamp').textContent = `Snapshot of the Paid_Social_Assets sheet · data until ${dLabel(D.updated)}.`;
  renderAll();
  observe($$('.reveal'));
  window.addEventListener('load', () => setTimeout(() => { $('#loader').classList.add('done'); $$('.hero .reveal').forEach((n) => n.classList.add('is-in')); $('.hl').classList.add('is-in'); }, 1300));
})();
