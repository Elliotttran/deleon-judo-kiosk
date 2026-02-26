// DeLeon Judo Club — Sign-In Service Worker
const CACHE_NAME = 'deleon-signin-v38';
const STATIC_ASSETS = ['./', './index.html', './logo.svg'];

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyJkdlFVVemzTplXx-6oA3c3EAcrhwjV6eCYe011gWj62DLBImc2WE29mRc4s828kCFMA/exec';
const CHECKIN_TOKEN = '1970';

// ── IndexedDB helpers (mirrors the page — SW can't access localStorage) ───────
const IDB_NAME = 'deleon-queue';
const IDB_STORE = 'queue';
const IDB_VERSION = 1;

function swOpenDB() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = function (e) {
      e.target.result.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror = function (e) { reject(e.target.error); };
  });
}

function swQueueGetAll(db) {
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(IDB_STORE, 'readonly');
    var req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror = function (e) { reject(e.target.error); };
  });
}

function swQueueDelete(db, id) {
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function (e) { reject(e.target.error); };
  });
}

async function swFlushQueue() {
  var db;
  try { db = await swOpenDB(); } catch (e) { return; }
  var items;
  try { items = await swQueueGetAll(db); } catch (e) { return; }
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    try {
      var payload = Object.assign({}, item.payload, { token: CHECKIN_TOKEN });
      var res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) continue;
      var data = await res.json().catch(function () { return {}; });
      if (!data.error) await swQueueDelete(db, item.id);
    } catch (e) {
      // Network error — leave in queue, Chrome will retry the sync event
    }
  }
}

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', function (event) {
  if (event.tag === 'flush-checkins') {
    event.waitUntil(swFlushQueue());
  }
});

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // Google Fonts — cache on first use
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        return fetch(event.request).then(function (response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (c) { c.put(event.request, clone); });
          }
          return response;
        }).catch(function () { return cached; });
      })
    );
    return;
  }

  // API calls — network only (offline handled by app queue)
  if (event.request.method === 'POST' || url.hostname.indexOf('script.google') !== -1) {
    event.respondWith(
      fetch(event.request).catch(function () {
        return new Response(JSON.stringify({ error: 'offline' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Everything else — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(event.request, clone); });
        }
        return response;
      });
    })
  );
});
