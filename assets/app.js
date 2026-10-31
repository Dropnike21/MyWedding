(() => {
  "use strict";

  const views = new Set(["home", "planner", "camera", "system"]);
  const navButtons = [...document.querySelectorAll("[data-view]")];
  const viewElements = [...document.querySelectorAll(".view")];
  const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  let activeView = null;

  document.documentElement.classList.add("motion-ready");

  const camera = {
    video: document.getElementById("camera-video"),
    image: document.getElementById("camera-capture"),
    idle: document.getElementById("camera-idle"),
    start: document.getElementById("start-camera"),
    take: document.getElementById("take-photo"),
    retake: document.getElementById("retake-photo"),
    save: document.getElementById("save-photo"),
    message: document.getElementById("camera-message"),
    stream: null,
    url: null,
  };

  function stopStream() {
    if (camera.stream) {
      camera.stream.getTracks().forEach((track) => track.stop());
      camera.stream = null;
    }
    camera.video.pause();
    camera.video.srcObject = null;
    camera.video.hidden = true;
  }

  function resetCamera() {
    stopStream();
    if (camera.url) {
      URL.revokeObjectURL(camera.url);
      camera.url = null;
    }
    camera.image.removeAttribute("src");
    camera.image.hidden = true;
    camera.idle.hidden = false;
    camera.start.hidden = false;
    camera.take.hidden = true;
    camera.retake.hidden = true;
    camera.save.hidden = true;
    camera.save.removeAttribute("href");
    camera.message.textContent =
      "Camera access requires your permission and a secure connection (HTTPS).";
  }

  async function startCamera() {
    stopStream();
    camera.message.textContent = "Requesting permission to use your camera…";
    camera.start.disabled = true;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      camera.message.textContent =
        "This browser cannot open a camera here. Use HTTPS on a compatible device.";
      camera.start.disabled = false;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      camera.stream = stream;
      camera.video.srcObject = stream;
      camera.video.hidden = false;
      camera.image.hidden = true;
      camera.idle.hidden = true;
      await camera.video.play();
      camera.message.textContent =
        "Camera preview is active. Take a test photo—nothing will be uploaded.";
      camera.start.hidden = true;
      camera.take.hidden = false;
      camera.retake.hidden = true;
      camera.save.hidden = true;
    } catch (error) {
      stopStream();
      const name = error && error.name;
      camera.message.textContent =
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Camera access was denied. Allow camera permission in your browser settings to try again."
          : name === "NotFoundError"
            ? "No camera was detected on this device."
            : "The camera could not start. Another app may be using it.";
    } finally {
      camera.start.disabled = false;
    }
  }

  async function captureTestPhoto() {
    const video = camera.video;
    if (!camera.stream || !video.videoWidth || !video.videoHeight) {
      camera.message.textContent = "The camera is not ready yet. Try again.";
      return;
    }

    const maxWidth = 1600;
    const factor = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * factor);
    canvas.height = Math.round(video.videoHeight * factor);
    const context = canvas.getContext("2d");
    if (!context) {
      camera.message.textContent = "Photo capture is unavailable in this browser.";
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photo = await new Promise(resolve =>
      canvas.toBlob(resolve, "image/jpeg", 0.86)
    );
    if (!photo) {
      camera.message.textContent = "Photo capture failed. Try again.";
      return;
    }

    if (camera.url) URL.revokeObjectURL(camera.url);
    camera.url = URL.createObjectURL(photo);
    stopStream();
    camera.image.src = camera.url;
    camera.image.hidden = false;
    camera.idle.hidden = true;
    camera.take.hidden = true;
    camera.start.hidden = true;
    camera.retake.hidden = false;
    camera.save.hidden = false;
    camera.save.href = camera.url;
    camera.message.textContent =
      "Test photo captured! It remains on this device. Download it or retake.";
  }

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
      iframe.title = "I Like You So Much, You'll Know It — Ysabelle Cuevas on Spotify";
      iframe.src = "https://open.spotify.com/embed/album/5eXyaK1VO670evooLOqgK7?utm_source=generator&theme=0";
      iframe.width = "100%";
      iframe.height = "152";
      iframe.loading = "lazy";
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
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

  camera.start.addEventListener("click", startCamera);
  camera.take.addEventListener("click", captureTestPhoto);
  camera.retake.addEventListener("click", resetCamera);
  window.addEventListener("hashchange", () => switchView(location.hash.slice(1)));
  window.addEventListener("pagehide", stopStream);

  const plannerWorkspace = document.getElementById("planner-workspace");
  if (plannerWorkspace && "MutationObserver" in window) {
    new MutationObserver(() => requestAnimationFrame(() => refreshInteractions(plannerWorkspace)))
      .observe(plannerWorkspace, { childList: true, subtree: true });
  }

  createAmbience();
  const closeHomeMusic = setupHomeMusic();
  setupHeroParallax();
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