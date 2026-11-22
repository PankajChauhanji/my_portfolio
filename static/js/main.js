(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(pointer: fine)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- theme ---------- */
  var toggle = $("#theme-toggle");
  if (toggle) toggle.addEventListener("click", function () {
    var dark = root.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
  });

  /* ---------- header: border on scroll ---------- */
  var header = $("#site-header");
  function onScroll() { if (header) header.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- mobile menu ---------- */
  var menuBtn = $("#menu-btn"), menu = $("#mobile-menu");
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    $$("a, button", menu).forEach(function (el) { el.addEventListener("click", function () { menu.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }); });
  }

  /* ---------- nav: sliding pill indicator ---------- */
  var navLinks = $("#nav-links");
  if (navLinks) {
    var pill = $(".nav-pill", navLinks);
    var active = $(".nav-link.active", navLinks);
    var place = function (el) {
      if (!el) { pill.style.opacity = "0"; return; }
      pill.style.left = el.offsetLeft + "px"; pill.style.width = el.offsetWidth + "px"; pill.style.opacity = "1";
    };
    place(active);
    $$(".nav-link", navLinks).forEach(function (a) { a.addEventListener("mouseenter", function () { place(a); }); });
    navLinks.addEventListener("mouseleave", function () { place(active); });
    window.addEventListener("resize", function () { place(active); });
  }

  /* ---------- hero headline: line-by-line rise ---------- */
  requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add("ready"); }); });

  /* ---------- scroll reveal ---------- */
  var reveals = $$(".reveal");
  if (reduce || !("IntersectionObserver" in window)) reveals.forEach(function (el) { el.classList.add("in"); });
  else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- metric count-up ---------- */
  var counters = $$("[data-count]");
  function countUp(el) {
    var raw = el.getAttribute("data-count");
    var m = raw.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
    if (!m || reduce) return;
    var prefix = m[1], target = parseFloat(m[2].replace(/,/g, "")), suffix = m[3];
    var decimals = (m[2].split(".")[1] || "").length, comma = m[2].indexOf(",") > -1;
    var start = null, dur = 1600;
    function frame(t) {
      if (!start) start = t;
      var p = Math.min((t - start) / dur, 1), eased = 1 - Math.pow(1 - p, 4);
      var v = (target * eased).toFixed(decimals);
      if (comma) v = Number(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      el.textContent = prefix + v + suffix;
      if (p < 1) requestAnimationFrame(frame); else el.textContent = raw;
    }
    requestAnimationFrame(frame);
    setTimeout(function () { el.textContent = raw; }, dur + 400); // never leave a half-counted number
  }
  if (counters.length && "IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { cio.observe(c); });
  }

  /* ---------- card spotlight follows the cursor ---------- */
  if (finePointer && !reduce) {
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest && e.target.closest(".spot");
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  /* ---------- terminal typer ---------- */
  var typer = $("#typer");
  if (typer && !reduce) {
    var roles = [];
    try { roles = JSON.parse(typer.dataset.roles || "[]"); } catch (e) {}
    if (roles.length) {
      var ri = 0, ci = roles[0].length, deleting = true;
      setTimeout(function tick() {
        var word = roles[ri];
        typer.textContent = word.slice(0, ci);
        if (deleting) { if (ci > 0) { ci--; return setTimeout(tick, 32); } deleting = false; ri = (ri + 1) % roles.length; return setTimeout(tick, 260); }
        if (ci < roles[ri].length) { ci++; return setTimeout(tick, 70); }
        deleting = true; setTimeout(tick, 1800);
      }, 2200);
    }
  }

  /* ---------- hero pipeline: cycles real use-cases ---------- */
  var pipe = $("#pipeline");
  if (pipe) {
    var out = $("#code-out"), file = $("#pipe-file"), status = $("#pipe-status"), cost = $("#pipe-cost");
    var nodes = $$(".flow-node", pipe);
    var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
    var runs = [
      { file: 'pipeline.run("company_profile")', status: "3 runs/s · p95 412 ms", cost: "precision 99.4%",
        obj: [["company", "Acme Instruments Pvt Ltd"], ["website", "acme-instruments.in"], ["nic_2008", "26517"], ["activity", "Industrial process control equipment"], ["confidence", 0.994]] },
      { file: 'pipeline.run("pep_affidavit")', status: "lang: hi · handwritten · rotated", cost: "cost/doc −44%",
        obj: [["document", "Form-26 affidavit"], ["language", "Hindi"], ["pan", "ABCPK1234Q"], ["readers_agree", true], ["precision", 0.971]] },
      { file: 'pipeline.run("fir_report")', status: "state: Maharashtra · 7 pages/call", cost: "OCR cost −85%",
        obj: [["fir_no", "0412/2026"], ["police_station", "Andheri East"], ["sections", ["IPC 420", "IPC 406"]], ["accused", 2], ["accuracy", 0.975]] },
      { file: 'pipeline.run("adverse_media")', status: "10K articles/day · ML pre-filter", cost: "LLM cost −85%",
        obj: [["entity", "Example Traders Ltd"], ["risk", "Litigation"], ["severity", "medium"], ["source", "news"], ["llm_calls_saved", 0.48]] }
    ];
    var fmtVal = function (v) {
      if (typeof v === "number" || typeof v === "boolean") return '<span class="n">' + v + "</span>";
      if (Array.isArray(v)) return '<span class="p">[</span>' + v.map(function (x) { return '<span class="s">"' + esc(x) + '"</span>'; }).join('<span class="p">, </span>') + '<span class="p">]</span>';
      return '<span class="s">"' + esc(v) + '"</span>';
    };
    var render = function (pairs, upto) {
      var lines = pairs.slice(0, upto).map(function (kv, i) {
        return '  <span class="k">"' + kv[0] + '"</span><span class="p">:</span> ' + fmtVal(kv[1]) + (i < pairs.length - 1 ? '<span class="p">,</span>' : "");
      });
      return '<span class="p">{</span>\n' + lines.join("\n") + (upto ? "\n" : "") + '<span class="p">}</span>';
    };
    var idx = 0, visible = true;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(pipe);
    var play = function () {
      if (reduce) return;
      if (!visible || document.hidden) return setTimeout(play, 800);
      var run = runs[idx]; idx = (idx + 1) % runs.length;
      file.textContent = run.file;
      var step = 0;
      var stepper = setInterval(function () {
        nodes.forEach(function (n, i) { n.classList.toggle("active", i === step); });
        if (step === 3) {
          clearInterval(stepper);
          var k = 0;
          var typer2 = setInterval(function () {
            k++; out.innerHTML = render(run.obj, k);
            if (k >= run.obj.length) {
              clearInterval(typer2);
              status.innerHTML = "<b>●</b> " + esc(run.status); cost.textContent = run.cost;
              setTimeout(function () { nodes.forEach(function (n) { n.classList.remove("active"); }); play(); }, 2600);
            }
          }, 170);
        }
        step++;
      }, 520);
      out.innerHTML = render(run.obj, 0);
    };
    setTimeout(play, 1400);
  }

  /* ---------- lightbox (explorer galleries) ---------- */
  var lb = $("#lightbox");
  if (lb) {
    var lbImg = $("#lightbox-img"), lbCap = $("#lightbox-cap"), lbCounter = $("#lightbox-counter");
    var triggers = $$(".lightbox-trigger"), cur = 0;
    var showAt = function (i) {
      cur = (i + triggers.length) % triggers.length;
      var t = triggers[cur]; lbImg.src = t.dataset.img; lbImg.alt = t.dataset.caption || "";
      lbCap.textContent = t.dataset.caption || ""; if (lbCounter) lbCounter.textContent = (cur + 1) + " / " + triggers.length;
    };
    var openLb = function (i) { showAt(i); lb.classList.add("flex"); document.body.style.overflow = "hidden"; };
    var closeLb = function () { lb.classList.remove("flex"); document.body.style.overflow = ""; };
    triggers.forEach(function (b, i) { b.addEventListener("click", function () { openLb(i); }); });
    $("#lightbox-close").addEventListener("click", closeLb);
    lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
    $("#lightbox-prev").addEventListener("click", function () { showAt(cur - 1); });
    $("#lightbox-next").addEventListener("click", function () { showAt(cur + 1); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("flex")) return;
      if (e.key === "Escape") closeLb(); else if (e.key === "ArrowLeft") showAt(cur - 1); else if (e.key === "ArrowRight") showAt(cur + 1);
    });
  }

  /* ---------- contact modal ---------- */
  var cm = $("#contact-modal");
  if (cm) {
    var form = $("#contact-form"), statusEl = $("#cf-status"), submitBtn = $("#cf-submit");
    var openCM = function () { cm.classList.add("flex"); document.body.style.overflow = "hidden"; setTimeout(function () { var f = $("#cf-email"); if (f) f.focus(); }, 80); };
    var closeCM = function () { cm.classList.remove("flex"); document.body.style.overflow = ""; };
    $$(".contact-open").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); openCM(); }); });
    $("#contact-close").addEventListener("click", closeCM);
    cm.addEventListener("click", function (e) { if (e.target === cm) closeCM(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && cm.classList.contains("flex")) closeCM(); });
    var setStatus = function (msg, err) { statusEl.classList.remove("hidden"); statusEl.textContent = msg; statusEl.style.color = err ? "#ef4444" : "var(--ok)"; };
    var resetBtn = function () { submitBtn.disabled = false; submitBtn.textContent = "Send message"; };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.email.value.trim(), phone = form.phone.value.trim(), subject = form.subject.value.trim(), message = form.message.value.trim();
      if (!email || !message) return setStatus("Please add your email and a message.", true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setStatus("Please enter a valid email address.", true);
      var provider = form.dataset.provider, to = form.dataset.to, key = form.dataset.key, success = form.dataset.success || "Thanks! Your message is on its way.";
      var subj = subject || ("New message from " + email);
      submitBtn.disabled = true; submitBtn.textContent = "Sending…"; statusEl.classList.add("hidden");
      var req;
      if (provider === "web3forms") req = fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ access_key: key, email: email, phone: phone, subject: subj, message: message }) });
      else if (provider === "flask") req = fetch("/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email, phone: phone, subject: subject, message: message }) });
      else req = fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email: email, phone: phone, _subject: subj, message: message }) });
      req.then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) { if (d.success === true || d.success === "true" || d.ok === true) { form.reset(); resetBtn(); setStatus(success, false); } else { setStatus(d.message || "Something went wrong — please email me directly.", true); resetBtn(); } })
        .catch(function () { setStatus("Network error — please email me directly.", true); resetBtn(); });
    });
  }
})();
