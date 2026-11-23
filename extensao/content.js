// Ponte entre o site e a extensão: o site manda o token de conexão, a extensão guarda.
window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const d = ev.data;
  if (!d || d.fonte !== "gotinhas-site" || d.tipo !== "token-extensao" || typeof d.token !== "string") return;
  chrome.runtime.sendMessage({ tipo: "token-extensao", token: d.token }, (r) => {
    window.postMessage({ fonte: "gotinhas-ext", tipo: r && r.ok ? "ok" : "erro" }, location.origin);
  });
});
