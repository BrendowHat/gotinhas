import { conectar, conectado, carregar, doCache, importarHistoricoAntigo, chaveDia } from "./api.js";
import { SITE_URL } from "./config.js";

const TICK = "gotinhas-tick";

function garantirAlarme() {
  chrome.alarms.get(TICK, (a) => { if (!a) chrome.alarms.create(TICK, { delayInMinutes: 1, periodInMinutes: 15 }); });
}
chrome.runtime.onInstalled.addListener(() => { garantirAlarme(); atualizarIcone(); });
chrome.runtime.onStartup.addListener(() => { garantirAlarme(); atualizarIcone(); });

// ------------------------------------------------------------------ ícone com % e verde quando bate a meta
async function atualizarIcone(dados) {
  try {
    dados = dados || (await doCache());
    const hoje = dados?.semana?.find((d) => d.k === chaveDia())?.eu;
    if (!hoje) { chrome.action.setBadgeText({ text: "" }); return; }
    const pct = hoje.metaMl > 0 ? Math.min(100, Math.round((hoje.totalMl / hoje.metaMl) * 100)) : 0;
    const feito = hoje.totalMl >= hoje.metaMl;
    const s = feito ? "-green" : "";
    await chrome.action.setIcon({ path: { 16: `icons/icon16${s}.png`, 48: `icons/icon48${s}.png`, 128: `icons/icon128${s}.png` } }).catch(() => {});
    chrome.action.setBadgeText({ text: feito ? "OK" : pct > 0 ? `${pct}%` : "" });
    chrome.action.setBadgeBackgroundColor({ color: feito ? "#2E7D32" : "#1B5FBF" });
  } catch {}
}

// ------------------------------------------------------------------ lembretes no PC
const paraMin = (hhmm = "00:00") => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

async function talvezLembrar() {
  const { lembretesPC = true, ultimoLembrete = 0 } = await chrome.storage.local.get(["lembretesPC", "ultimoLembrete"]);
  if (!lembretesPC || !(await conectado())) return;
  const dados = await carregar();
  await atualizarIcone(dados);
  const p = dados.perfil;
  const agora = new Date();
  const min = agora.getHours() * 60 + agora.getMinutes();
  const ini = paraMin(p.inicio);
  let fim = paraMin(p.fim);
  if (fim <= ini) fim += 1440; // passa da meia-noite
  const m = min < ini ? min + 1440 : min;
  if (m < ini || m > fim) return;
  const intervalo = [60, 120, 180].includes(p.intervaloMin) ? p.intervaloMin : 60;
  if (Date.now() - ultimoLembrete < (intervalo - 5) * 60000) return;
  const hoje = dados.semana.find((d) => d.k === chaveDia()).eu;
  if (hoje.totalMl >= hoje.metaMl) return;
  const pct = Math.round((hoje.totalMl / hoje.metaMl) * 100);
  const dela = dados.semana.find((d) => d.k === chaveDia()).ela;
  const extra = dela && dela.totalMl >= dela.metaMl ? ` ${dados.perfilDela?.nome || "Sua dupla"} já bateu a meta 😉` : "";
  chrome.notifications.create(`lembrete-${Date.now()}`, {
    type: "basic", iconUrl: "icons/icon128.png", priority: 2,
    title: "Hora de beber água 💧",
    message: `${hoje.totalMl} de ${hoje.metaMl} ml (${pct}%). Faltam ${hoje.metaMl - hoje.totalMl} ml até ${p.fim}.${extra}`,
  });
  await chrome.storage.local.set({ ultimoLembrete: Date.now() });
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === TICK) talvezLembrar().catch(() => {}); });
chrome.notifications.onClicked.addListener((id) => { chrome.tabs.create({ url: SITE_URL }); chrome.notifications.clear(id); });

// ------------------------------------------------------------------ mensagens (site → extensão, popup → background)
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo === "token-extensao") {
    (async () => {
      try {
        await conectar(msg.token);
        const importados = await importarHistoricoAntigo().catch(() => 0);
        const dados = await carregar();
        await atualizarIcone(dados);
        garantirAlarme();
        responder({ ok: true, importados });
      } catch (e) {
        responder({ ok: false, erro: String(e.message || e) });
      }
    })();
    return true;
  }
  if (msg?.tipo === "atualizar-icone") { atualizarIcone(msg.dados); return false; }
  return false;
});
