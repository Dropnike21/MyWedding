(() => {
  "use strict";
  const views = new Set(["home", "planner", "camera", "system"]);
  const navButtons = [...document.querySelectorAll("[data-view]")];
  const viewElements = [...document.querySelectorAll(".view")];
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
    const photo = await new Promise((resolve) =>
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

  function switchView(next) {
    const requested = next.startsWith("camera/") ? "camera" : next;
    const view = views.has(requested) ? requested : "home";
    viewElements.forEach((section) => {
      const active = section.id === "view-" + view;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
    });
    navButtons.forEach((button) => {
      if (button.dataset.view === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (view !== "camera") resetCamera();
    const title = view === "home" ? "Angela & Joseph" :
      view === "planner" ? "Planning Studio" :
      view === "camera" ? "Photo Time Capsule" : "Project Blueprint";
    document.title = title + " | Wedding";
    window.scrollTo(0, 0);
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

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.go));
  });
  camera.start.addEventListener("click", startCamera);
  camera.take.addEventListener("click", captureTestPhoto);
  camera.retake.addEventListener("click", resetCamera);
  window.addEventListener("hashchange", () => switchView(location.hash.slice(1)));
  window.addEventListener("pagehide", stopStream);

  // This prototype intentionally performs no remote writes or photo uploads.
  // Real wedding-day restrictions must be enforced by Firebase server-side checks.
  countdown();
  setInterval(countdown, 60 * 1000);
  switchView(location.hash.slice(1));
})();