(() => {
  "use strict";

  const views = new Set(["home", "planner", "camera", "system"]);
  const navButtons = [...document.querySelectorAll("[data-view]")];
  const viewElements = [...document.querySelectorAll(".view")];
  const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  let activeView = null;

  document.documentElement.classList.add("motion-ready");

  const CAMERA_FILTERS = {
    natural: { label: "Natural", css: "none" },
    warm: { label: "Warm", css: "sepia(.12) saturate(1.12) contrast(1.02) brightness(1.02)" },
    golden: { label: "Golden", css: "sepia(.2) saturate(1.22) hue-rotate(-7deg) brightness(1.04)" },
    film: { label: "Film", css: "contrast(1.09) saturate(.86) sepia(.08)" },
    soft: { label: "Soft", css: "brightness(1.05) contrast(.94) saturate(.94)" },
    bw: { label: "B&W", css: "grayscale(1) contrast(1.1) brightness(1.02)" },
  };

  const camera = {
    preview: document.getElementById("camera-preview"),
    video: document.getElementById("camera-video"),
    canvas: document.getElementById("camera-capture-canvas"),
    flight: document.getElementById("camera-capture-flight"),
    flash: document.getElementById("camera-flash"),
    idle: document.getElementById("camera-idle"),
    start: document.getElementById("start-camera"),
    take: document.getElementById("take-photo"),
    message: document.getElementById("camera-message"),
    quickTools: document.getElementById("camera-quick-tools"),
    flip: document.getElementById("camera-flip"),
    torch: document.getElementById("camera-torch"),
    controlsToggle: document.getElementById("camera-controls-toggle"),
    advancedControls: document.getElementById("camera-advanced-controls"),
    zoomRow: document.getElementById("camera-zoom-row"),
    zoom: document.getElementById("camera-zoom"),
    zoomValue: document.getElementById("camera-zoom-value"),
    exposureRow: document.getElementById("camera-exposure-row"),
    exposure: document.getElementById("camera-exposure"),
    exposureValue: document.getElementById("camera-exposure-value"),
    gridOverlay: document.getElementById("camera-grid-overlay"),
    countdown: document.getElementById("camera-countdown"),
    gridToggle: document.getElementById("camera-grid-toggle"),
    timerButtons: [...document.querySelectorAll("[data-timer]")],
    filterBar: document.getElementById("camera-filter-bar"),
    filterButtons: [...document.querySelectorAll(".camera-filter")],
    qualityButtons: [...document.querySelectorAll(".camera-quality")],
    filmTrack: document.getElementById("camera-film-track"),
    filmEmpty: document.getElementById("camera-film-empty"),
    quotaLabel: document.getElementById("camera-session-quota"),
    stream: null,
    track: null,
    facingMode: "environment",
    torchOn: false,
    filter: "natural",
    quality: "balanced",
    timer: 0,
    gridOn: false,
    photoLimit: 50,
    photosUsed: 0,
    localTaken: 0,
    frames: [],
    capturing: false,
  };

  function cameraRemaining() {
    return Math.max(0, camera.photoLimit - camera.photosUsed - camera.localTaken);
  }

  function updateCameraQuota() {
    if (!camera.quotaLabel) return;
    camera.quotaLabel.textContent =
      cameraRemaining() + " of " + camera.photoLimit + " memories available";
    if (camera.take) camera.take.disabled = cameraRemaining() <= 0;
  }

  function configureCameraSession(detail = {}) {
    camera.photoLimit = Math.max(1, Number(detail.photoLimit || 50));
    camera.photosUsed = Math.max(0, Number(detail.photosUsed || 0));
    camera.localTaken = 0;
    clearFilm();
    updateCameraQuota();
  }

  function stopStream({ hideControls = true } = {}) {
    if (camera.stream) {
      camera.stream.getTracks().forEach(track => track.stop());
      camera.stream = null;
    }
    camera.track = null;
    camera.torchOn = false;
    if (camera.video) {
      camera.video.pause();
      camera.video.srcObject = null;
      camera.video.hidden = true;
      camera.video.classList.remove("is-selfie");
    }
    if (camera.torch) {
      camera.torch.classList.remove("active");
      camera.torch.hidden = true;
    }
    if (camera.zoomRow) camera.zoomRow.hidden = true;
    if (camera.exposureRow) camera.exposureRow.hidden = true;
    if (hideControls) {
      if (camera.quickTools) camera.quickTools.hidden = true;
      if (camera.filterBar) camera.filterBar.hidden = true;
      if (camera.advancedControls) camera.advancedControls.hidden = true;
      if (camera.controlsToggle) camera.controlsToggle.setAttribute("aria-expanded", "false");
    }
  }

  function clearFilm() {
    for (const frame of camera.frames) {
      if (frame.url) URL.revokeObjectURL(frame.url);
      frame.node?.remove();
    }
    camera.frames = [];
    camera.filmTrack?.querySelectorAll(".camera-film-frame").forEach(node => node.remove());
  }

  function resetCamera() {
    stopStream();
    clearFilm();
    camera.localTaken = 0;
    camera.filter = "natural";
    camera.quality = "balanced";
    camera.timer = 0;
    camera.gridOn = false;
    camera.capturing = false;
    camera.filterButtons.forEach(button =>
      button.classList.toggle("active", button.dataset.filter === "natural")
    );
    camera.qualityButtons.forEach(button =>
      button.classList.toggle("active", button.dataset.quality === "balanced")
    );
    camera.timerButtons.forEach(button =>
      button.classList.toggle("active", button.dataset.timer === "0")
    );
    if (camera.gridToggle) {
      camera.gridToggle.classList.remove("active");
      camera.gridToggle.setAttribute("aria-pressed", "false");
    }
    if (camera.gridOverlay) camera.gridOverlay.hidden = true;
    if (camera.countdown) camera.countdown.hidden = true;
    if (camera.video) camera.video.style.filter = "none";
    if (camera.idle) camera.idle.hidden = false;
    if (camera.start) {
      camera.start.hidden = false;
      camera.start.disabled = false;
    }
    if (camera.take) {
      camera.take.hidden = true;
      camera.take.disabled = false;
    }
    if (camera.flight) {
      camera.flight.hidden = true;
      camera.flight.style.backgroundImage = "";
    }
    if (camera.flash) camera.flash.hidden = true;
    updateCameraQuota();
    if (camera.message) {
      camera.message.textContent =
        "Your invitation has been verified. Open the camera when you're ready.";
    }
  }

  function cameraConstraints() {
    const high = camera.quality === "high";
    return {
      video: {
        facingMode: { ideal: camera.facingMode },
        width: { ideal: high ? 2560 : 1920 },
        height: { ideal: high ? 1440 : 1080 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    };
  }

  function setRangeControl(input, output, capability, current, suffix = "") {
    if (!input || !capability || typeof capability !== "object") return false;
    if (!Number.isFinite(capability.min) || !Number.isFinite(capability.max)) return false;
    input.min = String(capability.min);
    input.max = String(capability.max);
    input.step = String(capability.step || Math.max((capability.max - capability.min) / 40, .01));
    const value = Number.isFinite(current)
      ? Math.min(capability.max, Math.max(capability.min, current))
      : capability.min;
    input.value = String(value);
    if (output) output.textContent = Number(value.toFixed(2)) + suffix;
    return true;
  }

  async function configureTrackCapabilities() {
    const track = camera.track;
    if (!track) return;

    const capabilities = typeof track.getCapabilities === "function"
      ? track.getCapabilities()
      : {};
    const settings = typeof track.getSettings === "function"
      ? track.getSettings()
      : {};

    if (camera.torch) {
      const torchSupported = Boolean(capabilities.torch);
      camera.torch.hidden = !torchSupported;
      camera.torch.disabled = !torchSupported;
    }

    if (camera.zoomRow) {
      camera.zoomRow.hidden = !setRangeControl(
        camera.zoom, camera.zoomValue, capabilities.zoom, settings.zoom, "×"
      );
    }

    if (camera.exposureRow) {
      camera.exposureRow.hidden = !setRangeControl(
        camera.exposure, camera.exposureValue,
        capabilities.exposureCompensation, settings.exposureCompensation, ""
      );
    }

    if (Array.isArray(capabilities.focusMode) &&
        capabilities.focusMode.includes("continuous")) {
      try {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      } catch {}
    }
  }

  async function startCamera({ restarting = false } = {}) {
    stopStream({ hideControls: false });
    camera.message.textContent = restarting
      ? "Switching camera…"
      : "Requesting permission to use your camera…";
    camera.start.disabled = true;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      camera.message.textContent =
        "This browser cannot open a camera here. Use HTTPS on a compatible device.";
      camera.start.disabled = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
      camera.stream = stream;
      camera.track = stream.getVideoTracks()[0] || null;
      camera.video.srcObject = stream;
      camera.video.hidden = false;
      camera.video.classList.toggle("is-selfie", camera.facingMode === "user");
      camera.video.style.filter = CAMERA_FILTERS[camera.filter].css;
      camera.idle.hidden = true;
      await camera.video.play();
      await configureTrackCapabilities();

      camera.message.textContent =
        CAMERA_FILTERS[camera.filter].label + " · " +
        (camera.facingMode === "user" ? "Front camera" : "Back camera");
      camera.start.hidden = true;
      camera.take.hidden = false;
      camera.quickTools.hidden = false;
      camera.filterBar.hidden = false;
      updateCameraQuota();
    } catch (error) {
      stopStream();
      const name = error && error.name;
      camera.message.textContent =
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Camera access was denied. Allow camera permission in your browser settings."
          : name === "NotFoundError"
            ? "No camera was detected on this device."
            : "The camera could not start. Another app may be using it.";
    } finally {
      camera.start.disabled = false;
    }
  }

  async function switchCamera() {
    if (camera.capturing) return;
    camera.facingMode = camera.facingMode === "environment" ? "user" : "environment";
    await startCamera({ restarting: true });
  }

  async function toggleTorch() {
    if (!camera.track || camera.torch.hidden) return;
    camera.torchOn = !camera.torchOn;
    try {
      await camera.track.applyConstraints({ advanced: [{ torch: camera.torchOn }] });
      camera.torch.classList.toggle("active", camera.torchOn);
    } catch {
      camera.torchOn = false;
      camera.torch.classList.remove("active");
      camera.message.textContent = "This phone couldn't switch the camera light.";
    }
  }

  async function applyTrackValue(name, value, output, suffix = "") {
    if (!camera.track) return;
    const number = Number(value);
    try {
      await camera.track.applyConstraints({ advanced: [{ [name]: number }] });
      if (output) output.textContent = Number(number.toFixed(2)) + suffix;
    } catch {
      camera.message.textContent = "That camera control isn't available on this device.";
    }
  }

  function selectFilter(name) {
    if (!CAMERA_FILTERS[name]) return;
    camera.filter = name;
    camera.filterButtons.forEach(button =>
      button.classList.toggle("active", button.dataset.filter === name)
    );
    camera.video.style.filter = CAMERA_FILTERS[name].css;
    if (camera.stream) {
      camera.message.textContent =
        CAMERA_FILTERS[name].label + " · " +
        (camera.facingMode === "user" ? "Front camera" : "Back camera");
    }
  }

  function selectQuality(name) {
    if (!["balanced", "high"].includes(name)) return;
    camera.quality = name;
    camera.qualityButtons.forEach(button =>
      button.classList.toggle("active", button.dataset.quality === name)
    );
  }

  function toggleGrid() {
    camera.gridOn = !camera.gridOn;
    camera.gridToggle?.classList.toggle("active", camera.gridOn);
    camera.gridToggle?.setAttribute("aria-pressed", String(camera.gridOn));
    if (camera.gridOverlay) camera.gridOverlay.hidden = !camera.gridOn;
  }

  function selectTimer(seconds) {
    camera.timer = Math.max(0, Number(seconds) || 0);
    camera.timerButtons.forEach(button =>
      button.classList.toggle("active", Number(button.dataset.timer) === camera.timer)
    );
  }

  async function runCaptureTimer() {
    if (!camera.timer || !camera.countdown) return true;
    camera.countdown.hidden = false;
    for (let remaining = camera.timer; remaining > 0; remaining -= 1) {
      camera.countdown.textContent = String(remaining);
      camera.countdown.classList.remove("tick");
      void camera.countdown.offsetWidth;
      camera.countdown.classList.add("tick");
      navigator.vibrate?.(remaining === 1 ? 45 : 12);
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!camera.stream) {
        camera.countdown.hidden = true;
        return false;
      }
    }
    camera.countdown.hidden = true;
    return true;
  }

  function flashCamera() {
    if (!camera.flash) return;
    camera.flash.hidden = false;
    camera.flash.classList.remove("fire");
    void camera.flash.offsetWidth;
    camera.flash.classList.add("fire");
    camera.flash.addEventListener("animationend", () => {
      camera.flash.hidden = true;
      camera.flash.classList.remove("fire");
    }, { once: true });
  }

  async function thumbnailFromCanvas(source) {
    const thumb = document.createElement("canvas");
    const targetW = 90;
    const targetH = 116;
    thumb.width = targetW;
    thumb.height = targetH;
    const context = thumb.getContext("2d");
    if (!context) return null;

    const sourceRatio = source.width / source.height;
    const targetRatio = targetW / targetH;
    let sx = 0, sy = 0, sw = source.width, sh = source.height;
    if (sourceRatio > targetRatio) {
      sw = source.height * targetRatio;
      sx = (source.width - sw) / 2;
    } else {
      sh = source.width / targetRatio;
      sy = (source.height - sh) / 2;
    }
    context.drawImage(source, sx, sy, sw, sh, 0, 0, targetW, targetH);
    const blob = await new Promise(resolve => thumb.toBlob(resolve, "image/jpeg", .68));
    return blob ? URL.createObjectURL(blob) : null;
  }

  function animateFilmAdvance(existing) {
    requestAnimationFrame(() => {
      existing.forEach(({ node, left }) => {
        if (!node.isConnected) return;
        const dx = left - node.getBoundingClientRect().left;
        if (Math.abs(dx) < 1 || typeof node.animate !== "function") return;
        node.animate(
          [{ transform: "translateX(" + dx + "px)" }, { transform: "translateX(0)" }],
          { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" }
        );
      });
    });
  }

  function addFilmFrame(url) {
    if (!url || !camera.filmTrack || !camera.filmEmpty) return;
    const existingNodes = [...camera.filmTrack.querySelectorAll(".camera-film-frame")];
    const existing = existingNodes.map(node => ({
      node,
      left: node.getBoundingClientRect().left,
    }));

    const frame = document.createElement("div");
    frame.className = "camera-film-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.style.backgroundImage = 'url("' + url + '")';
    const number = document.createElement("span");
    number.textContent = String(camera.photosUsed + camera.localTaken).padStart(2, "0");
    frame.appendChild(number);
    camera.filmTrack.insertBefore(frame, camera.filmEmpty);
    camera.frames.push({ url, node: frame });

    animateFilmAdvance(existing);
    frame.classList.add("is-new");
    frame.addEventListener("animationend", () => frame.classList.remove("is-new"), { once: true });

    const maxVisible = window.innerWidth < 480 ? 3 : 4;
    while (camera.frames.length > maxVisible) {
      const old = camera.frames.shift();
      if (!old) break;
      old.node?.classList.add("is-leaving");
      setTimeout(() => {
        old.node?.remove();
        if (old.url) URL.revokeObjectURL(old.url);
      }, 280);
    }

    camera.filmEmpty.classList.remove("pulse");
    void camera.filmEmpty.offsetWidth;
    camera.filmEmpty.classList.add("pulse");
  }

  async function animateCaptureToFilm(thumbnailUrl) {
    if (!thumbnailUrl || !camera.flight || !camera.filmEmpty || !camera.preview) {
      addFilmFrame(thumbnailUrl);
      return;
    }

    const source = camera.preview.getBoundingClientRect();
    const target = camera.filmEmpty.getBoundingClientRect();
    const startW = Math.min(150, source.width * .34);
    const startH = startW * 1.28;
    const startX = source.left + source.width / 2 - startW / 2;
    const startY = source.top + source.height / 2 - startH / 2;

    camera.flight.style.backgroundImage = 'url("' + thumbnailUrl + '")';
    camera.flight.hidden = false;

    if (typeof camera.flight.animate === "function") {
      const animation = camera.flight.animate([
        {
          left: startX + "px", top: startY + "px",
          width: startW + "px", height: startH + "px",
          opacity: 1, transform: "rotate(-2deg) scale(1)"
        },
        {
          left: target.left + "px", top: target.top + "px",
          width: target.width + "px", height: target.height + "px",
          opacity: .9, transform: "rotate(1deg) scale(.96)"
        }
      ], {
        duration: 540,
        easing: "cubic-bezier(.18,.82,.22,1)",
        fill: "forwards"
      });
      try { await animation.finished; } catch {}
      animation.cancel();
    }

    camera.flight.hidden = true;
    camera.flight.style.backgroundImage = "";
    addFilmFrame(thumbnailUrl);
  }

  async function capturePhoto() {
    const video = camera.video;
    if (camera.capturing || !camera.stream || !video.videoWidth || !video.videoHeight) {
      return;
    }
    if (cameraRemaining() <= 0) {
      camera.message.textContent = "This invitation's 50-photo film roll is full.";
      camera.take.disabled = true;
      return;
    }

    camera.capturing = true;
    camera.take.disabled = true;

    if (camera.timer > 0) {
      const timerFinished = await runCaptureTimer();
      if (!timerFinished) {
        camera.capturing = false;
        camera.take.disabled = cameraRemaining() <= 0;
        return;
      }
    }

    flashCamera();
    navigator.vibrate?.(18);

    try {
      const maxWidth = camera.quality === "high" ? 2400 : 1600;
      const factor = Math.min(1, maxWidth / video.videoWidth);
      const canvas = camera.canvas;
      canvas.width = Math.max(1, Math.round(video.videoWidth * factor));
      canvas.height = Math.max(1, Math.round(video.videoHeight * factor));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");

      context.save();
      context.filter = CAMERA_FILTERS[camera.filter].css;
      if (camera.facingMode === "user") {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      context.restore();

      const quality = camera.quality === "high" ? .92 : .86;
      const photo = await new Promise(resolve =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
      if (!photo) throw new Error("Photo capture failed");

      const thumbnailUrl = await thumbnailFromCanvas(canvas);
      camera.localTaken += 1;
      updateCameraQuota();

      await animateCaptureToFilm(thumbnailUrl);
      camera.message.textContent =
        "Moment sealed · " + cameraRemaining() + " frames left on this invitation";

      document.dispatchEvent(new CustomEvent("wedding:photo-captured", {
        detail: {
          blob: photo,
          filter: camera.filter,
          quality: camera.quality,
          facingMode: camera.facingMode,
          localSequence: camera.localTaken,
        }
      }));
    } catch (error) {
      camera.message.textContent = "That photo couldn't be captured. Please try again.";
      console.error("Wedding camera capture failed:", error);
    } finally {
      camera.capturing = false;
      camera.take.disabled = cameraRemaining() <= 0;
    }
  }

  camera.start?.addEventListener("click", () => startCamera());
  camera.take?.addEventListener("click", capturePhoto);
  camera.flip?.addEventListener("click", switchCamera);
  camera.torch?.addEventListener("click", toggleTorch);
  camera.controlsToggle?.addEventListener("click", () => {
    const open = camera.controlsToggle.getAttribute("aria-expanded") === "true";
    camera.controlsToggle.setAttribute("aria-expanded", String(!open));
    camera.advancedControls.hidden = open;
  });
  camera.zoom?.addEventListener("input", event =>
    applyTrackValue("zoom", event.target.value, camera.zoomValue, "×")
  );
  camera.exposure?.addEventListener("input", event =>
    applyTrackValue("exposureCompensation", event.target.value, camera.exposureValue)
  );
  camera.filterButtons.forEach(button =>
    button.addEventListener("click", () => selectFilter(button.dataset.filter))
  );
  camera.qualityButtons.forEach(button =>
    button.addEventListener("click", () => selectQuality(button.dataset.quality))
  );
  camera.gridToggle?.addEventListener("click", toggleGrid);
  camera.timerButtons.forEach(button =>
    button.addEventListener("click", () => selectTimer(button.dataset.timer))
  );

  const revealObserver = motionOK && "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" })
    : null;

  function registerReveals(scope = document) {
    const selectors = [
      ".section-heading", ".hero-copy > *", ".facts .fact", ".intro-strip > *",
      ".invitation-access", ".guest-rsvp-card", ".camera-shell", ".capsule-info > *",
      ".system-node", ".system-details > div", ".project-state", ".planner-access-gate"
    ];
    const nodes = [...scope.querySelectorAll(selectors.join(","))];
    nodes.forEach((node, index) => {
      if (node.dataset.revealReady) return;
      node.dataset.revealReady = "1";
      node.classList.add("reveal");
      node.style.setProperty("--reveal-delay", Math.min(index % 7, 6) * 55 + "ms");
      if (revealObserver) revealObserver.observe(node);
      else node.classList.add("is-revealed");
    });
  }

  function createAmbience() {
    const ambient = document.createElement("div");
    ambient.className = "ambient-layer";
    ambient.setAttribute("aria-hidden", "true");
    const glow = document.createElement("i");
    glow.className = "pointer-glow";
    ambient.appendChild(glow);
    const progress = document.createElement("i");
    progress.className = "experience-progress";
    document.body.appendChild(progress);
    const updateProgress = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      progress.style.setProperty("--scroll", Math.min(1, Math.max(0, scrollY / max)));
    };
    updateProgress();
    addEventListener("scroll", updateProgress, { passive: true });

    if (motionOK) {
      for (let i = 0; i < 24; i++) {
        const petal = document.createElement("span");
        petal.className = "ambient-petal";
        petal.style.setProperty("--x", (2 + Math.random() * 96).toFixed(1) + "%");
        petal.style.setProperty("--delay", (-Math.random() * 22).toFixed(2) + "s");
        petal.style.setProperty("--duration", (14 + Math.random() * 16).toFixed(2) + "s");
        petal.style.setProperty("--drift", ((Math.random() - .5) * 220).toFixed(0) + "px");
        petal.style.setProperty("--scale", (.35 + Math.random() * 1.0).toFixed(2));
        petal.style.setProperty("--blur", (Math.random() * 1.8).toFixed(1) + "px");
        ambient.appendChild(petal);
      }

      for (let i = 0; i < 9; i++) {
        const heart = document.createElement("span");
        heart.className = "ambient-heart";
        heart.textContent = "♥";
        heart.style.setProperty("--hx", (4 + Math.random() * 92).toFixed(1) + "%");
        heart.style.setProperty("--hy", (7 + Math.random() * 82).toFixed(1) + "%");
        heart.style.setProperty("--hsize", (28 + Math.random() * 88).toFixed(0) + "px");
        heart.style.setProperty("--hblur", (5 + Math.random() * 12).toFixed(0) + "px");
        heart.style.setProperty("--hopacity", (.025 + Math.random() * .055).toFixed(3));
        heart.style.setProperty("--hdelay", (-Math.random() * 14).toFixed(2) + "s");
        ambient.appendChild(heart);
      }
    }
    document.body.appendChild(ambient);

    if (finePointer) {
      window.addEventListener("pointermove", event => {
        glow.style.setProperty("--gx", event.clientX + "px");
        glow.style.setProperty("--gy", event.clientY + "px");
      }, { passive: true });
    }
  }

  function setupHomeMusic() {
    const button = document.getElementById("home-music-toggle");
    const player = document.getElementById("home-music-player");
    if (!button || !player) return;

    const closePlayer = () => {
      player.replaceChildren();
      player.hidden = true;
      button.setAttribute("aria-expanded", "false");
      button.classList.remove("is-playing");
      const label = button.querySelector(".music-orb-label");
      if (label) label.textContent = "Play our song";
    };

    const openPlayer = () => {
      const iframe = document.createElement("iframe");
      iframe.title = "I Like You So Much, You'll Know It — Ysabelle Cuevas (official)";
      iframe.src = "https://www.youtube-nocookie.com/embed/oVyDjvq0SHY?autoplay=1&rel=0&modestbranding=1&playsinline=1";
      iframe.width = "100%";
      iframe.height = "315";
      iframe.loading = "lazy";
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen; picture-in-picture");
      iframe.setAttribute("allowfullscreen", "");
      player.replaceChildren(iframe);
      player.hidden = false;
      button.setAttribute("aria-expanded", "true");
      button.classList.add("is-playing");
      const label = button.querySelector(".music-orb-label");
      if (label) label.textContent = "Hide player";
      player.scrollIntoView({ behavior: motionOK ? "smooth" : "auto", block: "nearest" });
    };

    button.addEventListener("click", () => {
      if (button.getAttribute("aria-expanded") === "true") closePlayer();
      else openPlayer();
    });

    return closePlayer;
  }

  function setupDeviceTilt() {
    const button = document.getElementById("motion-toggle");
    const supported = motionOK && window.isSecureContext &&
      typeof window.DeviceOrientationEvent !== "undefined";
    const mobileLike = window.matchMedia("(pointer: coarse)").matches ||
      navigator.maxTouchPoints > 0;

    if (!button || !supported || !mobileLike) return;

    button.hidden = false;
    button.classList.add("is-supported");

    let baseBeta = null;
    let baseGamma = null;
    let smoothX = 0;
    let smoothY = 0;
    let frame = 0;
    let enabled = false;
    let lastBurst = 0;

    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

    function resetBaseline() {
      baseBeta = null;
      baseGamma = null;
      smoothX = 0;
      smoothY = 0;
    }

    function burst(direction) {
      const now = performance.now();
      if (now - lastBurst < 1800 || document.body.dataset.activeView !== "home") return;
      lastBurst = now;

      const layer = document.querySelector(".ambient-layer");
      if (!layer) return;

      for (let i = 0; i < 6; i++) {
        const spark = document.createElement("span");
        spark.className = "tilt-spark";
        spark.textContent = i % 3 === 0 ? "✦" : "♥";
        spark.style.setProperty("--spark-side", direction > 0 ? "88%" : "12%");
        spark.style.setProperty("--spark-y", (30 + Math.random() * 45).toFixed(0) + "%");
        spark.style.setProperty("--spark-x", ((Math.random() - .5) * 90).toFixed(0) + "px");
        spark.style.setProperty("--spark-rise", (-55 - Math.random() * 110).toFixed(0) + "px");
        spark.style.setProperty("--spark-delay", (Math.random() * .18).toFixed(2) + "s");
        layer.appendChild(spark);
        spark.addEventListener("animationend", () => spark.remove(), { once: true });
      }
    }

    function paintTilt(x, y) {
      const root = document.documentElement;
      root.style.setProperty("--device-x", x.toFixed(3));
      root.style.setProperty("--device-y", y.toFixed(3));
      root.style.setProperty("--phone-photo-transform",
        "translate3d(" + (x*24).toFixed(1) + "px," + (y*17).toFixed(1) + "px,36px) " +
        "rotate(" + (-11+x*3).toFixed(2) + "deg) rotateX(" + (y*-4).toFixed(2) +
        "deg) rotateY(" + (x*5).toFixed(2) + "deg)");
      root.style.setProperty("--phone-seal-transform",
        "translate3d(" + (x*-19).toFixed(1) + "px," + (y*-13).toFixed(1) + "px,46px) " +
        "rotate(" + (12-x*4).toFixed(2) + "deg)");
      root.style.setProperty("--phone-flower-one-transform",
        "translate3d(" + (x*-13).toFixed(1) + "px," + (y*-10).toFixed(1) + "px,18px) rotate(20deg)");
      root.style.setProperty("--phone-flower-two-transform",
        "translate3d(" + (x*15).toFixed(1) + "px," + (y*10).toFixed(1) + "px,18px) rotate(-25deg)");
      root.style.setProperty("--phone-script-transform",
        "translate3d(" + (x*11).toFixed(1) + "px," + (y*8).toFixed(1) + "px,22px) rotate(-10deg)");
      root.style.setProperty("--phone-light-transform",
        "translate3d(" + (x*18).toFixed(1) + "px," + (y*14).toFixed(1) + "px,0)");
      root.style.setProperty("--phone-heart-translate",
        (x*-24).toFixed(1) + "px " + (y*-18).toFixed(1) + "px");
      root.style.setProperty("--phone-petal-margin", (x*13).toFixed(1) + "px");
      root.style.setProperty("--phone-music-transform",
        "perspective(900px) rotateY(" + (x*1.8).toFixed(2) + "deg) rotateX(" +
        (y*-1.3).toFixed(2) + "deg)");

      document.body.classList.toggle("phone-tilting", Math.abs(x) + Math.abs(y) > .12);
      if (Math.abs(x) > .76) burst(x);
    }

    function onOrientation(event) {
      if (!enabled || document.body.dataset.activeView !== "home") return;
      if (typeof event.beta !== "number" || typeof event.gamma !== "number") return;

      if (baseBeta === null || baseGamma === null) {
        baseBeta = event.beta;
        baseGamma = event.gamma;
        return;
      }

      const angle = Number(screen.orientation?.angle || window.orientation || 0);
      let rawX;
      let rawY;

      if (Math.abs(angle) === 90 || Math.abs(angle) === 270) {
        const direction = angle === 90 || angle === -270 ? 1 : -1;
        rawX = direction * (event.beta - baseBeta) / 26;
        rawY = -direction * (event.gamma - baseGamma) / 23;
      } else {
        rawX = (event.gamma - baseGamma) / 23;
        rawY = (event.beta - baseBeta) / 28;
      }

      const targetX = clamp(rawX, -1, 1);
      const targetY = clamp(rawY, -1, 1);
      smoothX += (targetX - smoothX) * .16;
      smoothY += (targetY - smoothY) * .16;

      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          paintTilt(smoothX, smoothY);
        });
      }
    }

    async function enableTilt() {
      button.disabled = true;
      const label = button.querySelector("strong");
      const sub = button.querySelector("small");
      if (label) label.textContent = "Requesting motion…";

      try {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission !== "granted") throw new Error("Motion permission was not granted.");
        }

        enabled = true;
        resetBaseline();
        window.addEventListener("deviceorientation", onOrientation, { passive: true });
        window.addEventListener("orientationchange", resetBaseline, { passive: true });
        button.setAttribute("aria-pressed", "true");
        button.classList.add("is-on");
        if (label) label.textContent = "Tilt magic is on";
        if (sub) sub.textContent = "Gently move your phone";
      } catch (error) {
        enabled = false;
        button.setAttribute("aria-pressed", "false");
        if (label) label.textContent = "Enable tilt magic";
        if (sub) sub.textContent = "Motion access was not enabled";
        console.info("Device orientation unavailable:", error);
      } finally {
        button.disabled = false;
      }
    }

    button.addEventListener("click", () => {
      if (!enabled) {
        enableTilt();
        return;
      }
      enabled = false;
      window.removeEventListener("deviceorientation", onOrientation);
      resetBaseline();
      paintTilt(0, 0);
      button.setAttribute("aria-pressed", "false");
      button.classList.remove("is-on");
      const label = button.querySelector("strong");
      const sub = button.querySelector("small");
      if (label) label.textContent = "Enable tilt magic";
      if (sub) sub.textContent = "Move your phone to animate the page";
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && enabled) paintTilt(0, 0);
    });
  }

  function setupHeroParallax() {
    const art = document.querySelector(".hero-art");
    if (!art || !finePointer || !motionOK) return;
    art.addEventListener("pointermove", event => {
      const r = art.getBoundingClientRect();
      const x = (event.clientX - r.left) / r.width - .5;
      const y = (event.clientY - r.top) / r.height - .5;
      art.style.setProperty("--hero-x", x.toFixed(3));
      art.style.setProperty("--hero-y", y.toFixed(3));
    });
    art.addEventListener("pointerleave", () => {
      art.style.setProperty("--hero-x", "0");
      art.style.setProperty("--hero-y", "0");
    });
  }

  function setupTilt() {
    if (!finePointer || !motionOK) return;
    const selector = [
      ".fact", ".system-node", ".camera-shell", ".invitation-access",
      ".planner-metric", ".planner-card", ".project-state"
    ].join(",");
    document.querySelectorAll(selector).forEach(card => {
      if (card.dataset.tiltReady) return;
      card.dataset.tiltReady = "1";
      card.classList.add("tilt-card");
      card.addEventListener("pointermove", event => {
        const r = card.getBoundingClientRect();
        const dx = (event.clientX - r.left) / r.width - .5;
        const dy = (event.clientY - r.top) / r.height - .5;
        card.style.setProperty("--tilt-y", (dx * 4.5).toFixed(2) + "deg");
        card.style.setProperty("--tilt-x", (-dy * 4.5).toFixed(2) + "deg");
        card.style.setProperty("--shine-x", ((dx + .5) * 100).toFixed(0) + "%");
        card.style.setProperty("--shine-y", ((dy + .5) * 100).toFixed(0) + "%");
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      });
    });
  }

  function setupMagneticButtons() {
    if (!finePointer || !motionOK) return;
    document.querySelectorAll(".button,.text-link,.main-nav button").forEach(button => {
      if (button.dataset.magneticReady) return;
      button.dataset.magneticReady = "1";
      button.classList.add("magnetic");
      button.addEventListener("pointermove", event => {
        if (button.disabled) return;
        const r = button.getBoundingClientRect();
        const x = (event.clientX - (r.left + r.width / 2)) * .11;
        const y = (event.clientY - (r.top + r.height / 2)) * .16;
        button.style.setProperty("--mag-x", x.toFixed(1) + "px");
        button.style.setProperty("--mag-y", y.toFixed(1) + "px");
      });
      button.addEventListener("pointerleave", () => {
        button.style.setProperty("--mag-x", "0px");
        button.style.setProperty("--mag-y", "0px");
      });
    });
  }

  function setupRipples() {
    document.addEventListener("pointerdown", event => {
      const target = event.target.closest(".button,.planner-nav,.main-nav button,.invitation-row");
      if (!target || target.disabled) return;
      const r = target.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "tap-ripple";
      ripple.style.left = event.clientX - r.left + "px";
      ripple.style.top = event.clientY - r.top + "px";
      target.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    });
  }

  function setupSealSurprise() {
    const seal = document.querySelector(".art-seal");
    if (!seal) return;
    seal.setAttribute("role", "button");
    seal.setAttribute("tabindex", "0");
    seal.setAttribute("aria-label", "Send a little love");
    const celebrate = () => {
      seal.classList.remove("seal-pop");
      void seal.offsetWidth;
      seal.classList.add("seal-pop");
      for (let i = 0; i < 9; i++) {
        const heart = document.createElement("span");
        heart.className = "floating-heart";
        heart.textContent = i % 3 === 0 ? "✦" : "♥";
        heart.style.setProperty("--hx", ((Math.random() - .5) * 160).toFixed(0) + "px");
        heart.style.setProperty("--hy", (-70 - Math.random() * 110).toFixed(0) + "px");
        heart.style.left = "50%";
        heart.style.top = "50%";
        seal.appendChild(heart);
        heart.addEventListener("animationend", () => heart.remove(), { once: true });
      }
    };
    seal.addEventListener("click", celebrate);
    seal.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        celebrate();
      }
    });
  }

  function setupHeaderScroll() {
    const apply = () => document.body.classList.toggle("page-scrolled", window.scrollY > 26);
    apply();
    window.addEventListener("scroll", apply, { passive: true });
  }

  function refreshInteractions(scope = document) {
    registerReveals(scope);
    setupTilt();
    setupMagneticButtons();
  }

  function applyView(view) {
    document.body.dataset.activeView = view;
    if (view !== "home" && typeof closeHomeMusic === "function") closeHomeMusic();
    if (view !== "camera") {
      document.dispatchEvent(new CustomEvent("wedding:camera-exit-request"));
    }

    viewElements.forEach(section => {
      const active = section.id === "view-" + view;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
    });
    navButtons.forEach(button => {
      if (button.dataset.view === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (view !== "camera") resetCamera();

    const title = view === "home" ? "Angela & Joseph" :
      view === "planner" ? "Planning Studio" :
      view === "camera" ? "Photo Time Capsule" : "Project Blueprint";
    document.title = title + " | Wedding";
    window.scrollTo(0, 0);

    const activeSection = document.getElementById("view-" + view);
    if (activeSection) {
      activeSection.querySelectorAll(".reveal").forEach(node => {
        if (!node.classList.contains("is-revealed") && revealObserver) revealObserver.observe(node);
      });
      requestAnimationFrame(() => refreshInteractions(activeSection));
    }
  }

  function switchView(next) {
    const requested = next.startsWith("camera/") ? "camera" : next;
    const view = views.has(requested) ? requested : "home";

    if (activeView !== null && view !== activeView && motionOK && document.startViewTransition) {
      document.startViewTransition(() => applyView(view));
    } else {
      applyView(view);
    }
    activeView = view;
  }

  function navigate(view) {
    if (!views.has(view)) view = "home";
    if (location.hash === "#" + view) switchView(view);
    else location.hash = "#" + view;
  }

  function countdown() {
    const weddingDate = new Date("2027-02-23T00:00:00+08:00");
    const diff = weddingDate.getTime() - Date.now();
    const el = document.getElementById("countdown");
    if (!el) return;
    if (diff <= 0) {
      el.textContent = "Our day is here";
    } else {
      const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
      el.textContent = days + " day" + (days === 1 ? "" : "s") + " to go";
    }
  }

  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.go));
  });

  window.addEventListener("hashchange", () => switchView(location.hash.slice(1)));
  window.addEventListener("pagehide", stopStream);
  document.addEventListener("wedding:camera-mode", event => {
    if (!event.detail?.active) {
      resetCamera();
      return;
    }
    configureCameraSession(event.detail);
  });

  const plannerWorkspace = document.getElementById("planner-workspace");
  if (plannerWorkspace && "MutationObserver" in window) {
    new MutationObserver(() => requestAnimationFrame(() => refreshInteractions(plannerWorkspace)))
      .observe(plannerWorkspace, { childList: true, subtree: true });
  }

  createAmbience();
  const closeHomeMusic = setupHomeMusic();
  setupHeroParallax();
  setupDeviceTilt();
  setupSealSurprise();
  setupHeaderScroll();
  setupRipples();
  refreshInteractions();

  // The camera is still a local device demonstration until the protected
  // invitation + Google Drive upload backend is deployed.
  countdown();
  setInterval(countdown, 60 * 1000);
  switchView(location.hash.slice(1));
})();