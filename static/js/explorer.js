document.addEventListener("DOMContentLoaded", function () {
  var container = document.getElementById("runner-container");
  var char = document.getElementById("runner-character");
  if (!container || !char) return;

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
  var climbLimit = 93.6; // 78% of 120px (mountain peak Y height relative to base)

  // State variables
  var progress = 0; // 0 to 100% of the running track
  var climbY = 0; // pixels climbed (up to 93.6px)
  var celebrateTime = 0; // tick counter for celebration
  var state = "run"; // 'run', 'jump', 'climb', 'fall', 'wait_after_fall', 'celebrate', 'wait'
  var jumpStartProgress = 0;
  var hasFallen = false; // flag to only slip once per climb
  var runFrameToggle = 0; // counter to cycle leg movements
  var climbFrameToggle = 0; // counter to cycle climbing limbs
  var fallFrameToggle = 0; // counter to cycle flailing arms
  
  // Track geometry (relative to container size)
  var endX = 0; 
  
  function getEndX() {
    // aligns the center of the 28px character with the start of the mountain (x=10 in 120px container)
    return container.clientWidth - 130; 
  }

  function tick() {
    endX = getEndX();

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
      
      var mountainLeft = container.clientWidth - 128; // right: 8px, width: 120px
      var posX = mountainLeft + (svgX / 100) * 120 - 14;
      var posY = -(((100 - svgY) / 100) * 120);
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
      
      var mountainLeft = container.clientWidth - 128;
      var posX = mountainLeft + (svgX / 100) * 120 - 14;
      var posY = -(((100 - svgY) / 100) * 120);
      char.style.transform = "translate3d(" + posX + "px, " + posY + "px, 0)";

    } else if (state === "celebrate") {
      celebrateTime += 1;
      // Celebrate jump animation (up and down)
      var jumpOffset = -Math.abs(Math.sin(celebrateTime * 0.12)) * 12;
      
      var mountainLeft = container.clientWidth - 128;
      var posX = mountainLeft + (68 / 100) * 120 - 14;
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
