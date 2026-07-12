document.addEventListener("DOMContentLoaded", function () {
  var container = document.getElementById("runner-container");
  var char = document.getElementById("runner-character");
  var mountainContainer = container ? container.querySelector(".mountain-container") : null;
  if (!container || !char || !mountainContainer) return;

  // Respect user prefers-reduced-motion preferences
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    char.style.display = "none";
    return;
  }

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

  // Animation constants
  var runSpeed = 0.09; // Slower run
  var climbSpeed = 0.13; // Slower climbing speed
  var fallSpeed = 0.95; // Slower slide-down speed
  var jumpHeight = 22; // Max jump height in pixels

  // State variables
  var progress = 0; // 0 to 100% of the running track
  var climbY = 0; // pixels climbed (up to climbLimit)
  var celebrateTime = 0; // tick counter for celebration
  var state = "run"; // 'run', 'jump', 'climb', 'fall', 'wait_after_fall', 'celebrate', 'wait'
  var jumpStartProgress = 0;
  var hasFallen = false; // flag to only slip once per climb
  var runFrameToggle = 0; // counter to cycle leg movements
  var climbFrameToggle = 0; // counter to cycle climbing limbs
  var fallFrameToggle = 0; // counter to cycle flailing arms
  
  // Dynamic geometry variables
  var endX = 0; 
  var mountainWidth = 0;
  var mountainLeft = 0;
  var climbLimit = 0;
  
  function updateGeometry() {
    mountainWidth = mountainContainer.clientWidth;
    mountainLeft = mountainContainer.offsetLeft;
    climbLimit = mountainWidth * 0.78; // Summit peak is 78% of mountain container height
    endX = getEndX();
  }

  function getEndX() {
    // aligns character's center with the base of the mountain (x=10% on mountain SVG)
    // 14px offset centers the 28px character
    return mountainLeft + (10 / 100) * mountainWidth - 14; 
  }

  function updateBoulderPositions() {
    // Char width is 28px, boulder width is 20px. Center offset = (28 - 20) / 2 = 4px
    var offset = 4;
    if (boulders[0]) boulders[0].style.left = (0.20 * endX + offset) + "px";
    if (boulders[1]) boulders[1].style.left = (0.40 * endX + offset) + "px";
    if (boulders[2]) boulders[2].style.left = (0.60 * endX + offset) + "px";
    if (boulders[3]) boulders[3].style.left = (0.80 * endX + offset) + "px";
  }

  function tick() {
    updateGeometry();
    updateBoulderPositions();

    if (state === "run" || state === "jump") {
      progress += runSpeed;
      if (progress >= 100) {
        progress = 100;
        state = "climb";
        setFrame("climb1");
        climbY = 0;
        climbFrameToggle = 0;
      }

      // Check jumping over 4 rocks:
      // Rock 1 at 20%
      if (state === "run" && progress >= 16 && progress <= 24) {
        state = "jump";
        jumpStartProgress = 16;
        setFrame("jump");
      }
      // Rock 2 at 40%
      if (state === "run" && progress >= 36 && progress <= 44) {
        state = "jump";
        jumpStartProgress = 36;
        setFrame("jump");
      }
      // Rock 3 at 60%
      if (state === "run" && progress >= 56 && progress <= 64) {
        state = "jump";
        jumpStartProgress = 56;
        setFrame("jump");
      }
      // Rock 4 at 80%
      if (state === "run" && progress >= 76 && progress <= 84) {
        state = "jump";
        jumpStartProgress = 76;
        setFrame("jump");
      }

      // Calculate coordinates
      var posX = (progress / 100) * endX;
      var posY = 0;

      if (state === "run") {
        // Toggle running frames to create leg-pumping movement instead of sliding
        runFrameToggle += 1;
        if (Math.floor(runFrameToggle / 24) % 2 === 0) {
          setFrame("run1");
        } else {
          setFrame("run2");
        }
      } else if (state === "jump") {
        // Parabolic jump arc: y = -sin(progress) * height
        var jumpProgress = (progress - jumpStartProgress) / 8; // jump duration is 8% progress
        if (jumpProgress >= 1.0) {
          state = "run";
          setFrame("run1");
          posY = 0;
        } else {
          posY = -Math.sin(jumpProgress * Math.PI) * jumpHeight;
        }
      }

      char.style.transform = "translate3d(" + posX + "px, " + posY + "px, 0)";
      if (progress > 1 && char.style.opacity === "0") {
        char.style.opacity = "1";
      }

    } else if (state === "climb") {
      climbY += climbSpeed;
      
      // Story detail: Slip and fall back down halfway up the first time
      if (!hasFallen && climbY >= (climbLimit / 2)) {
        state = "fall";
        setFrame("fall1");
        fallFrameToggle = 0;
      } else if (climbY >= climbLimit) { // Reached the peak
        climbY = climbLimit;
        state = "celebrate";
        setFrame("celebrate");
        celebrateTime = 0;
      } else {
        // Cycle hand and leg climbing movements
        climbFrameToggle += 1;
        if (Math.floor(climbFrameToggle / 16) % 2 === 0) {
          setFrame("climb1");
        } else {
          setFrame("climb2");
        }
      }
      
      // Interpolate along the quadratic bezier ridge: P0(10, 100), P1(32, 60), P2(68, 22)
      var t = climbY / climbLimit;
      var svgX = (1-t)*(1-t)*10 + 2*(1-t)*t*32 + t*t*68;
      var svgY = (1-t)*(1-t)*100 + 2*(1-t)*t*60 + t*t*22;
      
      var posX = mountainLeft + (svgX / 100) * mountainWidth - 14;
      var posY = -(((100 - svgY) / 100) * mountainWidth);
      char.style.transform = "translate3d(" + posX + "px, " + posY + "px, 0)";

    } else if (state === "fall") {
      climbY -= fallSpeed; // falling speed
      if (climbY <= 0) {
        climbY = 0;
        state = "wait_after_fall";
        setFrame("run1");
        setTimeout(function() {
          state = "climb";
          setFrame("climb1");
          climbFrameToggle = 0;
          hasFallen = true; // climb successfully next time
        }, 750); // Pause for 750ms on the ground before trying again
      } else {
        // Cycle panic flailing arms as he falls down
        fallFrameToggle += 1;
        if (Math.floor(fallFrameToggle / 6) % 2 === 0) {
          setFrame("fall1");
        } else {
          setFrame("fall2");
        }
      }
      
      // Interpolate coordinates during fall to slide back down along the ridge line
      var t = climbY / climbLimit;
      var svgX = (1-t)*(1-t)*10 + 2*(1-t)*t*32 + t*t*68;
      var svgY = (1-t)*(1-t)*100 + 2*(1-t)*t*60 + t*t*22;
      
      var posX = mountainLeft + (svgX / 100) * mountainWidth - 14;
      var posY = -(((100 - svgY) / 100) * mountainWidth);
      char.style.transform = "translate3d(" + posX + "px, " + posY + "px, 0)";

    } else if (state === "celebrate") {
      celebrateTime += 1;
      // Celebrate jump animation (up and down)
      var jumpOffset = -Math.abs(Math.sin(celebrateTime * 0.12)) * 12;
      
      var posX = mountainLeft + (68 / 100) * mountainWidth - 14;
      var posY = -climbLimit + jumpOffset;
      char.style.transform = "translate3d(" + posX + "px, " + posY + "px, 0)";

      if (celebrateTime >= 150) { // celebrate for 2.5s
        state = "wait";
        char.style.opacity = "0";
        setTimeout(function() {
          // Reset all variables to start over
          progress = 0;
          climbY = 0;
          celebrateTime = 0;
          hasFallen = false;
          state = "run";
          setFrame("run1");
          runFrameToggle = 0;
          climbFrameToggle = 0;
          fallFrameToggle = 0;
        }, 1500); // Wait 1.5s before repeating
      }
    }

    requestAnimationFrame(tick);
  }

  // Start the animation immediately
  setTimeout(function() {
    tick();
  }, 50);
});
