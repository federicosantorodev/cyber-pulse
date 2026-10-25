"use strict";

const CACHE_VERSION = "v71";
const CACHE_NAME = `cyber-pulse-shell-${CACHE_VERSION}`;
const VENDOR_CACHE = "cyber-pulse-vendor-v1";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/themes_styles.css",
  "./assets/js/backdrops.js",
  "./assets/js/ui.js",
  "./assets/js/onboarding.js",
  "./assets/js/config.js",
  "./assets/js/api.js",
  "./assets/js/cards.js",
  "./assets/js/frontpage.js",
  "./assets/js/modules/games-more.js",
  "./assets/js/modules/games.js",
  "./assets/js/modules/library.js",
  "./assets/js/modules/sports.js",
  "./assets/js/modules/arena.js",
  "./assets/js/modules/music.js",
  "./assets/js/foryou.js",
  "./assets/js/cache.js",
  "./assets/js/auth.js",
  "./assets/js/ai.js",
  "./assets/js/app.js",
  "./assets/js/feed.js",
  "./assets/js/settings.js",
  "./assets/js/translate.js",
  "./assets/js/shortcuts.js",
  "./assets/js/sync.js",
  "./assets/data/sources-catalog.json",
  "./assets/icons/logo.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // I file non ancora creati non devono impedire l'installazione.
      Promise.allSettled(SHELL_FILES.map((file) => cache.add(file))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith("cyber-pulse-shell-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Solo i file dell'SDK Firebase (versionati, immutabili) restano in cache, così l'accesso funziona anche offline.
  if (url.origin === "https://www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    event.respondWith(cacheFirstVendor(request));
    return;
  }

  // Backend e altri domini non passano mai dalla cache.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirstVendor(request) {
  const cache = await caches.open(VENDOR_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put("./index.html", response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match("./index.html");
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    })
    .catch((error) => {
      if (cached) return cached;
      throw error;
    });

  if (cached) {
    // L'aggiornamento prosegue in background senza ritardare la risposta.
    network.catch(() => {});
    return cached;
  }
  return network;
}
