(() => {
  "use strict";

  const BUILD = "20261101-camera2";
  const assetBase = new URL("./assets/", location.href);
  const loaderEl = document.getElementById("global-loader");
  const loaderTitle = document.getElementById("global-loader-title");
  const loaderDetail = document.getElementById("global-loader-detail");
  const loaderTasks = new Map();
  let loaderSequence = 0;

  function renderLoader() {
    if (!loaderEl) return;
    const tasks = [...loaderTasks.values()].filter(task => task.visible);
    if (!tasks.length) {
      loaderEl.hidden = true;
      document.body.classList.remove("global-loading-blocking");
      return;
    }
    const latest = tasks[tasks.length - 1];
    loaderEl.hidden = false;
    if (loaderTitle) loaderTitle.textContent = latest.title || "Working on it…";
    if (loaderDetail) loaderDetail.textContent = latest.detail || "Just a moment.";
    document.body.classList.toggle(
      "global-loading-blocking",
      tasks.some(task => task.blocking)
    );
  }

  const WeddingUI = {
    begin(title, detail = "", options = {}) {
      const token = ++loaderSequence;
      const task = {
        title, detail,
        blocking: options.blocking !== false,
        visible: false,
        timer: null,
      };
      loaderTasks.set(token, task);
      const delay = Number.isFinite(options.delay) ? options.delay : 140;
      task.timer = setTimeout(() => {
        if (!loaderTasks.has(token)) return;
        task.visible = true;
        renderLoader();
      }, Math.max(0, delay));
      return token;
    },
    update(token, title, detail = "") {
      const task = loaderTasks.get(token);
      if (!task) return;
      if (title) task.title = title;
      if (detail !== undefined) task.detail = detail;
      renderLoader();
    },
    end(token) {
      const task = loaderTasks.get(token);
      if (!task) return;
      clearTimeout(task.timer);
      loaderTasks.delete(token);
      renderLoader();
    },
    async run(work, title, detail = "", options = {}) {
      const token = this.begin(title, detail, options);
      try {
        return await (typeof work === "function" ? work() : work);
      } finally {
        this.end(token);
      }
    },
  };
  window.WeddingUI = WeddingUI;

  const featureModules = new Map();
  function featureUrl(file) {
    return new URL(file + "?v=" + BUILD, assetBase).href;
  }
  async function ensureViewModule(view) {
    const files = {
      planner: "planner.js",
      camera: "guest-camera.js",
      system: "firebase-init.js",
    };
    const file = files[view];
    if (!file) return;
    if (!featureModules.has(view)) {
      const copy = {
        planner: ["Opening Wedding Studio…", "Loading secure organizer tools."],
        camera: ["Preparing Wedding Camera…", "Loading invitation access and camera tools."],
        system: ["Checking project services…", "Loading Firebase configuration status."],
      }[view];
      const token = WeddingUI.begin(copy[0], copy[1], {
        blocking: view !== "system",
        delay: 120,
      });
      const promise = import(featureUrl(file))
        .catch(error => {
          featureModules.delete(view);
          throw error;
        })
        .finally(() => WeddingUI.end(token));
      featureModules.set(view, promise);
    }
    return featureModules.get(view);
  }

  const views = new Set(["home", "planner", "camera", "system"]);
  const navButtons = [...document.querySelectorAll("[data-view]")];
  const viewElements = [...document.querySelectorAll(".view")];
  const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const viewTransitionsOK = motionOK && finePointer;
  let activeView = null;

  document.documentElement.classList.add("motion-ready");

  const CAMERA_FILTERS = {
    natural: { label:"Natural", group:"Essentials", css:"none", swatch:"linear-gradient(135deg,#d8ccb8,#6b756d)" },
    glow: { label:"Glow", group:"Portrait", css:"brightness(1.08) contrast(.93) saturate(1.04)", swatch:"linear-gradient(135deg,#fff2df,#d7b2a7)" },
    rose: { label:"Rosé", group:"Portrait", css:"sepia(.10) saturate(1.12) hue-rotate(335deg) brightness(1.04)", swatch:"linear-gradient(135deg,#f3d5d1,#b77b82)" },
    soft: { label:"Soft", group:"Portrait", css:"brightness(1.06) contrast(.91) saturate(.95)", swatch:"linear-gradient(135deg,#f4eee7,#bfc5bd)" },
    warm: { label:"Warm", group:"Warm", css:"sepia(.13) saturate(1.13) contrast(1.02) brightness(1.02)", swatch:"linear-gradient(135deg,#e3c08d,#9d6651)" },
    golden: { label:"Golden Hour", group:"Warm", css:"sepia(.22) saturate(1.28) hue-rotate(-8deg) brightness(1.05)", swatch:"linear-gradient(135deg,#f0cf78,#ad6843)" },
    cocoa: { label:"Cocoa", group:"Warm", css:"sepia(.25) saturate(.88) contrast(1.05) brightness(.98)", swatch:"linear-gradient(135deg,#c49a74,#5a4035)" },
    sunset: { label:"Sunset", group:"Warm", css:"sepia(.16) saturate(1.35) hue-rotate(-16deg) contrast(1.04)", swatch:"linear-gradient(135deg,#f7a36e,#a94962)" },
    cinema: { label:"Cinema", group:"Cinematic", css:"contrast(1.13) saturate(.82) brightness(.96)", swatch:"linear-gradient(135deg,#354b4d,#c8aa7a)" },
    teal: { label:"Teal & Gold", group:"Cinematic", css:"saturate(1.12) contrast(1.08) hue-rotate(8deg) sepia(.05)", swatch:"linear-gradient(135deg,#2c7270,#d99c54)" },
    moody: { label:"Moody", group:"Cinematic", css:"brightness(.88) contrast(1.16) saturate(.82)", swatch:"linear-gradient(135deg,#48504f,#181b1a)" },
    night: { label:"Night Pop", group:"Cinematic", css:"brightness(1.05) contrast(1.18) saturate(1.25) hue-rotate(5deg)", swatch:"linear-gradient(135deg,#19274f,#9f4ca4)" },
    film: { label:"Film", group:"Vintage", css:"contrast(1.08) saturate(.83) sepia(.10) brightness(1.01)", swatch:"linear-gradient(135deg,#bca27e,#6d715f)" },
    disposable: { label:"Disposable", group:"Vintage", css:"contrast(1.16) saturate(1.08) sepia(.08) brightness(1.04)", swatch:"linear-gradient(135deg,#d8bb69,#4d6b63)" },
    retro98: { label:"Retro '98", group:"Vintage", css:"sepia(.18) saturate(.76) contrast(1.09) brightness(1.03)", swatch:"linear-gradient(135deg,#d6b18a,#766356)" },
    fade: { label:"Fade", group:"Vintage", css:"contrast(.88) saturate(.78) brightness(1.08) sepia(.06)", swatch:"linear-gradient(135deg,#ded7c9,#8c8e84)" },
    seoul: { label:"Seoul", group:"Cool", css:"brightness(1.06) saturate(.95) hue-rotate(9deg) contrast(.97)", swatch:"linear-gradient(135deg,#dbe8e8,#a6b0c5)" },
    ice: { label:"Ice", group:"Cool", css:"brightness(1.04) saturate(.84) hue-rotate(16deg) contrast(1.04)", swatch:"linear-gradient(135deg,#d9f1ef,#718ca3)" },
    dream: { label:"Dream", group:"Cool", css:"brightness(1.09) contrast(.90) saturate(1.04) hue-rotate(8deg)", swatch:"linear-gradient(135deg,#e1dff1,#b7d8dc)" },
    vivid: { label:"Vivid", group:"Party", css:"saturate(1.45) contrast(1.08) brightness(1.02)", swatch:"linear-gradient(135deg,#ed765f,#5c65d8)" },
    neon: { label:"Neon", group:"Party", css:"saturate(1.65) contrast(1.17) hue-rotate(8deg)", swatch:"linear-gradient(135deg,#45d8cd,#d84fd1)" },
    flashpop: { label:"Flash Pop", group:"Party", css:"brightness(1.12) contrast(1.13) saturate(1.18)", swatch:"linear-gradient(135deg,#fff5d8,#df7676)" },
    bw: { label:"B&W", group:"Mono", css:"grayscale(1) contrast(1.10) brightness(1.02)", swatch:"linear-gradient(135deg,#ededeb,#454545)" },
    noir: { label:"Noir", group:"Mono", css:"grayscale(1) contrast(1.35) brightness(.88)", swatch:"linear-gradient(135deg,#b9b9b9,#171717)" },
    silver: { label:"Silver", group:"Mono", css:"grayscale(1) contrast(.93) brightness(1.09)", swatch:"linear-gradient(135deg,#f2f2f2,#8d9295)" },
  };

  const camera = {
    preview: document.getElementById("camera-preview"),
    session: document.getElementById("camera-session"),
    video: document.getElementById("camera-video"),
    frameGuide: document.getElementById("camera-framing-guide"),
    aspectButtons: [...document.querySelectorAll("[data-camera-aspect]")],
    temperature: document.getElementById("camera-temperature"),
    temperatureValue: document.getElementById("camera-temperature-value"),
    focusControls: document.getElementById("camera-manual-focus-controls"),
    focusDistance: document.getElementById("camera-focus-distance"),
    focusDistanceValue: document.getElementById("camera-focus-distance-value"),
    focusAuto: document.getElementById("camera-focus-auto"),
    settingsHelp: document.getElementById("camera-setting-help"),
    depthOverlay: document.getElementById("camera-depth-overlay"),
    rotate: document.getElementById("camera-rotate"),
    rotateLabel: document.getElementById("camera-rotate-label"),
    beauty: document.getElementById("camera-beauty"),
    beautyValue: document.getElementById("camera-beauty-value"),
    aperture: document.getElementById("camera-aperture"),
    apertureValue: document.getElementById("camera-aperture-value"),
    canvas: document.getElementById("camera-capture-canvas"),
    flight: document.getElementById("camera-capture-flight"),
    flash: document.getElementById("camera-flash"),
    idle: document.getElementById("camera-idle"),
    start: document.getElementById("start-camera"),
    take: document.getElementById("take-photo"),
    message: document.getElementById("camera-message"),
    quickTools: document.getElementById("camera-quick-tools"),
    railToggle: document.getElementById("camera-rail-toggle"),
    flip: document.getElementById("camera-flip"),
    torch: document.getElementById("camera-torch"),
    timerButton: document.getElementById("camera-timer"),
    timerBadge: document.getElementById("camera-timer-badge"),
    effectsToggle: document.getElementById("camera-effects-toggle"),
    effectsPanel: document.getElementById("camera-effects-panel"),
    effectCategories: document.getElementById("camera-effect-categories"),
    effectsGrid: document.getElementById("camera-effects-grid"),
    gridOverlay: document.getElementById("camera-grid-overlay"),
    countdown: document.getElementById("camera-countdown"),
    focusPoint: document.getElementById("camera-focus-point"),
    exposureHud: document.getElementById("camera-exposure-hud"),
    exposureIndicator: document.getElementById("camera-exposure-indicator"),
    filmTrack: document.getElementById("camera-film-track"),
    filmEmpty: document.getElementById("camera-film-empty"),
    quotaLabel: document.getElementById("camera-session-quota"),
    stream: null,
    track: null,
    capabilities: {},
    supportedConstraints: {},
    facingMode: "environment",
    torchOn: false,
    filter: "natural",
    quality: "high",
    timer: 0,
    gridOn: true,
    photoLimit: 50,
    photosUsed: 0,
    localTaken: 0,
    frames: [],
    capturing: false,
    effectPreviewData: "",
    activeEffectGroup: "Essentials",
    railOpen: false,
    hardwareZoom: false,
    zoomMin: 1,
    zoomMax: 3,
    zoomValue: 1,
    digitalZoom: 1,
    exposureMin: -1,
    exposureMax: 1,
    exposureValue: 0,
    hardwareExposure: false,
    beautyStrength: 0,
    apertureStrength: 0,
    manualLandscape: false,
    autoTiltLandscape: null,
    aspectRatio: "4:3",
    temperatureOffset: 0,
    hardwareWhiteBalance: false,
    whiteBalanceModes: [],
    manualFocusAvailable: false,
    focusRange: null,
    pointers: new Map(),
    pinchStartDistance: 0,
    pinchStartZoom: 1,
    dragStartY: 0,
    dragStartExposure: 0,
    gestureMoved: false,
  };

  function clamp(value,min,max) {
    return Math.min(max,Math.max(min,value));
  }

  function cameraRemaining() {
    return Math.max(0, camera.photoLimit - camera.photosUsed - camera.localTaken);
  }

  function updateCameraQuota() {
    if (camera.quotaLabel) camera.quotaLabel.textContent = cameraRemaining() + " left";
    if (camera.take) camera.take.disabled = cameraRemaining() <= 0;
  }

  function maxVisibleFilmFrames(sampleWidth = 36) {
    if (!camera.filmTrack || !camera.filmEmpty) return 3;
    const trackWidth = camera.filmTrack.clientWidth || 180;
    const emptyWidth = camera.filmEmpty.getBoundingClientRect().width || 34;
    return Math.max(1, Math.floor((trackWidth - emptyWidth - 4) / (sampleWidth + 4)));
  }

  function clearFilm() {
    for (const frame of camera.frames) {
      if (frame.url) URL.revokeObjectURL(frame.url);
      frame.node?.remove();
    }
    camera.frames = [];
    camera.filmTrack?.querySelectorAll(".camera-film-frame").forEach(node => node.remove());
  }

  function addHistoryFrame(number) {
    if (!camera.filmTrack || !camera.filmEmpty) return;
    const frame = document.createElement("div");
    frame.className = "camera-film-frame is-history";
    frame.setAttribute("aria-hidden","true");
    const count = document.createElement("span");
    count.textContent = String(number).padStart(2,"0");
    frame.appendChild(count);
    camera.filmTrack.insertBefore(frame,camera.filmEmpty);
    camera.frames.push({ url:null,node:frame,history:true });
  }

  function hydrateFilmHistory(used) {
    clearFilm();
    const count = Math.max(0,Number(used||0));
    if (!count) return;
    requestAnimationFrame(() => {
      const visible = maxVisibleFilmFrames(34);
      const start = Math.max(1,count-visible+1);
      for (let n=start;n<=count;n+=1) addHistoryFrame(n);
    });
  }

  function configureCameraSession(detail = {}) {
    camera.photoLimit = Math.max(1, Number(detail.photoLimit || 50));
    camera.photosUsed = Math.max(0, Number(detail.photosUsed || 0));
    camera.localTaken = 0;
    hydrateFilmHistory(camera.photosUsed);
    updateCameraQuota();
  }

  function combinedPreviewFilter() {
    const base = CAMERA_FILTERS[camera.filter]?.css || "none";
    const exposure = camera.hardwareExposure ? 0 : camera.exposureValue;
    const beauty = camera.beautyStrength / 100;
    const brightness = 1 + exposure * .14 + beauty * .025;
    // This is whole-frame softening, not facial recognition or skin reconstruction.
    const softening = beauty ? " contrast(" + (1 - beauty * .055).toFixed(3) +
      ") saturate(" + (1 + beauty * .035).toFixed(3) + ") blur(" +
      (beauty * .65).toFixed(2) + "px)" : "";
    const white = camera.hardwareWhiteBalance ? "" :
      camera.temperatureOffset < 0
        ? " sepia(" + (-camera.temperatureOffset * .002).toFixed(3) + ") saturate(" +
          (1 + -camera.temperatureOffset * .001).toFixed(3) + ")"
        : camera.temperatureOffset > 0
          ? " hue-rotate(" + (camera.temperatureOffset * .12).toFixed(1) +
            "deg) saturate(" + (1 - camera.temperatureOffset * .0005).toFixed(3) + ")"
          : "";
    return (base === "none" ? "" : base + " ") +
      "brightness(" + brightness.toFixed(3) + ")" + softening + white;
  }

  function updateVideoPresentation() {
    if (!camera.video) return;
    if (camera.frameGuide) camera.frameGuide.hidden = !camera.stream;
    camera.video.style.filter = combinedPreviewFilter();
    const zoom = camera.hardwareZoom ? 1 : camera.digitalZoom;
    const mirror = camera.facingMode === "user" ? " scaleX(-1)" : "";
    camera.video.style.transform = "scale(" + zoom.toFixed(3) + ")" + mirror;
    if (camera.depthOverlay) {
      const depth = camera.apertureStrength / 100;
      camera.depthOverlay.hidden = !camera.stream || depth === 0;
      camera.depthOverlay.style.setProperty("--depth-blur", (depth * 12).toFixed(1) + "px");
    }
  }

  function isCameraLandscape() {
    return Boolean(window.matchMedia("(orientation: landscape)").matches ||
      camera.manualLandscape || camera.autoTiltLandscape === true);
  }

  function updateCameraFrameGuide() {
    const frame = camera.frameGuide;
    const stage = camera.preview;
    if (!frame || !stage || camera.session?.hidden) return;
    // clientWidth/clientHeight stay in local camera coordinates even when the
    // full interface has been CSS-rotated for a rotation-locked phone.
    const width=stage.clientWidth, height=stage.clientHeight;
    if (!width || !height) return;
    const base = {"4:3":4/3,"1:1":1,"16:9":16/9}[camera.aspectRatio] || 4/3;
    const ratio = isCameraLandscape() ? base : 1/base;
    const w = Math.min(width*.94,height*.94*ratio);
    frame.style.width = Math.round(w) + "px";
    const h = w/ratio;
    frame.style.height = Math.round(h) + "px";
    frame.dataset.aspect = camera.aspectRatio;
    // The actual video viewport matches the JPEG crop, avoiding a misleading
    // full-screen preview with a different field of view from the saved image.
    if (camera.video) {
      camera.video.style.position = "absolute";
      camera.video.style.left = Math.round((width-w)/2) + "px";
      camera.video.style.top = Math.round((height-h)/2) + "px";
      camera.video.style.width = Math.round(w) + "px";
      camera.video.style.height = Math.round(h) + "px";
    }
    if (camera.depthOverlay) {
      camera.depthOverlay.style.left = Math.round((width-w)/2) + "px";
      camera.depthOverlay.style.top = Math.round((height-h)/2) + "px";
      camera.depthOverlay.style.width = Math.round(w) + "px";
      camera.depthOverlay.style.height = Math.round(h) + "px";
      camera.depthOverlay.style.right = "auto";
      camera.depthOverlay.style.bottom = "auto";
    }
  }

  function updateCameraOrientation() {
    const viewportLandscape = window.matchMedia("(orientation: landscape)").matches;
    const manual = !viewportLandscape &&
      (camera.manualLandscape || camera.autoTiltLandscape === true);
    const landscape = viewportLandscape || manual;
    camera.session?.classList.toggle("is-landscape",landscape);
    camera.session?.classList.toggle("is-manual-landscape",manual);
    document.body.classList.toggle("camera-landscape",
      landscape && document.body.classList.contains("camera-session-active"));
    camera.rotate?.setAttribute("aria-pressed",String(camera.manualLandscape));
    if (camera.rotateLabel) camera.rotateLabel.textContent = camera.manualLandscape ? "Auto" : "Rotate";
    camera.rotate?.setAttribute("aria-label",camera.manualLandscape
      ? "Return camera interface to automatic orientation"
      : "Rotate camera interface into landscape mode");
    requestAnimationFrame(updateCameraFrameGuide);
  }

  function selectCameraAspect(aspect) {
    if (!["4:3","1:1","16:9"].includes(aspect)) return;
    camera.aspectRatio = aspect;
    camera.aspectButtons.forEach(button=>{
      const selected = button.dataset.cameraAspect === aspect;
      button.classList.toggle("active",selected);
      button.setAttribute("aria-pressed",String(selected));
    });
    updateCameraFrameGuide();
    if (camera.message) camera.message.textContent = aspect + " photo framing selected.";
  }

  function handleCameraDeviceTilt(event) {
    if (!camera.stream || camera.manualLandscape || !Number.isFinite(event?.gamma) ||
        !Number.isFinite(event?.beta)) return;
    // Only infer a rotation for a reasonably upright phone; flat-on-table poses
    // do not have a stable sensor-based orientation.
    const side = Math.abs(event.gamma);
    const forward = Math.abs(event.beta);
    if (forward > 70) return;
    const landscape = side > 57 ? true : side < 27 ? false : null;
    if (landscape === null || landscape === camera.autoTiltLandscape) return;
    camera.autoTiltLandscape = landscape;
    updateCameraOrientation();
  }

  function toggleCameraOrientation() {
    camera.manualLandscape = !camera.manualLandscape;
    updateCameraOrientation();
    if (camera.message) camera.message.textContent = camera.manualLandscape
      ? "Landscape interface selected. Tap Auto to return to the phone's orientation."
      : "Camera interface follows the phone's screen orientation.";
  }

  function setPortraitEffect(kind, strength) {
    const value = clamp(Number(strength) || 0, 0, 100);
    if (kind === "beauty") {
      camera.beautyStrength = value;
      if (camera.beautyValue) camera.beautyValue.textContent = value ? value + "%" : "Off";
    } else if (kind === "aperture") {
      camera.apertureStrength = value;
      if (camera.apertureValue) camera.apertureValue.textContent = value ? value + "%" : "Off";
    }
    updateVideoPresentation();
  }

  function closeCameraSheet() {
    if (camera.effectsPanel) camera.effectsPanel.hidden = true;
    camera.effectsToggle?.setAttribute("aria-expanded","false");
  }

  function setRail(open) {
    camera.railOpen = Boolean(open);
    camera.quickTools?.classList.toggle("is-open",camera.railOpen);
    camera.railToggle?.classList.toggle("is-open",camera.railOpen);
    camera.railToggle?.setAttribute("aria-expanded",String(camera.railOpen));
    const icon = camera.railToggle?.querySelector("span");
    if (icon) icon.textContent = camera.railOpen ? "›" : "‹";
    if (!camera.railOpen) closeCameraSheet();
  }

  function stopStream({ hideControls = true } = {}) {
    if (camera.stream) {
      camera.stream.getTracks().forEach(track => track.stop());
      camera.stream = null;
    }
    camera.track = null;
    camera.capabilities = {};
    camera.torchOn = false;
    camera.hardwareZoom = false;
    camera.hardwareExposure = false;
    camera.hardwareWhiteBalance = false;
    camera.manualFocusAvailable = false;
    camera.focusRange = null;
    if (camera.focusControls) camera.focusControls.hidden = true;
    camera.zoomValue = 1;
    camera.digitalZoom = 1;
    camera.exposureValue = 0;
    camera.pointers.clear();
    if (camera.video) {
      camera.video.pause();
      camera.video.srcObject = null;
      camera.video.hidden = true;
      camera.video.style.transform = "";
      camera.video.style.filter = "";
      camera.video.style.position = "";
      camera.video.style.left = "";
      camera.video.style.top = "";
      camera.video.style.width = "";
      camera.video.style.height = "";
    }
    if (camera.frameGuide) camera.frameGuide.hidden = true;
    if (camera.depthOverlay) camera.depthOverlay.hidden = true;
    camera.autoTiltLandscape = null;
    if (camera.torch) {
      camera.torch.classList.remove("active");
      camera.torch.hidden = true;
    }
    if (hideControls) {
      if (camera.quickTools) camera.quickTools.hidden = true;
      if (camera.railToggle) camera.railToggle.hidden = true;
      setRail(false);
      closeCameraSheet();
    }
  }

  function resetCamera() {
    stopStream();
    clearFilm();
    camera.localTaken = 0;
    camera.filter = "natural";
    camera.timer = 0;
    camera.manualLandscape = false;
    camera.autoTiltLandscape = null;
    camera.aspectRatio = "4:3";
    selectCameraAspect("4:3");
    camera.temperatureOffset = 0;
    if (camera.temperature) camera.temperature.value = "0";
    if (camera.temperatureValue) camera.temperatureValue.textContent = "Auto";
    if (camera.focusControls) camera.focusControls.hidden = true;
    updateCameraOrientation();
    if (camera.beauty) camera.beauty.value = "0";
    if (camera.aperture) camera.aperture.value = "0";
    setPortraitEffect("beauty",0);
    setPortraitEffect("aperture",0);
    camera.gridOn = true;
    camera.capturing = false;
    camera.effectPreviewData = "";
    if (camera.gridOverlay) camera.gridOverlay.hidden = true;
    if (camera.countdown) camera.countdown.hidden = true;
    if (camera.focusPoint) camera.focusPoint.hidden = true;
    if (camera.exposureHud) camera.exposureHud.hidden = true;
    if (camera.idle) camera.idle.hidden = false;
    if (camera.start) {
      camera.start.hidden = false;
      camera.start.disabled = false;
    }
    if (camera.take) {
      camera.take.hidden = true;
      camera.take.disabled = false;
    }
    if (camera.timerBadge) camera.timerBadge.textContent = "Off";
    if (camera.flight) {
      camera.flight.hidden = true;
      camera.flight.style.backgroundImage = "";
    }
    if (camera.flash) camera.flash.hidden = true;
    updateCameraQuota();
    if (camera.message) camera.message.textContent =
      "Your invitation has been verified. Open the camera when you're ready.";
  }

  function cameraConstraints() {
    return {
      video: {
        facingMode: { ideal: camera.facingMode },
        width: { ideal: 2560 },
        height: { ideal: 1920 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio:false,
    };
  }

  async function configureTrackCapabilities() {
    const track = camera.track;
    if (!track) return;
    camera.supportedConstraints = navigator.mediaDevices?.getSupportedConstraints?.() || {};
    camera.capabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
    const settings = typeof track.getSettings === "function" ? track.getSettings() : {};

    if (camera.torch) {
      const supported = Boolean(camera.capabilities.torch);
      camera.torch.hidden = !supported;
      camera.torch.disabled = !supported;
    }

    const zoom = camera.capabilities.zoom;
    camera.hardwareZoom = Boolean(zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max));
    if (camera.hardwareZoom) {
      camera.zoomMin = zoom.min;
      camera.zoomMax = zoom.max;
      camera.zoomValue = clamp(Number(settings.zoom || zoom.min || 1),camera.zoomMin,camera.zoomMax);
      camera.digitalZoom = 1;
    } else {
      camera.zoomMin = 1;
      camera.zoomMax = 3;
      camera.zoomValue = 1;
      camera.digitalZoom = 1;
    }

    const exposure = camera.capabilities.exposureCompensation;
    camera.hardwareExposure = Boolean(exposure && Number.isFinite(exposure.min) && Number.isFinite(exposure.max));
    if (camera.hardwareExposure) {
      camera.exposureMin = exposure.min;
      camera.exposureMax = exposure.max;
      camera.exposureValue = clamp(Number(settings.exposureCompensation || 0),camera.exposureMin,camera.exposureMax);
    } else {
      camera.exposureMin = -1;
      camera.exposureMax = 1;
      camera.exposureValue = 0;
    }

    const modes = Array.isArray(camera.capabilities.focusMode) ? camera.capabilities.focusMode : [];
    const focus = camera.capabilities.focusDistance;
    camera.focusRange = focus && Number.isFinite(focus.min) && Number.isFinite(focus.max) &&
      focus.max > focus.min && modes.includes("manual") ? focus : null;
    camera.manualFocusAvailable = Boolean(camera.focusRange);
    if (camera.focusControls) camera.focusControls.hidden = !camera.manualFocusAvailable;
    if (camera.settingsHelp) camera.settingsHelp.textContent = camera.manualFocusAvailable
      ? "Manual lens focus is available. Tap the image to focus on supported phones."
      : "Tap to focus where supported. White balance uses a software color adjustment.";
    if (modes.includes("continuous")) {
      try { await track.applyConstraints({ advanced:[{ focusMode:"continuous" }] }); } catch {}
    }
    updateVideoPresentation();
  }

  function setCameraTemperature(value) {
    camera.temperatureOffset = clamp(Number(value)||0,-100,100);
    const offset = camera.temperatureOffset;
    if (camera.temperatureValue) camera.temperatureValue.textContent =
      offset === 0 ? "Neutral" : Math.abs(offset) + (offset < 0 ? "% warm" : "% cool");
    // Software color-temperature simulation, independent of camera hardware support.
    updateVideoPresentation();
  }

  async function setManualFocus(value) {
    const track = camera.track, range = camera.focusRange;
    if (!track || !range || !camera.manualFocusAvailable) return;
    const pct = clamp(Number(value)||0,0,100);
    try {
      await track.applyConstraints({ advanced:[{
        focusMode:"manual", focusDistance:range.min+(range.max-range.min)*pct/100
      }] });
      if (camera.focusDistanceValue) camera.focusDistanceValue.textContent = pct+"%";
    } catch(error) {
      console.warn("Manual lens focus rejected:",error);
      camera.manualFocusAvailable = false;
      if (camera.focusControls) camera.focusControls.hidden = true;
      if (camera.message) camera.message.textContent = "Use tap to focus on this camera.";
    }
  }

  async function resetAutoFocus() {
    const modes = Array.isArray(camera.capabilities.focusMode) ? camera.capabilities.focusMode : [];
    const mode = modes.includes("continuous") ? "continuous" :
      modes.includes("single-shot") ? "single-shot" : null;
    if (!mode || !camera.track) return;
    try {
      await camera.track.applyConstraints({ advanced:[{focusMode:mode}] });
      if (camera.focusDistanceValue) camera.focusDistanceValue.textContent = "Auto";
    } catch {}
  }

  async function setCameraZoom(value) {
    const next = clamp(value,camera.zoomMin,camera.zoomMax);
    camera.zoomValue = next;
    if (camera.hardwareZoom && camera.track) {
      try {
        await camera.track.applyConstraints({ advanced:[{ zoom:next }] });
      } catch {
        camera.hardwareZoom = false;
        camera.zoomMin = 1;
        camera.zoomMax = 3;
        camera.digitalZoom = clamp(next,1,3);
      }
    } else {
      camera.digitalZoom = clamp(next,1,3);
    }
    updateVideoPresentation();
  }

  async function setCameraExposure(value) {
    const next = clamp(value,camera.exposureMin,camera.exposureMax);
    camera.exposureValue = next;
    if (camera.hardwareExposure && camera.track) {
      try {
        await camera.track.applyConstraints({ advanced:[{ exposureCompensation:next }] });
      } catch {
        camera.hardwareExposure = false;
        camera.exposureMin = -1;
        camera.exposureMax = 1;
        camera.exposureValue = clamp(next,-1,1);
      }
    }
    updateVideoPresentation();
    const span = camera.exposureMax-camera.exposureMin || 1;
    const pct = (camera.exposureValue-camera.exposureMin)/span;
    if (camera.exposureIndicator) camera.exposureIndicator.style.top = (100-pct*100).toFixed(1)+"%";
  }

  function localCameraPoint(clientX,clientY,element) {
    const rect=element.getBoundingClientRect();
    if (camera.session?.classList.contains("is-manual-landscape")) {
      // The entire camera UI is rotated 90° clockwise when Android rotation
      // lock is active. Convert screen touches back into local camera space.
      return {
        x:clamp(clientY-rect.top,0,element.clientWidth),
        y:clamp(rect.right-clientX,0,element.clientHeight)
      };
    }
    return {x:clamp(clientX-rect.left,0,element.clientWidth),
      y:clamp(clientY-rect.top,0,element.clientHeight)};
  }

  function showFocusUi(clientX,clientY) {
    if (!camera.preview || !camera.focusPoint || !camera.exposureHud) return;
    const {x:rawX,y:rawY}=localCameraPoint(clientX,clientY,camera.preview);
    const width=camera.preview.clientWidth,height=camera.preview.clientHeight;
    const x=clamp(rawX,18,Math.max(18,width-18));
    const y=clamp(rawY,18,Math.max(18,height-18));
    camera.focusPoint.hidden = false;
    camera.focusPoint.style.left = x+"px";
    camera.focusPoint.style.top = y+"px";
    camera.focusPoint.classList.remove("pulse");
    void camera.focusPoint.offsetWidth;
    camera.focusPoint.classList.add("pulse");
    camera.exposureHud.hidden = false;
    camera.exposureHud.style.left = clamp(x+34,24,Math.max(24,width-34))+"px";
    camera.exposureHud.style.top = clamp(y-46,40,Math.max(40,height-120))+"px";
  }

  async function focusAt(clientX,clientY) {
    if (!camera.preview || !camera.track || !camera.video) return;
    showFocusUi(clientX,clientY);
    const video=camera.video;
    const p=localCameraPoint(clientX,clientY,video);
    let nx=clamp(p.x/Math.max(1,video.clientWidth),0,1);
    const ny=clamp(p.y/Math.max(1,video.clientHeight),0,1);
    if (camera.facingMode === "user") nx=1-nx;
    const geo=captureGeometry(video);
    const point = {
      x:Math.round(geo.sx + nx*geo.sw),
      y:Math.round(geo.sy + ny*geo.sh),
    };
    const focusModes = Array.isArray(camera.capabilities.focusMode) ? camera.capabilities.focusMode : [];
    if (camera.supportedConstraints.pointsOfInterest && focusModes.includes("single-shot")) {
      try {
        await camera.track.applyConstraints({
          advanced:[{ pointsOfInterest:[point],focusMode:"single-shot" }]
        });
        setTimeout(() => {
          if (camera.track && focusModes.includes("continuous")) {
            camera.track.applyConstraints({ advanced:[{ focusMode:"continuous" }] }).catch(()=>{});
          }
        },900);
      } catch {}
    }
  }

  function pointerDistance(values) {
    if (values.length<2) return 0;
    return Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);
  }

  function setupCameraGestures() {
    if (!camera.preview) return;
    camera.preview.addEventListener("pointerdown",event => {
      if (!camera.stream || event.target.closest("button,.camera-sheet")) return;
      camera.preview.setPointerCapture?.(event.pointerId);
      camera.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});
      camera.gestureMoved = false;
      if (camera.pointers.size===1) {
        camera.dragStartY = event.clientY;
        camera.dragStartExposure = camera.exposureValue;
        showFocusUi(event.clientX,event.clientY);
      } else if (camera.pointers.size===2) {
        const values=[...camera.pointers.values()];
        camera.pinchStartDistance = pointerDistance(values);
        camera.pinchStartZoom = camera.hardwareZoom ? camera.zoomValue : camera.digitalZoom;
        if (camera.exposureHud) camera.exposureHud.hidden = true;
      }
    });

    camera.preview.addEventListener("pointermove",event => {
      const pointer=camera.pointers.get(event.pointerId);
      if (!pointer || !camera.stream) return;
      pointer.x=event.clientX; pointer.y=event.clientY;
      camera.pointers.set(event.pointerId,pointer);

      if (camera.pointers.size>=2) {
        const values=[...camera.pointers.values()].slice(0,2);
        const distance=pointerDistance(values);
        if (camera.pinchStartDistance>0) {
          camera.gestureMoved=true;
          setCameraZoom(camera.pinchStartZoom*(distance/camera.pinchStartDistance));
        }
        return;
      }

      const dy=event.clientY-camera.dragStartY;
      if (Math.abs(dy)>8) {
        camera.gestureMoved=true;
        const span=camera.exposureMax-camera.exposureMin || 2;
        const next=camera.dragStartExposure-(dy/Math.max(140,camera.preview.clientHeight*.45))*span;
        setCameraExposure(next);
      }
    });

    const finishPointer=event => {
      const pointer=camera.pointers.get(event.pointerId);
      const wasSingle=camera.pointers.size===1;
      camera.pointers.delete(event.pointerId);
      if (wasSingle && pointer && !camera.gestureMoved) focusAt(event.clientX,event.clientY);
      if (camera.pointers.size<2) camera.pinchStartDistance=0;
    };
    camera.preview.addEventListener("pointerup",finishPointer);
    camera.preview.addEventListener("pointercancel",finishPointer);
  }

  async function startCamera({ restarting=false }={}) {
    stopStream({ hideControls:false });
    camera.message.textContent = restarting ? "Switching camera…" : "Requesting permission to use your camera…";
    camera.start.disabled=true;
    const cameraLoader = WeddingUI.begin(
      restarting ? "Switching camera…" : "Opening wedding camera…",
      restarting ? "Selecting the other lens." : "Your browser may ask for camera permission.",
      { blocking: false, delay: 180 }
    );
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      WeddingUI.end(cameraLoader);
      camera.message.textContent="This browser cannot open a camera here. Use HTTPS on a compatible device.";
      camera.start.disabled=false;
      return;
    }
    try {
      const stream=await navigator.mediaDevices.getUserMedia(cameraConstraints());
      camera.stream=stream;
      camera.track=stream.getVideoTracks()[0]||null;
      camera.video.srcObject=stream;
      camera.video.hidden=false;
      camera.idle.hidden=true;
      await camera.video.play();
      await configureTrackCapabilities();
      if (camera.gridOverlay) camera.gridOverlay.hidden=false;
      camera.message.textContent="Tap to focus · slide up/down for exposure · pinch to zoom";
      camera.start.hidden=true;
      camera.take.hidden=false;
      camera.quickTools.hidden=false;
      camera.railToggle.hidden=false;
      setRail(false);
      updateCameraOrientation();
      requestAnimationFrame(updateCameraFrameGuide);
      updateCameraQuota();
    } catch(error) {
      stopStream();
      const name=error&&error.name;
      camera.message.textContent =
        name==="NotAllowedError"||name==="PermissionDeniedError"
          ? "Camera access was denied. Allow camera permission in your browser settings."
          : name==="NotFoundError"
            ? "No camera was detected on this device."
            : "The camera could not start. Another app may be using it.";
    } finally {
      WeddingUI.end(cameraLoader);
      camera.start.disabled=false;
    }
  }

  async function switchCamera() {
    if (camera.capturing) return;
    camera.facingMode=camera.facingMode==="environment"?"user":"environment";
    await startCamera({restarting:true});
  }

  async function toggleTorch() {
    if (!camera.track || camera.torch.hidden) return;
    camera.torchOn=!camera.torchOn;
    try {
      await camera.track.applyConstraints({ advanced:[{torch:camera.torchOn}] });
      camera.torch.classList.toggle("active",camera.torchOn);
    } catch {
      camera.torchOn=false;
      camera.torch.classList.remove("active");
      camera.message.textContent="This phone couldn't switch the camera light.";
    }
  }

  function cycleTimer() {
    camera.timer=camera.timer===0?3:camera.timer===3?10:0;
    if (camera.timerBadge) camera.timerBadge.textContent=camera.timer?camera.timer+"s":"Off";
    camera.timerButton?.classList.toggle("active",camera.timer>0);
    camera.message.textContent=camera.timer?camera.timer+" second self timer":"Self timer off";
  }

  function openCameraSheet() {
    if (camera.effectsPanel) camera.effectsPanel.hidden=false;
    camera.effectsToggle?.setAttribute("aria-expanded","true");
    refreshEffectPreviews();
  }

  function selectFilter(name) {
    if (!CAMERA_FILTERS[name]) return;
    camera.filter=name;
    camera.filterButtons.forEach(button =>
      button.classList.toggle("active",button.dataset.filter===name)
    );
    updateVideoPresentation();
    if (camera.stream) camera.message.textContent=CAMERA_FILTERS[name].label+" look selected";
  }

  function refreshEffectPreviews() {
    if (!camera.video || !camera.video.videoWidth || !camera.video.videoHeight) return;
    try {
      const canvas=document.createElement("canvas");
      const size=120;
      canvas.width=size;canvas.height=size;
      const context=canvas.getContext("2d");
      if (!context) return;
      const vw=camera.video.videoWidth,vh=camera.video.videoHeight,side=Math.min(vw,vh);
      const sx=(vw-side)/2,sy=(vh-side)/2;
      if (camera.facingMode==="user") { context.translate(size,0);context.scale(-1,1); }
      context.drawImage(camera.video,sx,sy,side,side,0,0,size,size);
      camera.effectPreviewData=canvas.toDataURL("image/jpeg",.66);
      camera.effectsGrid?.querySelectorAll(".camera-effect-preview").forEach(preview => {
        preview.style.backgroundImage='url("'+camera.effectPreviewData+'")';
        const filter=preview.closest(".camera-effect")?.dataset.filter;
        if (filter&&CAMERA_FILTERS[filter]) preview.style.filter=CAMERA_FILTERS[filter].css;
      });
    } catch {}
  }

  function renderEffectCatalog() {
    if (!camera.effectCategories || !camera.effectsGrid) return;
    const groups=[...new Set(Object.values(CAMERA_FILTERS).map(item=>item.group))];
    camera.effectCategories.replaceChildren();
    camera.effectsGrid.replaceChildren();
    const renderGroup=group => {
      camera.activeEffectGroup=group;
      camera.effectsGrid.replaceChildren();
      const entries=Object.entries(CAMERA_FILTERS).filter(([,item])=>item.group===group);
      for (const [key,item] of entries) {
        const button=document.createElement("button");
        button.type="button";
        button.className="camera-effect";
        button.dataset.filter=key;
        const previewStyle=camera.effectPreviewData
          ? 'background-image:url(&quot;'+camera.effectPreviewData+'&quot;);filter:'+item.css
          : 'background:'+item.swatch;
        button.innerHTML='<span class="camera-effect-preview" style="'+previewStyle+'"></span><strong>'+item.label+'</strong>';
        button.addEventListener("click",()=>selectFilter(key));
        camera.effectsGrid.appendChild(button);
      }
      camera.filterButtons=[...camera.effectsGrid.querySelectorAll(".camera-effect")];
      camera.filterButtons.forEach(button =>
        button.classList.toggle("active",button.dataset.filter===camera.filter)
      );
    };
    groups.forEach((group,index)=>{
      const tab=document.createElement("button");
      tab.type="button";
      tab.className="camera-effect-category"+(index===0?" active":"");
      tab.textContent=group;
      tab.addEventListener("click",()=>{
        camera.effectCategories.querySelectorAll(".camera-effect-category").forEach(node =>
          node.classList.toggle("active",node===tab)
        );
        renderGroup(group);
      });
      camera.effectCategories.appendChild(tab);
    });
    renderGroup(groups[0]);
  }

  async function runCaptureTimer() {
    if (!camera.timer || !camera.countdown) return true;
    camera.countdown.hidden=false;
    for (let remaining=camera.timer;remaining>0;remaining-=1) {
      camera.countdown.textContent=String(remaining);
      camera.countdown.classList.remove("tick");
      void camera.countdown.offsetWidth;
      camera.countdown.classList.add("tick");
      navigator.vibrate?.(remaining===1?45:12);
      await new Promise(resolve=>setTimeout(resolve,1000));
      if (!camera.stream) { camera.countdown.hidden=true;return false; }
    }
    camera.countdown.hidden=true;
    return true;
  }

  function flashCamera() {
    if (!camera.flash) return;
    camera.flash.hidden=false;
    camera.flash.classList.remove("fire");
    void camera.flash.offsetWidth;
    camera.flash.classList.add("fire");
    camera.flash.addEventListener("animationend",()=>{
      camera.flash.hidden=true;
      camera.flash.classList.remove("fire");
    },{once:true});
  }

  function captureGeometry(video) {
    const landscape=isCameraLandscape();
    const base = {"4:3":4/3,"1:1":1,"16:9":16/9}[camera.aspectRatio] || 4/3;
    const ratio=landscape?base:1/base;
    const vw=video.videoWidth,vh=video.videoHeight;
    let sx=0,sy=0,sw=vw,sh=vh;
    const sourceRatio=vw/vh;
    if (sourceRatio>ratio) { sw=vh*ratio;sx=(vw-sw)/2; }
    else { sh=vw/ratio;sy=(vh-sh)/2; }

    const digital=camera.hardwareZoom?1:camera.digitalZoom;
    if (digital>1) {
      const zoomW=sw/digital,zoomH=sh/digital;
      sx+=(sw-zoomW)/2; sy+=(sh-zoomH)/2; sw=zoomW;sh=zoomH;
    }

    const scale=Math.min(1,2400/Math.max(sw,sh));
    const width=Math.max(1,Math.round(sw*scale));
    const height=Math.max(1,Math.round(sh*scale));
    return {sx,sy,sw,sh,width,height,orientation:landscape?"landscape":"portrait"};
  }

  function drawWatermark(context,canvas) {
    const pad=Math.max(18,canvas.width*.022);
    const fontSize=Math.max(18,canvas.width*.022);
    context.save();
    context.textAlign="right";
    context.textBaseline="bottom";
    context.shadowColor="rgba(0,0,0,.35)";
    context.shadowBlur=Math.max(3,fontSize*.25);
    context.fillStyle="rgba(255,248,238,.62)";
    context.font="italic "+fontSize+"px Georgia,serif";
    context.fillText("A&J · 02.23.27",canvas.width-pad,canvas.height-pad);
    context.restore();
  }

  function renderCaptureCanvas(video,{look=true,watermark=false}={}) {
    const geometry=captureGeometry(video);
    const canvas=document.createElement("canvas");
    canvas.width=geometry.width;canvas.height=geometry.height;
    const context=canvas.getContext("2d");
    if (!context) return {canvas:null,orientation:geometry.orientation};

    const drawFrame = target => {
      target.save();
      if (camera.facingMode === "user") {
        target.translate(canvas.width,0);
        target.scale(-1,1);
      }
      target.drawImage(video,geometry.sx,geometry.sy,geometry.sw,geometry.sh,0,0,canvas.width,canvas.height);
      target.restore();
    };
    const depth = look ? camera.apertureStrength / 100 : 0;
    if (depth && "filter" in context) {
      // A center-focus approximation, not optical depth-of-field or subject segmentation.
      context.save();
      context.filter = combinedPreviewFilter() + " blur(" + (depth * 12).toFixed(1) + "px)";
      drawFrame(context);
      context.restore();
      // Feather the sharp central area instead of clipping at a hard ellipse.
      const sharp=document.createElement("canvas");
      sharp.width=canvas.width; sharp.height=canvas.height;
      const mask=document.createElement("canvas");
      mask.width=canvas.width; mask.height=canvas.height;
      const foreground=sharp.getContext("2d"), matte=mask.getContext("2d");
      if (foreground && matte) {
        foreground.filter=combinedPreviewFilter();
        drawFrame(foreground);
        matte.save();
        matte.translate(canvas.width/2,canvas.height/2);
        matte.scale(canvas.width*.43,canvas.height*.48);
        const fade=matte.createRadialGradient(0,0,0,0,0,1);
        fade.addColorStop(0,"rgba(0,0,0,1)");
        fade.addColorStop(.48,"rgba(0,0,0,1)");
        fade.addColorStop(1,"rgba(0,0,0,0)");
        matte.fillStyle=fade;
        matte.fillRect(-3,-3,6,6);
        matte.restore();
        foreground.filter="none";
        foreground.globalCompositeOperation="destination-in";
        foreground.drawImage(mask,0,0);
        foreground.globalCompositeOperation="source-over";
        context.drawImage(sharp,0,0);
      }
    } else {
      context.save();
      if (look) context.filter = combinedPreviewFilter();
      drawFrame(context);
      context.restore();
    }
    if (watermark) drawWatermark(context,canvas);
    return {canvas,orientation:geometry.orientation};
  }

  async function thumbnailFromCanvas(source,orientation) {
    const thumb=document.createElement("canvas");
    const landscape=orientation==="landscape";
    thumb.width=landscape?116:80;
    thumb.height=landscape?78:106;
    const context=thumb.getContext("2d");
    if (!context) return null;
    context.drawImage(source,0,0,thumb.width,thumb.height);
    const blob=await new Promise(resolve=>thumb.toBlob(resolve,"image/jpeg",.68));
    return blob?{url:URL.createObjectURL(blob),orientation}:null;
  }

  function animateFilmAdvance(existing) {
    requestAnimationFrame(()=>{
      existing.forEach(({node,left})=>{
        if (!node.isConnected) return;
        const dx=left-node.getBoundingClientRect().left;
        if (Math.abs(dx)<1 || typeof node.animate!=="function") return;
        node.animate(
          [{transform:"translateX("+dx+"px)"},{transform:"translateX(0)"}],
          {duration:360,easing:"cubic-bezier(.16,1,.3,1)"}
        );
      });
    });
  }

  function trimFilmFrames() {
    if (!camera.filmTrack || !camera.filmEmpty) return;
    const frames=[...camera.filmTrack.querySelectorAll(".camera-film-frame")];
    let total=camera.filmEmpty.getBoundingClientRect().width||34;
    const gap=4;
    const available=camera.filmTrack.clientWidth||180;
    const keep=[];
    for (let i=frames.length-1;i>=0;i-=1) {
      const width=frames[i].getBoundingClientRect().width||34;
      if (total+gap+width>available) break;
      keep.unshift(frames[i]);
      total+=gap+width;
    }
    frames.forEach(frame=>{
      if (!keep.includes(frame)) {
        const record=camera.frames.find(item=>item.node===frame);
        if (record?.url) URL.revokeObjectURL(record.url);
        camera.frames=camera.frames.filter(item=>item.node!==frame);
        frame.remove();
      }
    });
  }

  function addFilmFrame(thumbnail,number) {
    if (!camera.filmTrack || !camera.filmEmpty || !thumbnail?.url) return;
    const existing=[...camera.filmTrack.querySelectorAll(".camera-film-frame")].map(node=>({
      node,left:node.getBoundingClientRect().left
    }));
    const frame=document.createElement("div");
    frame.className="camera-film-frame "+thumbnail.orientation;
    frame.setAttribute("aria-hidden","true");
    frame.style.backgroundImage='url("'+thumbnail.url+'")';
    const count=document.createElement("span");
    count.textContent=String(number).padStart(2,"0");
    frame.appendChild(count);
    camera.filmTrack.insertBefore(frame,camera.filmEmpty);
    camera.frames.push({url:thumbnail.url,node:frame,orientation:thumbnail.orientation});
    animateFilmAdvance(existing);
    frame.classList.add("is-new");
    frame.addEventListener("animationend",()=>frame.classList.remove("is-new"),{once:true});
    requestAnimationFrame(trimFilmFrames);
    camera.filmEmpty.classList.remove("pulse");
    void camera.filmEmpty.offsetWidth;
    camera.filmEmpty.classList.add("pulse");
  }

  async function animateCaptureToFilm(thumbnail,number) {
    if (!thumbnail?.url || !camera.flight || !camera.filmEmpty || !camera.preview) {
      addFilmFrame(thumbnail,number);
      return;
    }
    const source=camera.preview.getBoundingClientRect();
    const target=camera.filmEmpty.getBoundingClientRect();
    const landscape=thumbnail.orientation==="landscape";
    const startW=Math.min(landscape?175:135,source.width*.34);
    const startH=landscape?startW*.67:startW*1.32;
    const startX=source.left+source.width/2-startW/2;
    const startY=source.top+source.height/2-startH/2;
    camera.flight.style.backgroundImage='url("'+thumbnail.url+'")';
    camera.flight.hidden=false;
    if (typeof camera.flight.animate==="function") {
      const animation=camera.flight.animate([
        {left:startX+"px",top:startY+"px",width:startW+"px",height:startH+"px",opacity:1,transform:"rotate(-2deg) scale(1)"},
        {left:target.left+"px",top:target.top+"px",width:target.width+"px",height:target.height+"px",opacity:.9,transform:"rotate(1deg) scale(.96)"}
      ],{duration:540,easing:"cubic-bezier(.18,.82,.22,1)",fill:"forwards"});
      try { await animation.finished; } catch {}
      animation.cancel();
    }
    camera.flight.hidden=true;
    camera.flight.style.backgroundImage="";
    addFilmFrame(thumbnail,number);
  }

  async function capturePhoto() {
    const video=camera.video;
    if (camera.capturing || !camera.stream || !video.videoWidth || !video.videoHeight) return;
    if (cameraRemaining()<=0) {
      camera.message.textContent="This invitation's 50-photo film roll is full.";
      camera.take.disabled=true;
      return;
    }
    camera.capturing=true;
    camera.take.disabled=true;
    if (camera.timer>0) {
      const done=await runCaptureTimer();
      if (!done) { camera.capturing=false;camera.take.disabled=cameraRemaining()<=0;return; }
    }
    flashCamera();
    navigator.vibrate?.(18);
    try {
      const raw=renderCaptureCanvas(video,{look:false,watermark:false});
      const final=renderCaptureCanvas(video,{look:true,watermark:true});
      if (!raw.canvas || !final.canvas) throw new Error("Canvas unavailable");
      const rawBlob=await new Promise(resolve=>raw.canvas.toBlob(resolve,"image/jpeg",.94));
      const photo=await new Promise(resolve=>final.canvas.toBlob(resolve,"image/jpeg",.93));
      if (!photo || !rawBlob) throw new Error("Photo capture failed");
      const thumbnail=await thumbnailFromCanvas(final.canvas,final.orientation);
      camera.localTaken+=1;
      const number=camera.photosUsed+camera.localTaken;
      updateCameraQuota();
      await animateCaptureToFilm(thumbnail,number);
      camera.message.textContent="Moment sealed · "+cameraRemaining()+" frames left";
      document.dispatchEvent(new CustomEvent("wedding:photo-captured",{
        detail:{
          blob:photo,
          rawBlob,
          filter:camera.filter,
          quality:"high",
          facingMode:camera.facingMode,
          orientation:final.orientation,
          watermarked:true,
          localSequence:camera.localTaken,
        }
      }));
    } catch(error) {
      camera.message.textContent="That photo couldn't be captured. Please try again.";
      console.error("Wedding camera capture failed:",error);
    } finally {
      camera.capturing=false;
      camera.take.disabled=cameraRemaining()<=0;
    }
  }

  camera.start?.addEventListener("click",()=>startCamera());
  camera.take?.addEventListener("click",capturePhoto);
  camera.flip?.addEventListener("click",switchCamera);
  camera.aspectButtons.forEach(button =>
    button.addEventListener("click",()=>selectCameraAspect(button.dataset.cameraAspect)));
  camera.temperature?.addEventListener("input",event=>setCameraTemperature(event.target.value));
  camera.focusDistance?.addEventListener("input",event=>setManualFocus(event.target.value));
  camera.focusAuto?.addEventListener("click",resetAutoFocus);
  camera.rotate?.addEventListener("click",toggleCameraOrientation);
  camera.beauty?.addEventListener("input",event=>setPortraitEffect("beauty",event.target.value));
  camera.aperture?.addEventListener("input",event=>setPortraitEffect("aperture",event.target.value));
  camera.torch?.addEventListener("click",toggleTorch);
  camera.timerButton?.addEventListener("click",cycleTimer);
  camera.railToggle?.addEventListener("click",()=>setRail(!camera.railOpen));
  camera.effectsToggle?.addEventListener("click",()=>{
    const open=camera.effectsToggle.getAttribute("aria-expanded")==="true";
    if (open) closeCameraSheet(); else openCameraSheet();
  });
  document.querySelectorAll("[data-close-camera-sheet]").forEach(button =>
    button.addEventListener("click",closeCameraSheet)
  );

  setupCameraGestures();
  renderEffectCatalog();
  updateCameraOrientation();
  if (screen.orientation?.addEventListener) {
    screen.orientation.addEventListener("change",updateCameraOrientation);
  }
  window.addEventListener("resize",updateCameraOrientation,{passive:true});
  window.addEventListener("orientationchange",updateCameraOrientation,{passive:true});
  window.visualViewport?.addEventListener("resize",updateCameraOrientation,{passive:true});
  window.addEventListener("deviceorientation",handleCameraDeviceTilt,{passive:true});

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

    let glow = null;
    if (finePointer) {
      glow = document.createElement("i");
      glow.className = "pointer-glow";
      ambient.appendChild(glow);
    }

    const progress = document.createElement("i");
    progress.className = "experience-progress";
    document.body.appendChild(progress);
    let progressFrame = 0;
    const updateProgress = () => {
      if (progressFrame) return;
      progressFrame = requestAnimationFrame(() => {
        progressFrame = 0;
        const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        progress.style.setProperty("--scroll", Math.min(1, Math.max(0, scrollY / max)));
      });
    };
    updateProgress();
    addEventListener("scroll", updateProgress, { passive: true });

    const mobileAmbient =
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(max-width: 820px)").matches;

    if (motionOK) {
      const petalCount = mobileAmbient ? 10 : 24;
      const heartCount = mobileAmbient ? 3 : 9;

      for (let i = 0; i < petalCount; i++) {
        const petal = document.createElement("span");
        petal.className = "ambient-petal";
        petal.style.setProperty("--x", (2 + Math.random() * 96).toFixed(1) + "%");
        petal.style.setProperty("--delay", (-Math.random() * 22).toFixed(2) + "s");
        petal.style.setProperty("--duration", (15 + Math.random() * 17).toFixed(2) + "s");
        petal.style.setProperty("--drift", ((Math.random() - .5) * 180).toFixed(0) + "px");
        petal.style.setProperty("--scale", (.35 + Math.random() * .85).toFixed(2));
        petal.style.setProperty("--blur", (Math.random() * 1.4).toFixed(1) + "px");
        ambient.appendChild(petal);
      }

      for (let i = 0; i < heartCount; i++) {
        const heart = document.createElement("span");
        heart.className = "ambient-heart";
        heart.textContent = "♥";
        heart.style.setProperty("--hx", (4 + Math.random() * 92).toFixed(1) + "%");
        heart.style.setProperty("--hy", (7 + Math.random() * 82).toFixed(1) + "%");
        heart.style.setProperty("--hsize", (mobileAmbient ? 28 + Math.random() * 46 : 28 + Math.random() * 88).toFixed(0) + "px");
        heart.style.setProperty("--hblur", (5 + Math.random() * 9).toFixed(0) + "px");
        heart.style.setProperty("--hopacity", (.025 + Math.random() * .05).toFixed(3));
        heart.style.setProperty("--hdelay", (-Math.random() * 14).toFixed(2) + "s");
        ambient.appendChild(heart);
      }
    }
    document.body.appendChild(ambient);

    if (finePointer && glow) {
      let pointerFrame = 0;
      let px = -1000, py = -1000;
      window.addEventListener("pointermove", event => {
        px = event.clientX; py = event.clientY;
        if (pointerFrame) return;
        pointerFrame = requestAnimationFrame(() => {
          pointerFrame = 0;
          glow.style.setProperty("--gx", px + "px");
          glow.style.setProperty("--gy", py + "px");
        });
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

  function setupVenueJourney() {
    const config = window.WEDDING_VENUE;
    const section = document.getElementById("venue-journey");
    if (!config || !section) return;

    const venueName = document.getElementById("venue-name");
    const address = document.getElementById("venue-address");
    const note = document.getElementById("venue-note");
    const mapTitle = document.getElementById("venue-map-title");
    const immersiveName = document.getElementById("venue-immersive-name");
    const mapFrame = document.getElementById("venue-map-frame");
    const form = document.getElementById("venue-route-form");
    const originInput = document.getElementById("venue-origin");
    const useLocation = document.getElementById("venue-use-location");
    const openMaps = document.getElementById("venue-open-maps");
    const status = document.getElementById("venue-route-status");
    const modeWrap = document.getElementById("venue-travel-modes");
    const scene = document.getElementById("venue-immersive-scene");
    const photo = document.getElementById("venue-immersive-photo");
    const tiltButton = document.getElementById("venue-tilt-button");

    let travelMode = "driving";
    let geoOrigin = "";
    let routePreviewed = false;
    let tiltEnabled = false;
    let baseBeta = null;
    let baseGamma = null;
    let smoothX = 0;
    let smoothY = 0;
    let tiltFrame = 0;

    const destination = config.mapsQuery || config.address || config.name;
    const encodedDestination = encodeURIComponent(destination);

    if (venueName) venueName.textContent = config.shortName || config.name;
    if (address) address.textContent = config.address;
    if (note) note.textContent = config.note || "";
    if (mapTitle) mapTitle.textContent = config.name;
    if (immersiveName) immersiveName.textContent = String(config.shortName || config.name).toUpperCase();

    let venueAssetsLoaded = false;
    function ensureVenueAssets() {
      if (venueAssetsLoaded) return;
      venueAssetsLoaded = true;
      if (photo && config.heroImage) photo.style.backgroundImage = 'url("' + config.heroImage + '")';
      if (mapFrame && !mapFrame.getAttribute("src")) mapFrame.src = destinationEmbed();
    }

    if ("IntersectionObserver" in window) {
      const venueObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        ensureVenueAssets();
        venueObserver.disconnect();
      }, { rootMargin: "500px 0px" });
      venueObserver.observe(section);
    } else {
      ensureVenueAssets();
    }

    function modeFlag(mode) {
      return mode === "walking" ? "w" : mode === "transit" ? "r" : "d";
    }

    function currentOrigin() {
      return geoOrigin || originInput?.value.trim() || "";
    }

    function mapsDirectionsUrl(origin = currentOrigin()) {
      const params = new URLSearchParams({
        api: "1",
        destination,
        travelmode: travelMode,
      });
      if (origin) params.set("origin", origin);
      return "https://www.google.com/maps/dir/?" + params.toString();
    }

    function destinationEmbed() {
      return "https://www.google.com/maps?q=" + encodedDestination + "&output=embed";
    }

    function routeEmbed(origin) {
      return "https://www.google.com/maps?output=embed&saddr=" +
        encodeURIComponent(origin) + "&daddr=" + encodedDestination +
        "&dirflg=" + modeFlag(travelMode);
    }

    function updateMapsLink() {
      if (openMaps) openMaps.href = mapsDirectionsUrl();
    }

    updateMapsLink();

    originInput?.addEventListener("input", () => {
      geoOrigin = "";
      routePreviewed = false;
      updateMapsLink();
      if (status) status.textContent = "Ready to preview your route.";
    });

    modeWrap?.querySelectorAll("[data-travel-mode]").forEach(button => {
      button.addEventListener("click", () => {
        travelMode = button.dataset.travelMode || "driving";
        modeWrap.querySelectorAll("[data-travel-mode]").forEach(node =>
          node.classList.toggle("active", node === button)
        );
        updateMapsLink();
        const origin = currentOrigin();
        if (routePreviewed && origin && mapFrame) {
          mapFrame.src = routeEmbed(origin);
          if (status) status.textContent =
            "Updated " + travelMode + " route preview to " + config.shortName + ".";
        }
      });
    });

    form?.addEventListener("submit", event => {
      event.preventDefault();
      const origin = currentOrigin();
      if (!origin) {
        if (status) status.textContent = "Enter where you're coming from first.";
        originInput?.focus();
        return;
      }
      routePreviewed = true;
      ensureVenueAssets();
      const loaderToken = WeddingUI.begin("Building your route…", "Loading the map preview.", { blocking: false, delay: 180 });
      if (mapFrame) {
        const done = () => WeddingUI.end(loaderToken);
        mapFrame.addEventListener("load", done, { once: true });
        setTimeout(done, 7000);
        mapFrame.src = routeEmbed(origin);
      } else {
        WeddingUI.end(loaderToken);
      }
      updateMapsLink();
      if (status) {
        status.textContent =
          "Showing a " + travelMode + " route preview. Open Maps for live traffic and turn-by-turn navigation.";
      }
      mapFrame?.scrollIntoView({ behavior: motionOK ? "smooth" : "auto", block: "nearest" });
    });

    useLocation?.addEventListener("click", () => {
      if (!navigator.geolocation) {
        if (status) status.textContent = "Location access isn't available in this browser. Type your starting point instead.";
        return;
      }
      useLocation.disabled = true;
      if (status) status.textContent = "Requesting your current location…";
      const locationLoader = WeddingUI.begin("Finding your location…", "Your browser may ask for location permission.", { blocking: false, delay: 180 });

      navigator.geolocation.getCurrentPosition(position => {
        geoOrigin = position.coords.latitude.toFixed(6) + "," + position.coords.longitude.toFixed(6);
        if (originInput) originInput.value = "Current location";
        routePreviewed = true;
        ensureVenueAssets();
        if (mapFrame) mapFrame.src = routeEmbed(geoOrigin);
        updateMapsLink();
        if (status) {
          status.textContent =
            "Current location added. Open Maps for live traffic and turn-by-turn navigation.";
        }
        useLocation.disabled = false;
        WeddingUI.end(locationLoader);
      }, error => {
        geoOrigin = "";
        if (status) {
          status.textContent = error.code === 1
            ? "Location permission was not granted. You can type your starting point instead."
            : "We couldn't get your location. Type your starting point instead.";
        }
        useLocation.disabled = false;
        WeddingUI.end(locationLoader);
      }, {
        enableHighAccuracy: false,
        timeout: 9000,
        maximumAge: 120000,
      });
    });

    function paintVenueMotion(x, y) {
      if (!scene) return;
      scene.style.setProperty("--venue-x", x.toFixed(3));
      scene.style.setProperty("--venue-y", y.toFixed(3));
      scene.style.setProperty("--venue-shift-x", (x * -34).toFixed(1) + "px");
      scene.style.setProperty("--venue-shift-y", (y * -22).toFixed(1) + "px");
      scene.style.setProperty("--venue-near-x", (x * 24).toFixed(1) + "px");
      scene.style.setProperty("--venue-near-y", (y * 15).toFixed(1) + "px");
      scene.style.setProperty("--venue-far-x", (x * -13).toFixed(1) + "px");
      scene.style.setProperty("--venue-far-y", (y * -8).toFixed(1) + "px");
      scene.classList.toggle("is-looking", Math.abs(x) + Math.abs(y) > .05);
    }

    if (scene && finePointer && motionOK) {
      scene.addEventListener("pointermove", event => {
        const rect = scene.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - .5) * 2;
        const y = ((event.clientY - rect.top) / rect.height - .5) * 2;
        paintVenueMotion(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
      });
      scene.addEventListener("pointerleave", () => paintVenueMotion(0, 0));
    }

    const orientationSupported = motionOK && window.isSecureContext &&
      typeof window.DeviceOrientationEvent !== "undefined";
    const mobileLike = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

    function resetVenueTilt() {
      baseBeta = null;
      baseGamma = null;
      smoothX = 0;
      smoothY = 0;
      paintVenueMotion(0, 0);
    }

    function onVenueOrientation(event) {
      if (!tiltEnabled || document.body.dataset.activeView !== "home") return;
      if (typeof event.beta !== "number" || typeof event.gamma !== "number") return;
      if (baseBeta === null || baseGamma === null) {
        baseBeta = event.beta;
        baseGamma = event.gamma;
        return;
      }

      const targetX = Math.max(-1, Math.min(1, (event.gamma - baseGamma) / 24));
      const targetY = Math.max(-1, Math.min(1, (event.beta - baseBeta) / 30));
      smoothX += (targetX - smoothX) * .14;
      smoothY += (targetY - smoothY) * .14;

      if (!tiltFrame) {
        tiltFrame = requestAnimationFrame(() => {
          tiltFrame = 0;
          paintVenueMotion(smoothX, smoothY);
        });
      }
    }

    if (tiltButton && orientationSupported && mobileLike) {
      tiltButton.hidden = false;
      tiltButton.addEventListener("click", async () => {
        if (tiltEnabled) {
          tiltEnabled = false;
          window.removeEventListener("deviceorientation", onVenueOrientation);
          resetVenueTilt();
          tiltButton.classList.remove("is-on");
          tiltButton.setAttribute("aria-pressed", "false");
          tiltButton.querySelector("strong").textContent = "Enable venue tilt";
          return;
        }

        tiltButton.disabled = true;
        try {
          if (typeof DeviceOrientationEvent.requestPermission === "function") {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== "granted") throw new Error("Motion permission not granted");
          }
          tiltEnabled = true;
          resetVenueTilt();
          window.addEventListener("deviceorientation", onVenueOrientation, { passive: true });
          tiltButton.classList.add("is-on");
          tiltButton.setAttribute("aria-pressed", "true");
          tiltButton.querySelector("strong").textContent = "Venue tilt is on";
        } catch {
          tiltButton.querySelector("strong").textContent = "Motion not enabled";
        } finally {
          tiltButton.disabled = false;
        }
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && tiltEnabled) resetVenueTilt();
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
    document.dispatchEvent(new CustomEvent("wedding:view-change", { detail: { view } }));
  }

  async function switchView(next) {
    const requested = next.startsWith("camera/") ? "camera" : next;
    const view = views.has(requested) ? requested : "home";

    if (activeView !== null && view !== activeView && viewTransitionsOK && document.startViewTransition) {
      document.startViewTransition(() => applyView(view));
    } else {
      applyView(view);
    }
    activeView = view;

    try {
      await ensureViewModule(view);
    } catch (error) {
      console.error("Could not load " + view + " module", error);
      const fallback =
        view === "planner" ? document.getElementById("planner-access-message") :
        view === "camera" ? document.getElementById("invitation-status") :
        document.getElementById("firebase-status");
      if (fallback) fallback.textContent = "This section could not finish loading. Please refresh and try again.";
    }
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
      document.body.classList.remove("camera-landscape");
      return;
    }
    configureCameraSession(event.detail);
    updateCameraOrientation();
  });

  const plannerWorkspace = document.getElementById("planner-workspace");
  if (plannerWorkspace && "MutationObserver" in window) {
    let plannerRefreshQueued = false;
    new MutationObserver(() => {
      if (plannerRefreshQueued) return;
      plannerRefreshQueued = true;
      requestAnimationFrame(() => {
        plannerRefreshQueued = false;
        refreshInteractions(plannerWorkspace);
      });
    }).observe(plannerWorkspace, { childList: true });
  }

  createAmbience();
  setupVenueJourney();
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