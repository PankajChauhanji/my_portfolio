/* Explorer hero scene — a trekker runs the trail, hops the rocks, scrambles up the
   ridge, slips, gets back up, summits and plants a flag.

   Everything is drawn into one inline SVG. The figure is a jointed skeleton
   (head, torso, upper/lower arms, thighs, shins, feet) posed every frame with
   forward kinematics, and its feet are solved against the ground so they plant
   instead of floating. No frame images, no libraries. */
(function () {
  "use strict";
  var host = document.getElementById("trek-scene");
  if (!host) return;
  var svg = host.querySelector("svg");
  var NS = "http://www.w3.org/2000/svg";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var H = 200, GROUND = 186;
  // body proportions (px) — about 7.5 heads tall
  var B = { head: 3.7, neck: 2.2, torso: 14.5, upper: 8.2, fore: 7.6, thigh: 11.6, shin: 11.2, foot: 4.2 };

  var W = 0, M = null, rocks = [], layer = null, fig = null, parts = {}, flag = null, dust = [];

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  var pts = function (arr) { return arr.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "); };

  /* ---------------- scene ---------------- */
  function build() {
    W = Math.max(320, host.clientWidth);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var defs = el("defs", {}, svg);
    var g1 = el("linearGradient", { id: "mtn-face", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "0", style: "stop-color:var(--brand-1);stop-opacity:.42" }, g1);
    el("stop", { offset: "1", style: "stop-color:var(--brand-1);stop-opacity:.04" }, g1);
    var g2 = el("linearGradient", { id: "mtn-back", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el("stop", { offset: "0", style: "stop-color:var(--brand-2);stop-opacity:.24" }, g2);
    el("stop", { offset: "1", style: "stop-color:var(--brand-2);stop-opacity:0" }, g2);

    // mountain geometry (fractions of its box)
    var MW = Math.min(250, W * 0.4), MH = 150;
    var x0 = W - MW - 8, top = GROUND - MH;
    var P = function (fx, fy) { return [x0 + fx * MW, top + fy * MH]; };
    var ridge = [[0, 1], [.1, .86], [.17, .83], [.27, .66], [.34, .62], [.45, .44], [.52, .4], [.61, .2], [.66, .17], [.72, .03]].map(function (p) { return P(p[0], p[1]); });
    var flank = [[.78, .14], [.83, .22], [.88, .38], [.93, .55], [.97, .8], [1, 1]].map(function (p) { return P(p[0], p[1]); });
    var outline = ridge.concat(flank);
    M = { x0: x0, w: MW, top: top, ridge: ridge, outline: outline, summit: ridge[ridge.length - 1] };
    // cumulative lengths along the climbing ridge
    var len = [0];
    for (var i = 1; i < ridge.length; i++) len.push(len[i - 1] + Math.hypot(ridge[i][0] - ridge[i - 1][0], ridge[i][1] - ridge[i - 1][1]));
    M.len = len; M.total = len[len.length - 1];

    // distant range
    el("polygon", { points: pts([[x0 - MW * .55, GROUND], [x0 - MW * .25, top + MH * .52], [x0 - MW * .05, top + MH * .64], [x0 + MW * .2, top + MH * .3], [x0 + MW * .45, top + MH * .5], [x0 + MW * .9, top + MH * .12], [W, top + MH * .36], [W, GROUND]]), fill: "url(#mtn-back)" }, svg);
    // main massif
    el("polygon", { points: pts(outline.concat([[x0, GROUND]])), fill: "url(#mtn-face)", style: "stroke:var(--brand-1);stroke-opacity:.75;stroke-width:1.4;stroke-linejoin:round" }, svg);
    // rock strata / couloirs
    var strata = [[[.4, .62], [.52, .72]], [[.55, .46], [.66, .55]], [[.68, .3], [.76, .42]], [[.8, .52], [.86, .66]], [[.3, .8], [.42, .9]], [[.62, .7], [.7, .84]]];
    strata.forEach(function (s) { el("path", { d: "M" + P(s[0][0], s[0][1]).join(",") + " L" + P(s[1][0], s[1][1]).join(","), style: "stroke:var(--brand-1);stroke-opacity:.28;stroke-width:1;stroke-linecap:round", fill: "none" }, svg); });
    // snow cap
    var snow = [[.52, .4], [.61, .2], [.66, .17], [.72, .03], [.78, .14], [.83, .22], [.8, .25], [.76, .2], [.73, .27], [.69, .23], [.65, .3], [.6, .28], [.56, .38]].map(function (p) { return P(p[0], p[1]); });
    el("polygon", { points: pts(snow), fill: "#f4f7fb", style: "stroke:var(--brand-1);stroke-opacity:.45;stroke-width:.8;stroke-linejoin:round" }, svg);

    // trail
    el("line", { x1: 0, y1: GROUND + .5, x2: x0 + 2, y2: GROUND + .5, style: "stroke:var(--brand-1);stroke-opacity:.55;stroke-width:1.5" }, svg);
    for (var t = 14; t < x0 - 10; t += 34) el("line", { x1: t, y1: GROUND + 6, x2: t + 10, y2: GROUND + 6, style: "stroke:var(--text-faint);stroke-opacity:.35;stroke-width:1;stroke-linecap:round" }, svg);

    // rocks on the trail
    rocks = [];
    var trail = x0 - 30;
    [.22, .42, .62, .8].forEach(function (f, k) {
      var rx = trail * f, w = 15 + (k % 2) * 5, h = 9 + (k % 3) * 2.5;
      el("path", { d: "M" + (rx - w / 2) + "," + GROUND + " Q" + (rx - w / 2.3) + "," + (GROUND - h * .9) + " " + (rx - w * .1) + "," + (GROUND - h) + " Q" + (rx + w / 3) + "," + (GROUND - h * 1.05) + " " + (rx + w / 2) + "," + GROUND + " Z",
        style: "fill:var(--surface-2);stroke:var(--text-faint);stroke-width:1.1;stroke-linejoin:round" }, svg);
      rocks.push({ x: rx, w: w });
    });
    M.trailEnd = x0 - 4;

    // summit flag (raised on arrival)
    flag = el("g", { transform: "translate(" + M.summit[0] + "," + M.summit[1] + ")", style: "opacity:0;transition:opacity .4s" }, svg);
    el("line", { x1: 0, y1: 0, x2: 0, y2: -24, style: "stroke:var(--text);stroke-width:1.4;stroke-linecap:round" }, flag);
    flag.cloth = el("path", { d: "M0,-24 L15,-20 L0,-15 Z", style: "fill:var(--warm)", transform: "translate(0,14) scale(1,.0001)" }, flag);

    // the trekker
    layer = el("g", {}, svg);
    fig = el("g", { style: "transition:opacity .6s" }, layer);
    var limb = function (cls) { return el("path", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", style: cls }, fig); };
    parts.armFar = limb("stroke:var(--text-muted);stroke-width:2.6");
    parts.legFar = limb("stroke:var(--text-muted);stroke-width:3.2");
    parts.pack = el("rect", { rx: 2.2, width: 6.2, height: 10, style: "fill:var(--warm)" }, fig);
    parts.torso = limb("stroke:var(--text);stroke-width:5");
    parts.head = el("circle", { r: B.head, style: "fill:var(--text)" }, fig);
    parts.cap = el("path", { style: "fill:var(--brand-1)" }, fig);
    parts.legNear = limb("stroke:var(--text);stroke-width:3.4");
    parts.armNear = limb("stroke:var(--text);stroke-width:2.8");
    dust = [];
  }

  /* ---------------- ground ---------------- */
  function groundY(x) {
    var o = M.outline;
    if (x <= o[0][0] || x >= o[o.length - 1][0]) return GROUND;
    for (var i = 1; i < o.length; i++) if (x <= o[i][0]) {
      var a = o[i - 1], b = o[i], t = (x - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
    return GROUND;
  }
  function ridgeAt(s) { // point + slope angle at arc length s along the climbing ridge
    s = Math.max(0, Math.min(M.total, s));
    var L = M.len, R = M.ridge;
    for (var i = 1; i < R.length; i++) if (s <= L[i]) {
      var t = (s - L[i - 1]) / (L[i] - L[i - 1]);
      return { x: R[i - 1][0] + (R[i][0] - R[i - 1][0]) * t, angle: Math.atan2(R[i - 1][1] - R[i][1], R[i][0] - R[i - 1][0]) };
    }
    return { x: M.summit[0], angle: 0 };
  }

  /* ---------------- kinematics ---------------- */
  // angles in radians from straight down; positive = toward the direction of travel
  var dir = function (a) { return [Math.sin(a), Math.cos(a)]; };
  var add = function (p, a, l) { var d = dir(a); return [p[0] + d[0] * l, p[1] + d[1] * l]; };

  function legPoints(hip, thigh, flex) {
    var knee = add(hip, thigh, B.thigh), shin = thigh - flex, ankle = add(knee, shin, B.shin);
    var toe = add(ankle, shin + Math.PI / 2 - 0.12, B.foot);
    return [hip, knee, ankle, toe];
  }
  function armPoints(sh, upper, flex) {
    var elbow = add(sh, upper, B.upper);
    return [sh, elbow, add(elbow, upper + flex, B.fore)];
  }
  var path = function (p) { return "M" + p.map(function (q) { return q[0].toFixed(2) + "," + q[1].toFixed(2); }).join(" L"); };

  function draw(x, pose, lift) {
    // solve hip height so the lower foot rests on the ground under it
    var hip0 = [0, 0];
    var near = legPoints(hip0, pose.thighN, pose.flexN), far = legPoints(hip0, pose.thighF, pose.flexF);
    var need = Infinity;
    [near, far].forEach(function (leg) {
      [leg[2], leg[3]].forEach(function (p) { need = Math.min(need, groundY(x + p[0]) - p[1] - 1.2); });
    });
    var hy = need - (lift || 0), hip = [x, hy];
    near = legPoints(hip, pose.thighN, pose.flexN); far = legPoints(hip, pose.thighF, pose.flexF);
    var sh = [x + Math.sin(pose.lean) * B.torso, hy - Math.cos(pose.lean) * B.torso];
    var neck = [sh[0] + Math.sin(pose.lean) * B.neck, sh[1] - Math.cos(pose.lean) * B.neck];
    var head = [neck[0] + Math.sin(pose.lean + .15) * B.head, neck[1] - Math.cos(pose.lean + .15) * B.head];
    parts.legNear.setAttribute("d", path(near));
    parts.legFar.setAttribute("d", path(far));
    parts.torso.setAttribute("d", path([hip, sh]));
    parts.armNear.setAttribute("d", path(armPoints(sh, pose.upperN, pose.elbowN)));
    parts.armFar.setAttribute("d", path(armPoints(sh, pose.upperF, pose.elbowF)));
    parts.head.setAttribute("cx", head[0].toFixed(2)); parts.head.setAttribute("cy", head[1].toFixed(2));
    // beanie: a small cap on the crown, tilted with the head
    var deg = pose.lean * 57.3;
    parts.cap.setAttribute("d", "M" + (head[0] - B.head) + "," + (head[1] - .4) + " A" + B.head + "," + B.head + " 0 0 1 " + (head[0] + B.head) + "," + (head[1] - .4) + " Z");
    parts.cap.setAttribute("transform", "rotate(" + deg.toFixed(1) + " " + head[0].toFixed(2) + " " + head[1].toFixed(2) + ")");
    // backpack sits behind the shoulders
    var mid = [(hip[0] + sh[0]) / 2, (hip[1] + sh[1]) / 2], back = [mid[0] - Math.cos(pose.lean) * 3.6, mid[1] - Math.sin(pose.lean) * 3.6];
    parts.pack.setAttribute("transform", "translate(" + (back[0] - 3.1).toFixed(2) + "," + (back[1] - 5).toFixed(2) + ") rotate(" + deg.toFixed(1) + " 3.1 5)");
    return { feet: [near[3], far[3]] };
  }

  /* ---------------- poses ---------------- */
  function runPose(ph) {
    var leg = function (p) { return { thigh: .62 * Math.sin(p), flex: .18 + 1.25 * Math.pow(Math.max(0, Math.cos(p)), 1.3) }; };
    var a = leg(ph), b = leg(ph + Math.PI);
    return { lean: .2, thighN: a.thigh, flexN: a.flex, thighF: b.thigh, flexF: b.flex,
      upperN: -.75 * Math.sin(ph), elbowN: 1.5, upperF: .75 * Math.sin(ph), elbowF: 1.5 };
  }
  function jumpPose(j) {
    var tuck = Math.sin(Math.min(1, j * 1.15) * Math.PI);
    return { lean: .28, thighN: .35 + .75 * tuck, flexN: .4 + 1.2 * tuck, thighF: -.25 + .3 * tuck, flexF: .7 + 1.0 * tuck,
      upperN: .9 + .5 * tuck, elbowN: .8, upperF: -.7, elbowF: 1.2 };
  }
  function climbPose(ph, slope) {
    // uphill hiking stride: feet stay under the hips, the leading knee lifts high
    var leg = function (p) { return { thigh: .62 + .42 * Math.sin(p), flex: .5 + .85 * Math.pow(Math.max(0, Math.cos(p)), 1.2) }; };
    var a = leg(ph), b = leg(ph + Math.PI);
    return { lean: .28 + slope * .35, thighN: a.thigh, flexN: a.flex, thighF: b.thigh, flexF: b.flex,
      // arms pump with the stride, one hand reaching for the rock ahead
      upperN: .75 + .55 * Math.sin(ph + Math.PI), elbowN: .9, upperF: .75 + .55 * Math.sin(ph), elbowF: .9 };
  }
  function slipPose(t) {
    var f = Math.sin(t * 15);
    return { lean: -.55 + .08 * f, thighN: 1.05, flexN: .35, thighF: .85, flexF: .55,
      upperN: 2.5 + .45 * f, elbowN: .5, upperF: 2.1 - .45 * f, elbowF: .6 };
  }
  function crouchPose() { return { lean: .75, thighN: 1.35, flexN: 2.3, thighF: 1.15, flexF: 2.1, upperN: 1.2, elbowN: .6, upperF: .9, elbowF: .7 }; }
  function standPose() { return { lean: .06, thighN: .08, flexN: .06, thighF: -.06, flexF: .04, upperN: .12, elbowN: .25, upperF: -.08, elbowF: .2 }; }
  function cheerPose(t) {
    var w = Math.sin(t * 9) * .18;
    return { lean: 0, thighN: .16, flexN: .05, thighF: -.16, flexF: .05, upperN: Math.PI - .5 + w, elbowN: .2, upperF: Math.PI + .5 - w, elbowF: .2 };
  }
  function mix(a, b, t) { var o = {}; for (var k in a) o[k] = a[k] + (b[k] - a[k]) * t; return o; }
  var ease = function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  /* ---------------- dust ---------------- */
  function puff(p, n, vx) {
    for (var i = 0; i < n; i++) {
      var c = el("circle", { r: 1 + Math.random() * 1.4, style: "fill:var(--text-faint)" }, layer);
      dust.push({ n: c, x: p[0], y: p[1], vx: (vx || 0) + (Math.random() - .5) * 18, vy: -6 - Math.random() * 10, life: 0 });
    }
  }
  function stepDust(dt) {
    dust = dust.filter(function (d) {
      d.life += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 30 * dt;
      var a = 1 - d.life / .7;
      if (a <= 0) { d.n.remove(); return false; }
      d.n.setAttribute("cx", d.x.toFixed(1)); d.n.setAttribute("cy", d.y.toFixed(1)); d.n.style.opacity = (a * .7).toFixed(2);
      return true;
    });
  }

  /* ---------------- story ---------------- */
  var S;
  function reset() {
    S = { state: "run", x: -10, ph: 0, rock: 0, s: 0, slipped: false, t: 0, jx: 0 };
    fig.style.opacity = "1"; flag.style.opacity = "0";
    flag.cloth.setAttribute("transform", "translate(0,14) scale(1,.0001)");
  }

  function step(dt) {
    var speed = Math.max(48, Math.min(90, W * .075));
    S.t += dt;
    if (S.state === "run" || S.state === "jump") {
      S.x += speed * dt;
      if (S.state === "run") {
        S.ph += speed * dt / 15;                 // ~one stride per 30 px
        var r = rocks[S.rock];
        if (r && S.x >= r.x - r.w / 2 - 20) { S.state = "jump"; S.jx = S.x; S.span = r.w + 34; }
        if (S.x >= M.trailEnd) { S.state = "climb"; S.s = 0; S.ph = 0; }
        var prevGround = Math.sin(S.ph - speed * dt / 15) * Math.sin(S.ph) < 0;
        draw(S.x, runPose(S.ph), Math.abs(Math.sin(S.ph)) * 1.6);
        if (prevGround && Math.random() < .35) puff([S.x + 4, GROUND], 1, -speed * .3);
      } else {
        var j = (S.x - S.jx) / S.span;
        if (j >= 1) { S.state = "run"; S.rock++; puff([S.x + 3, GROUND], 4, -10); j = 1; }
        draw(S.x, jumpPose(j), Math.sin(j * Math.PI) * 22);
      }
    } else if (S.state === "climb") {
      var rp = ridgeAt(S.s);
      var slope = Math.max(0, rp.angle);
      S.s += (14 + 10 * (1 - slope)) * dt;      // slower where it is steeper
      S.ph += (14 + 10 * (1 - slope)) * dt / 5.5;
      if (!S.slipped && S.s >= M.total * .55) { S.state = "slip"; S.t = 0; puff([rp.x, groundY(rp.x)], 5, -20); }
      else if (S.s >= M.total) { S.state = "summit"; S.t = 0; flag.style.opacity = "1"; }
      draw(rp.x - 5, climbPose(S.ph, slope), 0);
    } else if (S.state === "slip") {
      S.s -= 95 * dt;
      var q = ridgeAt(S.s);
      if (Math.random() < .5) puff([q.x + 6, groundY(q.x + 6)], 1, 25);
      if (S.s <= 0) { S.s = 0; S.state = "getup"; S.t = 0; S.slipped = true; puff([q.x, GROUND], 6, 0); }
      draw(q.x, slipPose(S.t), 0);
    } else if (S.state === "getup") {
      var g = ridgeAt(0), u = Math.min(1, S.t / 1.1);
      // sit -> crouch -> stand, a short breath, then go again
      var pose = u < .45 ? mix(slipPose(0), crouchPose(), ease(u / .45)) : mix(crouchPose(), standPose(), ease((u - .45) / .55));
      draw(g.x - 2, pose, 0);
      if (S.t > 1.7) { S.state = "climb"; S.ph = 0; }
    } else if (S.state === "summit") {
      var k = Math.min(1, S.t / .6);
      flag.cloth.setAttribute("transform", "translate(0," + (14 - 14 * ease(k)).toFixed(2) + ") scale(1," + Math.max(.0001, ease(k)).toFixed(3) + ")");
      var hop = S.t < 1.6 ? Math.abs(Math.sin(S.t * 6)) * 4 : 0;
      draw(M.summit[0] - 6, S.t < .35 ? mix(standPose(), cheerPose(0), ease(S.t / .35)) : cheerPose(S.t), hop);
      if (S.t > 3.2) { S.state = "fade"; S.t = 0; fig.style.opacity = "0"; }
    } else if (S.state === "fade") {
      if (S.t > 1.4) reset();
    }
    stepDust(dt);
  }

  /* ---------------- loop ---------------- */
  var running = false, last = 0, raf = 0;
  function frame(now) {
    if (!running) return;
    var dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    step(dt);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (running || reduce) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  build(); reset();
  if (reduce) { // a still: standing on the summit with the flag up
    flag.style.opacity = "1"; flag.cloth.setAttribute("transform", "");
    draw(M.summit[0] - 6, cheerPose(0), 0);
    return;
  }
  draw(S.x, runPose(0), 0);
  start();
  if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { e[0].isIntersecting ? start() : stop(); }).observe(host);
  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (Math.abs(host.clientWidth - W) > 4) { build(); reset(); } }, 150);
  });
})();
