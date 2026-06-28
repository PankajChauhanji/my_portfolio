(function () {
  "use strict";
  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function toggleTheme() {
    var dark = root.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
  }
  ["theme-toggle", "theme-toggle-m"].forEach(function (id) {
    var el = document.getElementById(id); if (el) el.addEventListener("click", toggleTheme);
  });

  var menuBtn = document.getElementById("menu-btn");
  var menu = document.getElementById("mobile-menu");
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", function () {
      var open = menu.classList.toggle("hidden") === false;
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.textContent = open ? "\u2715" : "\u2261";
    });
  }

  var typer = document.getElementById("typer");
  if (typer) {
    var roles = [];
    try { roles = JSON.parse(typer.dataset.roles || "[]"); } catch (e) {}
    if (!roles.length) roles = ["developer"];
    if (reduceMotion) { typer.textContent = roles[0]; }
    else {
      var ri = 0, ci = 0, deleting = false;
      (function tick() {
        var word = roles[ri];
        typer.textContent = word.slice(0, ci);
        if (!deleting && ci < word.length) { ci++; setTimeout(tick, 75); }
        else if (!deleting && ci === word.length) { deleting = true; setTimeout(tick, 1400); }
        else if (deleting && ci > 0) { ci--; setTimeout(tick, 38); }
        else { deleting = false; ri = (ri + 1) % roles.length; setTimeout(tick, 350); }
      })();
    }
  }

  var reveals = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (el, i) { el.style.transitionDelay = Math.min(i % 6, 5) * 60 + "ms"; io.observe(el); });
  }

  var field = document.querySelector(".contour-field");
  if (field && !reduceMotion && window.matchMedia("(pointer:fine)").matches) {
    window.addEventListener("pointermove", function (e) {
      var x = (e.clientX / window.innerWidth - 0.5) * 18;
      var y = (e.clientY / window.innerHeight - 0.5) * 18;
      field.style.transform = "translate3d(" + x + "px," + y + "px,0) scale(1.08)";
    }, { passive: true });
  }

  var lb = document.getElementById("lightbox");
  if (lb) {
    var lbImg = document.getElementById("lightbox-img");
    var lbCap = document.getElementById("lightbox-cap");
    function openLb(t) {
      lbImg.src = t.dataset.img;
      var cap = t.dataset.caption || t.dataset.name || "";
      lbImg.alt = cap;
      lbCap.textContent = cap;
      lb.classList.remove("hidden"); lb.classList.add("flex");
    }
    function closeLb() { lb.classList.add("hidden"); lb.classList.remove("flex"); }
    document.querySelectorAll(".lightbox-trigger").forEach(function (b) { b.addEventListener("click", function () { openLb(b); }); });
    document.getElementById("lightbox-close").addEventListener("click", closeLb);
    lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });
  }

  /* ---------- Contact modal ---------- */
  var cm = document.getElementById("contact-modal");
  if (cm) {
    var form = document.getElementById("contact-form");
    var statusEl = document.getElementById("cf-status");
    var submitBtn = document.getElementById("cf-submit");
    function openCM() {
      cm.classList.remove("hidden"); cm.classList.add("flex");
      document.body.style.overflow = "hidden";
      var f = document.getElementById("cf-email"); if (f) setTimeout(function () { f.focus(); }, 60);
    }
    function closeCM() { cm.classList.add("hidden"); cm.classList.remove("flex"); document.body.style.overflow = ""; }
    document.querySelectorAll(".contact-open").forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); openCM(); });
    });
    var cClose = document.getElementById("contact-close");
    if (cClose) cClose.addEventListener("click", closeCM);
    cm.addEventListener("click", function (e) { if (e.target === cm) closeCM(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !cm.classList.contains("hidden")) closeCM(); });

    function setStatus(msg, isErr) {
      statusEl.classList.remove("hidden");
      statusEl.textContent = msg;
      statusEl.style.color = isErr ? "var(--alpenglow-1)" : "var(--glacier)";
    }
    function resetBtn() { submitBtn.disabled = false; submitBtn.textContent = "Send message"; }

    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.email.value.trim(), phone = form.phone.value.trim(),
          subject = form.subject.value.trim(), message = form.message.value.trim();
      if (!email || !message) { setStatus("Please add your email and a message.", true); return; }
      var provider = form.dataset.provider, to = form.dataset.to, key = form.dataset.key,
          success = form.dataset.success || "Thanks! Your message is on its way.";
      var subj = subject || ("New message from " + email);
      submitBtn.disabled = true; submitBtn.textContent = "Sending...";
      statusEl.classList.add("hidden");

      var req;
      if (provider === "web3forms") {
        req = fetch("https://api.web3forms.com/submit", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ access_key: key, email: email, phone: phone, subject: subj, message: message })
        });
      } else if (provider === "flask") {
        req = fetch("/contact", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, phone: phone, subject: subject, message: message })
        });
      } else { /* formsubmit (default) */
        req = fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email: email, phone: phone, _subject: subj, message: message })
        });
      }
      req.then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          if (d.success === true || d.success === "true" || d.ok === true) {
            form.reset(); resetBtn(); setStatus(success, false);
          } else {
            setStatus(d.message || "Something went wrong - please email me directly.", true); resetBtn();
          }
        })
        .catch(function () { setStatus("Network error - please email me directly.", true); resetBtn(); });
    });
  }

})();
