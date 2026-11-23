import { conectado, carregar, doCache, adicionar, desconectar, chaveDia } from "./api.js";
import { gotaSVG, humorDe, HUMOR_TEXTO, CORACAO_SVG } from "./gota.js";
import { SITE_URL } from "./config.js";

const $ = document.getElementById("app");
let dados = null;
let ocupado = false;
let erro = "";
let offline = false;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function telaConectar() {
  $.innerHTML = `
    <div class="linha" style="justify-content:center;gap:14px;padding-top:8px">${gotaSVG("azul", "feliz", 7)}${CORACAO_SVG("#F28DB2", 28)}${gotaSVG("rosa", "feliz", 7)}</div>
    <h1 style="text-align:center;font-size:14px">Gotinhas</h1>
    <p style="text-align:center">Conecte a extensão à sua conta do site pra registrar água daqui e ver a sua dupla.</p>
    <button class="btn prim" id="conectar">Conectar com minha conta</button>
    <p class="sub" style="font-size:13px;text-align:center">Vai abrir o site. Se pedir login, entre e espere aparecer “Extensão conectada”.</p>`;
  document.getElementById("conectar").onclick = () => chrome.tabs.create({ url: `${SITE_URL}#/conectar-extensao` });
}

function render() {
  if (!dados) return;
  const { perfil, perfilDela, semana } = dados;
  const hoje = semana.find((d) => d.k === chaveDia()) || semana[semana.length - 1];
  const eu = hoje.eu;
  const pct = eu.metaMl > 0 ? Math.min(100, Math.round((eu.totalMl / eu.metaMl) * 100)) : 0;
  const feito = eu.totalMl >= eu.metaMl;
  const humor = humorDe(eu.totalMl, eu.metaMl, perfil.inicio, perfil.fim);
  const ela = hoje.ela;
  const pctEla = ela && ela.metaMl ? Math.min(100, Math.round((ela.totalMl / ela.metaMl) * 100)) : 0;
  const nomeEla = esc(perfilDela?.nome || "Ela");

  $.innerHTML = `
    <header class="linha">
      ${gotaSVG(perfil.cor, humor, 3)}
      <h1 class="cresce">Gotinhas</h1>
      <span class="chip ${offline ? "offline" : "ok"}">${offline ? "sem internet" : "sincronizado"}</span>
    </header>
    <section class="caixa sombra linha" style="gap:16px">
      <div class="copo" role="img" aria-label="Copo ${pct}% cheio"><div class="agua ${feito ? "cheia" : ""}" style="height:${pct}%"></div><span>${pct}%</span></div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <span class="ml">${eu.totalMl} / ${eu.metaMl} ml</span>
        <span class="sub">${feito ? "Meta batida! 🎉" : `Faltam ${eu.metaMl - eu.totalMl} ml até ${esc(perfil.fim)}`}</span>
        <span class="sub" style="font-size:14px">gotinha ${HUMOR_TEXTO[humor]}</span>
      </div>
    </section>
    <div class="grade3">
      <button class="btn prim" data-ml="${perfil.copoMl}">+copo</button>
      <button class="btn prim" data-ml="500">+500</button>
      <button class="btn" id="btn-outro">+outro</button>
    </div>
    <div class="outro" id="outro" hidden>
      <input type="number" id="outro-ml" min="10" max="3000" step="10" placeholder="ml" aria-label="Quantidade em ml">
      <button class="btn prim" id="outro-ok">OK</button>
    </div>
    ${erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : ""}
    ${ela ? `<section class="caixa rosa linha">
      ${gotaSVG(perfilDela?.cor || "rosa", humorDe(ela.totalMl, ela.metaMl, perfilDela?.inicio, perfilDela?.fim), 3)}
      <span class="cresce">${nomeEla}</span>
      <span>${ela.totalMl} ml · ${pctEla}%${ela.totalMl >= ela.metaMl ? " ★" : ""}</span>
    </section>` : ""}
    <section style="display:flex;flex-direction:column;gap:6px">
      <span class="sub" style="font-size:14px">Últimos 7 dias</span>
      <div class="semana">
        ${semana.map((d) => {
          const both = d.ela && d.eu.registros.length && d.eu.totalMl >= d.eu.metaMl && d.ela.totalMl >= d.ela.metaMl;
          const letra = new Date(d.k + "T12:00").toLocaleDateString("pt-BR", { weekday: "narrow" }).toUpperCase();
          return `<div class="${d.k === chaveDia() ? "hoje" : ""} ${both ? "ambos" : ""}" title="${d.k}: ${d.eu.totalMl} ml"><span>${letra}</span><span style="color:${both ? "#D9467A" : "#CFE6FB"}">♥</span></div>`;
        }).join("")}
      </div>
    </section>
    <div class="rodape">
      <a href="#" id="abrir">Abrir o site ›</a>
      <label class="toggle"><input type="checkbox" id="lembretes"> Lembretes no PC</label>
    </div>
    <div class="rodape"><span class="sub" style="font-size:12px">Mesma conta do site e do celular</span><button id="sair">Desconectar</button></div>`;

  $.querySelectorAll("[data-ml]").forEach((b) => (b.onclick = () => add(Number(b.dataset.ml))));
  document.getElementById("btn-outro").onclick = () => { const o = document.getElementById("outro"); o.hidden = !o.hidden; if (!o.hidden) document.getElementById("outro-ml").focus(); };
  document.getElementById("outro-ok").onclick = () => { const n = parseInt(document.getElementById("outro-ml").value, 10); if (n > 0) add(Math.min(n, 3000)); };
  document.getElementById("outro-ml").onkeydown = (e) => { if (e.key === "Enter") document.getElementById("outro-ok").click(); };
  document.getElementById("abrir").onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: SITE_URL }); };
  document.getElementById("sair").onclick = async () => { await desconectar(); chrome.action.setBadgeText({ text: "" }); telaConectar(); };
  const chk = document.getElementById("lembretes");
  chrome.storage.local.get("lembretesPC").then(({ lembretesPC = true }) => (chk.checked = lembretesPC));
  chk.onchange = () => chrome.storage.local.set({ lembretesPC: chk.checked });
}

async function add(ml) {
  if (ocupado) return;
  ocupado = true; erro = "";
  $.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await adicionar(ml, dados.perfil);
    dados = await carregar();
    offline = false;
    chrome.runtime.sendMessage({ tipo: "atualizar-icone", dados });
  } catch (e) {
    erro = e.message === "desconectado" ? "Sua conexão expirou. Conecte de novo." : "Não deu pra salvar. Confira a internet.";
  }
  ocupado = false;
  render();
}

(async function iniciar() {
  if (!(await conectado())) return telaConectar();
  dados = await doCache();
  if (dados) render();
  try {
    dados = await carregar();
    offline = false;
    chrome.runtime.sendMessage({ tipo: "atualizar-icone", dados });
  } catch (e) {
    if (e.message === "desconectado") return telaConectar();
    offline = true;
  }
  if (dados) render(); else telaConectar();
})();

chrome.storage.onChanged.addListener((mud) => { if (mud.auth?.newValue && !mud.auth.oldValue) location.reload(); });
