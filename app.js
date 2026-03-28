// /app.js

/**
 * Very simple fullscreen signage player.
 *
 * Supported playlist items:
 * - { "type": "image", "src": "/media/file.jpg", "duration": 8000 }
 * - { "type": "video", "src": "/media/file.mp4" }
 *
 * Optional fields:
 * - "fit": "contain" | "cover"
 * - "muted": true | false   // for videos, defaults to true
 *
 * Keyboard controls:
 * - Right arrow: next item
 * - Left arrow: previous item
 * - Space: pause/resume image timers or video playback
 * - D: toggle debug HUD
 * - F: request fullscreen
 * - M: toggle mute for current video
 * - R: reload playlist
 */

(() => {
  const PLAYLIST_URL = "./playlist.json";

  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const imageEl = document.getElementById("imagePlayer");
  const videoEl = document.getElementById("videoPlayer");
  const debugHudEl = document.getElementById("debugHud");

  /** @type {Array<any>} */
  let playlist = [];
  let currentIndex = 0;
  let imageTimer = null;
  let isPaused = false;
  let debugEnabled = false;

  function showLoading(message = "Loading playlist...") {
    loadingEl.textContent = message;
    loadingEl.classList.add("visible");
  }

  function hideLoading() {
    loadingEl.classList.remove("visible");
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    errorEl.classList.add("visible");
  }

  function hideError() {
    errorEl.hidden = true;
    errorEl.classList.remove("visible");
    errorEl.textContent = "";
  }

  function clearImageTimer() {
    if (imageTimer) {
      clearTimeout(imageTimer);
      imageTimer = null;
    }
  }

  function hideAllMedia() {
    imageEl.classList.add("media-hidden");
    imageEl.setAttribute("aria-hidden", "true");

    videoEl.classList.add("media-hidden");
    videoEl.setAttribute("aria-hidden", "true");
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
  }

  function normalizePlaylistItem(item, index) {
    if (!item || typeof item !== "object") {
      throw new Error(`Playlist item ${index} is not an object.`);
    }

    if (!item.type || !item.src) {
      throw new Error(`Playlist item ${index} must include "type" and "src".`);
    }

    if (item.type !== "image" && item.type !== "video") {
      throw new Error(`Playlist item ${index} has invalid type "${item.type}".`);
    }

    if (item.type === "image") {
      const duration = Number(item.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(
          `Playlist image item ${index} must include a positive "duration" in milliseconds.`
        );
      }
    }

    return {
      type: item.type,
      src: item.src,
      duration: item.type === "image" ? Number(item.duration) : null,
      fit: item.fit === "cover" ? "cover" : "contain",
      muted: typeof item.muted === "boolean" ? item.muted : true,
    };
  }

  async function loadPlaylist() {
    showLoading("Loading playlist...");
    hideError();

    const cacheBust = `cb=${Date.now()}`;
    const url = PLAYLIST_URL.includes("?")
      ? `${PLAYLIST_URL}&${cacheBust}`
      : `${PLAYLIST_URL}?${cacheBust}`;

    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Failed to fetch playlist.json (${response.status})`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Playlist is empty or invalid.");
    }

    playlist = data.map(normalizePlaylistItem);

    if (currentIndex >= playlist.length) {
      currentIndex = 0;
    }

    hideLoading();
    updateDebugHud();
  }

  function updateDebugHud(extra = "") {
    if (!debugEnabled) {
      debugHudEl.hidden = true;
      return;
    }

    const item = playlist[currentIndex];
    const lines = [
      `Index: ${currentIndex + 1}/${playlist.length || 0}`,
      item ? `Type: ${item.type}` : "Type: n/a",
      item ? `Src: ${item.src}` : "Src: n/a",
      item && item.type === "image" ? `Duration: ${item.duration} ms` : "",
      item && item.type === "video" ? `Muted: ${videoEl.muted}` : "",
      `Paused: ${isPaused}`,
      extra || "",
    ].filter(Boolean);

    debugHudEl.textContent = lines.join("\n");
    debugHudEl.hidden = false;
  }

  function nextIndex() {
    if (!playlist.length) return 0;
    return (currentIndex + 1) % playlist.length;
  }

  function prevIndex() {
    if (!playlist.length) return 0;
    return (currentIndex - 1 + playlist.length) % playlist.length;
  }

  function scheduleNextImage(duration) {
    clearImageTimer();

    if (isPaused) {
      return;
    }

    imageTimer = setTimeout(() => {
      goToIndex(nextIndex());
    }, duration);
  }

  function preloadImage(src) {
    const img = new Image();
    img.src = src;
  }

  function preloadUpcoming() {
    if (!playlist.length) return;

    const nextItem = playlist[nextIndex()];
    if (!nextItem) return;

    if (nextItem.type === "image") {
      preloadImage(nextItem.src);
    }
  }

  function setFit(element, fit) {
    element.style.objectFit = fit === "cover" ? "cover" : "contain";
  }

  function playImage(item) {
    hideAllMedia();
    hideError();
    clearImageTimer();

    setFit(imageEl, item.fit);
    imageEl.alt = "";
    imageEl.src = item.src;
    imageEl.onload = () => {
      preloadUpcoming();
    };
    imageEl.onerror = () => {
      showError(`Failed to load image: ${item.src}`);
      setTimeout(() => {
        goToIndex(nextIndex());
      }, 2000);
    };

    imageEl.classList.remove("media-hidden");
    imageEl.setAttribute("aria-hidden", "false");

    scheduleNextImage(item.duration);
    updateDebugHud();
  }

  function playVideo(item) {
    hideAllMedia();
    hideError();
    clearImageTimer();

    setFit(videoEl, item.fit);
    videoEl.muted = item.muted;
    videoEl.loop = false;
    videoEl.controls = false;
    videoEl.src = item.src;

    videoEl.onended = () => {
      if (!isPaused) {
        goToIndex(nextIndex());
      }
    };

    videoEl.onerror = () => {
      showError(`Failed to load video: ${item.src}`);
      setTimeout(() => {
        goToIndex(nextIndex());
      }, 2000);
    };

    videoEl.onloadeddata = () => {
      preloadUpcoming();
    };

    videoEl.classList.remove("media-hidden");
    videoEl.setAttribute("aria-hidden", "false");

    if (!isPaused) {
      videoEl
        .play()
        .catch(() => {
          showError(`Autoplay failed for video: ${item.src}`);
        });
    }

    updateDebugHud();
  }

  function playCurrent() {
    if (!playlist.length) {
      showError("Playlist is empty.");
      return;
    }

    const item = playlist[currentIndex];
    if (!item) {
      showError("Current playlist item is invalid.");
      return;
    }

    if (item.type === "image") {
      playImage(item);
      return;
    }

    if (item.type === "video") {
      playVideo(item);
      return;
    }

    showError(`Unsupported media type: ${item.type}`);
  }

  function goToIndex(index) {
    clearImageTimer();

    if (!playlist.length) {
      currentIndex = 0;
      return;
    }

    currentIndex = ((index % playlist.length) + playlist.length) % playlist.length;
    isPaused = false;
    playCurrent();
  }

  function next() {
    goToIndex(nextIndex());
  }

  function previous() {
    goToIndex(prevIndex());
  }

  function togglePause() {
    if (!playlist.length) return;

    const item = playlist[currentIndex];
    isPaused = !isPaused;

    if (item.type === "image") {
      if (!isPaused) {
        scheduleNextImage(item.duration);
      } else {
        clearImageTimer();
      }
    }

    if (item.type === "video") {
      if (isPaused) {
        videoEl.pause();
      } else {
        videoEl.play().catch(() => {
          showError(`Could not resume video: ${item.src}`);
        });
      }
    }

    updateDebugHud();
  }

  function toggleMute() {
    const item = playlist[currentIndex];
    if (!item || item.type !== "video") return;

    videoEl.muted = !videoEl.muted;
    updateDebugHud();
  }

  async function requestFullscreen() {
    const root = document.documentElement;

    try {
      if (!document.fullscreenElement && root.requestFullscreen) {
        await root.requestFullscreen();
      }
    } catch (error) {
      showError(`Fullscreen request failed: ${error.message}`);
    }
  }

  async function reloadAll() {
    clearImageTimer();
    hideAllMedia();
    showLoading("Reloading playlist...");

    try {
      await loadPlaylist();
      playCurrent();
    } catch (error) {
      showError(error.message);
      hideLoading();
      updateDebugHud(error.message);
    }
  }

  function attachKeyboardControls() {
    window.addEventListener("keydown", async (event) => {
      switch (event.key) {
        case "ArrowRight":
          next();
          break;
        case "ArrowLeft":
          previous();
          break;
        case " ":
          event.preventDefault();
          togglePause();
          break;
        case "d":
        case "D":
          debugEnabled = !debugEnabled;
          updateDebugHud();
          break;
        case "f":
        case "F":
          await requestFullscreen();
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "r":
        case "R":
          await reloadAll();
          break;
        default:
          break;
      }
    });
  }

  async function init() {
    attachKeyboardControls();

    try {
      await loadPlaylist();
      playCurrent();
    } catch (error) {
      showError(error.message);
      hideLoading();
      updateDebugHud(error.message);
    }
  }

  init();
})();
