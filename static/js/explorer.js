document.addEventListener("DOMContentLoaded", function () {
  var container = document.getElementById("runner-container");
  var char = document.getElementById("runner-character");
  var mountainContainer = container ? container.querySelector(".mountain-container") : null;
  if (!container || !char || !mountainContainer) return;

  var frames = {
    run1: char.querySelector(".frame-run1"),
    run2: char.querySelector(".frame-run2"),
    jump: char.querySelector(".frame-jump"),
    fall1: char.querySelector(".frame-fall1"),
    fall2: char.querySelector(".frame-fall2"),
    climb1: char.querySelector(".frame-climb1"),
    climb2: char.querySelector(".frame-climb2"),
    celebrate: char.querySelector(".frame-celebrate")
  };

  var boulders = [
    container.querySelector(".boulder-1"),
    container.querySelector(".boulder-2"),
    container.querySelector(".boulder-3"),
    container.querySelector(".boulder-4")
  ];

  function setFrame(activeFrame) {
    for (var f in frames) {
      if (f === activeFrame) {
        frames[f].classList.remove("hidden");
      } else {
        frames[f].classList.add("hidden");
      }
    }
  }

  // Where the rocks sit along the track, as a fraction of its length
  var BOULDER_FRACS = [0.20, 0.40, 0.60, 0.80];

  // Dynamic geometry — recomputed on resize only, never inside the frame loop
  var mountainWidth = 0;
  var mountainLeft = 0;
  var climbLimit = 0;
  var endX = 0;
  var jumpSpan = 0;

  function updateGeometry() {
    mountainWidth = mountainContainer.clientWidth;
    mountainLeft = mountainContainer.offsetLeft;
    climbLimit = mountainWidth * 0.78; // Summit peak is 78% of mountain container height
    // aligns character's center with the base of the mountain (x=10% on mountain SVG)
    // 14px offset centers the 28px character
    endX = mountainLeft + (10 / 100) * mountainWidth - 14;
    // Rocks sit 20% of the track apart, so the hop must stay well inside that
    // gap or a narrow screen would start the next jump before landing.
    jumpSpan = Math.min(46, endX * 0.14);
    updateBoulderPositions();
  }

  function updateBoulderPositions() {
    // Char width is 28px, boulder width is 20px. Center offset = (28 - 20) / 2 = 4px
    var offset = 4;
    for (var i = 0; i < boulders.length; i++) {
      if (boulders[i]) boulders[i].style.left = (BOULDER_FRACS[i] * endX + offset) + "px";
    }
  }

  // Lay out the scene before anything else, so the boulders sit along the track
  // even when the character animation never starts (reduced motion).
  updateGeometry();

  // Recompute on resize rather than every frame (reading clientWidth/offsetLeft
  // in the frame loop forces a layout flush 60x a second). Both listeners are
  // registered so a viewport change is still caught if ResizeObserver is
  // unavailable or never delivers.
  window.addEventListener("resize", updateGeometry);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(updateGeometry).observe(container);
  }

  // Respect user prefers-reduced-motion preferences
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    char.style.display = "none";
    return;
  }

  // Animation constants. Everything is per-frame PIXELS, not a percentage of
  // the track: a % based speed crosses the track in a fixed time, so on a
  // narrow screen the figure crawls a few px/sec and stops reading as running.
  var RUN_SPEED = 1.3; // px per frame along the track
  var CLIMB_SPEED = 0.55; // px per frame up the ridge
  var FALL_SPEED = 1.8; // px per frame sliding back down
  var JUMP_HEIGHT = 24; // px at the top of the arc
  var STRIDE_PX = 20; // px of ground per leg swap
  var CLIMB_CYCLE_PX = 9; // px climbed per limb swap
  var FALL_CYCLE_PX = 6; // px fallen per flail swap

  // State variables
  var runX = 0; // px travelled along the track (0 -> endX)
  var climbY = 0; // px climbed (up to climbLimit)
  var celebrateTime = 0; // tick counter for celebration
  var state = "run"; // 'run', 'jump', 'climb', 'fall', 'wait_after_fall', 'celebrate', 'wait'
  var jumpStartX = 0;
  var nextBoulder = 0; // index of the next rock to hop
  var hasFallen = false; // flag to only slip once per climb
  var distanceRun = 0; // px accumulator driving the stride cycle

  // Position along the mountain ridge — quadratic bezier P0(10,100) P1(32,60) P2(68,22)
  function placeOnRidge() {
    var t = climbY / climbLimit;
    var svgX = (1 - t) * (1 - t) * 10 + 2 * (1 - t) * t * 32 + t * t * 68;
    var svgY = (1 - t) * (1 - t) * 100 + 2 * (1 - t) * t * 60 + t * t * 22;
    var posX = mountainLeft + (svgX / 100) * mountainWidth - 14;
    var posY = -(((100 - svgY) / 100) * mountainWidth);
    char.style.transform = "translate3d(" + posX + "px, " + posY + "px, 0)";
  }

  function tick() {
    if (state === "run" || state === "jump") {
      runX += RUN_SPEED;
      distanceRun += RUN_SPEED;
      if (runX >= endX) {
        runX = endX;
        state = "climb";
        setFrame("climb1");
        climbY = 0;
      }

      // Take off just before the next rock, one hop per rock
      if (state === "run" && nextBoulder < BOULDER_FRACS.length) {
        var boulderX = BOULDER_FRACS[nextBoulder] * endX;
        if (runX >= boulderX - jumpSpan * 0.5) {
          state = "jump";
          jumpStartX = runX;
          nextBoulder += 1;
          setFrame("jump");
        }
      }

      var posX = runX;
      var posY = 0;

      if (state === "run") {
        // Swap legs per distance covered, so the stride matches the speed
        setFrame(Math.floor(distanceRun / STRIDE_PX) % 2 === 0 ? "run1" : "run2");
      } else if (state === "jump") {
        // Parabolic arc across a fixed span of ground
        var jumpProgress = (runX - jumpStartX) / jumpSpan;
        if (jumpProgress >= 1.0) {
          state = "run";
          setFrame("run1");
        } else {
          posY = -Math.sin(jumpProgress * Math.PI) * JUMP_HEIGHT;
        }
      }

      char.style.transform = "translate3d(" + posX + "px, " + posY + "px, 0)";
      if (runX > 1 && char.style.opacity === "0") {
        char.style.opacity = "1";
      }

    } else if (state === "climb") {
      climbY += CLIMB_SPEED;

      // Story detail: Slip and fall back down halfway up the first time
      if (!hasFallen && climbY >= (climbLimit / 2)) {
        state = "fall";
        setFrame("fall1");
      } else if (climbY >= climbLimit) { // Reached the peak
        climbY = climbLimit;
        state = "celebrate";
        setFrame("celebrate");
        celebrateTime = 0;
      } else {
        // Cycle hand and leg climbing movements
        setFrame(Math.floor(climbY / CLIMB_CYCLE_PX) % 2 === 0 ? "climb1" : "climb2");
      }

      placeOnRidge();

    } else if (state === "fall") {
      climbY -= FALL_SPEED; // falling speed
      if (climbY <= 0) {
        climbY = 0;
        state = "wait_after_fall";
        setFrame("run1");
        setTimeout(function () {
          state = "climb";
          setFrame("climb1");
          hasFallen = true; // climb successfully next time
        }, 750); // Pause for 750ms on the ground before trying again
      } else {
        // Cycle panic flailing arms as he falls down
        setFrame(Math.floor(climbY / FALL_CYCLE_PX) % 2 === 0 ? "fall1" : "fall2");
      }

      placeOnRidge();

    } else if (state === "celebrate") {
      celebrateTime += 1;
      // Celebrate jump animation (up and down)
      var jumpOffset = -Math.abs(Math.sin(celebrateTime * 0.12)) * 12;

      var cx = mountainLeft + (68 / 100) * mountainWidth - 14;
      var cy = -climbLimit + jumpOffset;
      char.style.transform = "translate3d(" + cx + "px, " + cy + "px, 0)";

      if (celebrateTime >= 150) { // celebrate for 2.5s
        state = "wait";
        char.style.opacity = "0";
        setTimeout(function () {
          // Reset all variables to start over
          runX = 0;
          climbY = 0;
          celebrateTime = 0;
          hasFallen = false;
          nextBoulder = 0;
          distanceRun = 0;
          state = "run";
          setFrame("run1");
        }, 1500); // Wait 1.5s before repeating
      }
    }

    if (running) rafId = requestAnimationFrame(tick);
  }

  // Only animate while the scene is actually on screen
  var running = false;
  var rafId = null;

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Start straight away, then let the observer pause/resume it. Starting first
  // matters: if IntersectionObserver never delivers a callback the animation
  // still runs, rather than silently never starting.
  start();

  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start(); else stop();
    }, { threshold: 0 }).observe(container);
  }
});
