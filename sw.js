// Cache do "esqueleto" do app para abrir rápido e funcionar sem internet.
// Ao publicar uma versão nova, aumente o número abaixo.
const VERSAO = "gotinhas-v11";
const ARQUIVOS = [
  "./", "index.html", "css/style.css", "js/app.js", "js/store.js", "js/gota.js",
  "js/firebase-config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Arquivos do próprio site: tenta a rede primeiro (pega atualização), cai pro cache se estiver offline.
// Firebase, fontes e afins: deixa passar direto.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});

// ---------------------------------------------------------------- notificações (push)
self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { body: e.data && e.data.text() }; }
  const d = p.data || p.notification || p;
  const titulo = d.title || "Gotinhas";
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: d.body || "Hora de beber água 💧",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: d.tag || "gotinhas",
      renotify: true,
      data: { url: d.url || "./" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) if (c.url.startsWith(self.registration.scope)) return c.focus();
      return self.clients.openWindow(alvo);
    })
  );
});
