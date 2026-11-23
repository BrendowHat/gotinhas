// Cache do "esqueleto" do app para abrir rápido e funcionar sem internet.
// Ao publicar uma versão nova, aumente o número abaixo.
const VERSAO = "gotinhas-v2";
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
