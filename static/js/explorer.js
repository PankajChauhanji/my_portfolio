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
    fall: char.querySelector(".frame-fall"),
    climb: char.querySelector(".frame-climb"),
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
  var runSpeed = 0.09; // Reduced by 20% for slower run
  var climbSpeed = 0.13; // Reduced by 20% for slower climb
  var fallSpeed = 0.95; // Reduced by 20% for slower fall
  var jumpHeight = 22; // Max jump height in pixels

  // State variables
  var progress = 0; // 0 to 100% of the running track
  var climbY = 0; // pixels climbed (up to 72px)
  var celebrateTime = 0; // tick counter for celebration
  var state = "run"; // 'run', 'jump', 'climb', 'fall', 'wait_after_fall', 'celebrate', 'wait'
  var jumpStartProgress = 0;
  var hasFallen = false; // flag to only slip once per climb
  var runFrameToggle = 0; // counter to cycle leg movements
  
  // Track geometry (relative to container size)
  var endX = 0; 
  
  function getEndX() {
    // 53px offset aligns the center of the 28px character with the rope peak at x=68
    return container.clientWidth - 53; 
  }

  function tick() {
    endX = getEndX();

    if (state === "run" || state === "jump") {
      progress += runSpeed;
      if (progress >= 100) {
        progress = 100;
        state = "climb";
        setFrame("climb");
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
      if (!hasFallen && climbY >= 35) {
        state = "fall";
        setFrame("fall");
      } else if (climbY >= 72) { // Reached the peak
        climbY = 72;
        state = "celebrate";
        setFrame("celebrate");
        celebrateTime = 0;
      }
      
      var posX = endX;
      var posY = -climbY;
      char.style.transform = "translate3d(" + posX + "px, " + posY + "px, 0)";

    } else if (state === "fall") {
      climbY -= fallSpeed; // falling speed
      if (climbY <= 0) {
        climbY = 0;
        state = "wait_after_fall";
        setFrame("run1");
        setTimeout(function() {
          state = "climb";
          setFrame("climb");
          hasFallen = true; // climb successfully next time
        }, 750); // Pause for 750ms on the ground before trying again
      }
      var posX = endX;
      var posY = -climbY;
      char.style.transform = "translate3d(" + posX + "px, " + posY + "px, 0)";

    } else if (state === "celebrate") {
      celebrateTime += 1;
      // Celebrate jump animation (up and down)
      var jumpOffset = -Math.abs(Math.sin(celebrateTime * 0.12)) * 12;
      var posX = endX;
      var posY = -72 + jumpOffset;
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
