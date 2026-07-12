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
    run: char.querySelector(".frame-run"),
    jump: char.querySelector(".frame-jump"),
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
  var runSpeed = 0.55; // percentage progress per frame (calibrated for a nice running pace)
  var climbSpeed = 0.65; // pixels per frame
  var jumpHeight = 22; // max jump height in pixels

  // State variables
  var progress = 0; // 0 to 100% of the running track
  var climbY = 0; // pixels climbed (up to 72px)
  var celebrateTime = 0; // tick counter for celebration
  var state = "run"; // 'run', 'jump', 'climb', 'celebrate', 'wait'
  var jumpStartProgress = 0;
  
  // Track geometry (relative to container size)
  var startX = 0; 
  var endX = 0; 
  
  function getEndX() {
    // 64px offset aligns the center of the 28px character with the mountain rope
    return container.clientWidth - 64; 
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

      // Check jumping over rocks
      // Rock 1 at 30% progress
      if (state === "run" && progress >= 26 && progress <= 34) {
        state = "jump";
        jumpStartProgress = 26;
        setFrame("jump");
      }
      // Rock 2 at 65% progress
      if (state === "run" && progress >= 61 && progress <= 69) {
        state = "jump";
        jumpStartProgress = 61;
        setFrame("jump");
      }

      // Calculate coordinates
      var posX = (progress / 100) * endX;
      var posY = 0;

      if (state === "jump") {
        // Simple parabolic arc: y = -sin(progress) * height
        var jumpProgress = (progress - jumpStartProgress) / 8; // jump duration is 8% progress
        if (jumpProgress >= 1.0) {
          state = "run";
          setFrame("run");
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
      if (climbY >= 72) { // height of the mountain peak rope
        climbY = 72;
        state = "celebrate";
        setFrame("celebrate");
        celebrateTime = 0;
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

      if (celebrateTime >= 150) { // celebrate for about 2.5 seconds
        state = "wait";
        char.style.opacity = "0";
        setTimeout(function() {
          // Reset all variables to start over
          progress = 0;
          climbY = 0;
          celebrateTime = 0;
          state = "run";
          setFrame("run");
        }, 1500); // wait 1.5s before repeating
      }
    }

    requestAnimationFrame(tick);
  }

  // Start the animation
  setTimeout(function() {
    tick();
  }, 1200); // Start 1.2s after load
});
