const cfg = window.SPOTIFY_CONFIG || {};
const clientId = cfg.clientId;
const redirectUri = `${location.origin}${location.pathname}`;
const scopes = ["user-read-currently-playing", "user-read-playback-state"];

const loginPanel = document.getElementById("loginPanel");
const playerPanel = document.getElementById("playerPanel");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const albumArt = document.getElementById("albumArt");
const trackName = document.getElementById("trackName");
const artistName = document.getElementById("artistName");
const progressFill = document.getElementById("progressFill");
const elapsed = document.getElementById("elapsed");
const duration = document.getElementById("duration");
const background = document.getElementById("background");

let pollTimer = null;
let localProgressTimer = null;
let currentProgress = 0;
let currentDuration = 0;
let isPlaying = false;

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, v => chars[v % chars.length]).join("");
}

async function sha256(value) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function login() {
  if (!clientId || clientId.includes("PASTE_")) {
    alert("Add your Spotify Client ID to config.js first.");
    return;
  }

  const verifier = randomString();
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem("pkce_verifier", verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    show_dialog: "true"
  });

  location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeCode(code) {
  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) throw new Error("Missing PKCE verifier. Please reconnect.");

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const token = await res.json();
  saveToken(token);
  sessionStorage.removeItem("pkce_verifier");
  history.replaceState({}, document.title, redirectUri);
}

function saveToken(token) {
  localStorage.setItem("spotify_token", JSON.stringify({
    access_token: token.access_token,
    refresh_token: token.refresh_token || getToken()?.refresh_token,
    expires_at: Date.now() + (token.expires_in * 1000) - 60000
  }));
}

function getToken() {
  try { return JSON.parse(localStorage.getItem("spotify_token")); }
  catch { return null; }
}

async function refreshToken() {
  const token = getToken();
  if (!token?.refresh_token) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: token.refresh_token
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) {
    logout();
    return null;
  }

  const updated = await res.json();
  saveToken(updated);
  return getToken();
}

async function validAccessToken() {
  let token = getToken();
  if (!token) return null;
  if (Date.now() >= token.expires_at) token = await refreshToken();
  return token?.access_token || null;
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function updateProgress() {
  const pct = currentDuration ? Math.min(100, currentProgress / currentDuration * 100) : 0;
  progressFill.style.width = `${pct}%`;
  elapsed.textContent = formatTime(currentProgress);
  duration.textContent = formatTime(currentDuration);
}

function startLocalClock() {
  clearInterval(localProgressTimer);
  localProgressTimer = setInterval(() => {
    if (isPlaying && currentProgress < currentDuration) {
      currentProgress += 1000;
      updateProgress();
    }
  }, 1000);
}

function showPlayer() {
  loginPanel.classList.add("hidden");
  playerPanel.classList.remove("hidden");
}

function showLogin() {
  playerPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
}

function showIdle(message = "Nothing playing") {
  showPlayer();
  trackName.textContent = message;
  artistName.textContent = "Start Spotify on another device";
  currentProgress = 0;
  currentDuration = 0;
  isPlaying = false;
  updateProgress();
}

async function loadPlayback() {
  const accessToken = await validAccessToken();
  if (!accessToken) {
    showLogin();
    return;
  }

  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (res.status === 204) {
    showIdle();
    return;
  }

  if (res.status === 401) {
    await refreshToken();
    return;
  }

  if (res.status === 403) {
    showIdle("Spotify denied access");
    artistName.textContent = "Check Premium status and app-user access";
    return;
  }

  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After") || 10);
    clearInterval(pollTimer);
    setTimeout(startPolling, retry * 1000);
    return;
  }

  if (!res.ok) {
    showIdle(`Spotify error ${res.status}`);
    return;
  }

  const data = await res.json();
  const item = data.item;
  if (!item) {
    showIdle();
    return;
  }

  showPlayer();
  const image = item.album?.images?.[0]?.url || item.images?.[0]?.url || "";
  const artists = item.artists?.map(a => a.name).join(", ") || item.show?.name || "";

  trackName.textContent = item.name || "Unknown title";
  artistName.textContent = artists;
  albumArt.src = image;
  albumArt.style.visibility = image ? "visible" : "hidden";
  if (image) background.style.backgroundImage = `url("${image}")`;

  currentProgress = data.progress_ms || 0;
  currentDuration = item.duration_ms || 0;
  isPlaying = !!data.is_playing;
  updateProgress();
}

function startPolling() {
  clearInterval(pollTimer);
  loadPlayback();
  pollTimer = setInterval(loadPlayback, 5000);
}

function logout() {
  localStorage.removeItem("spotify_token");
  sessionStorage.removeItem("pkce_verifier");
  clearInterval(pollTimer);
  clearInterval(localProgressTimer);
  history.replaceState({}, document.title, redirectUri);
  showLogin();
}

loginButton.addEventListener("click", login);
logoutButton.addEventListener("click", logout);

(async function init() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const error = params.get("error");

  if (error) {
    history.replaceState({}, document.title, redirectUri);
    alert(`Spotify authorization failed: ${error}`);
  }

  if (code) {
    try { await exchangeCode(code); }
    catch (err) {
      console.error(err);
      alert(err.message);
      logout();
      return;
    }
  }

  if (getToken()) {
    showPlayer();
    startLocalClock();
    startPolling();
  } else {
    showLogin();
  }
})();
