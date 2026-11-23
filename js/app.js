import { criarStore, chaveDia, normalizarDia, PERFIL_PADRAO } from "./store.js";
import { gotaSVG, humorDe, HUMOR_TEXTO, CORACAO_SVG } from "./gota.js";

// ------------------------------------------------------------------ estado
const S = {
  store: null,
  user: null,
  authPronto: false,
  perfil: null,
  dupla: null,
  ela: null,          // uid da outra pessoa
  perfilDela: null,
  dias: {},           // dias[uid][AAAA-MM-DD] = doc
  subs: {},           // assinaturas ativas
  hoje: chaveDia(),
  mesVisto: chaveDia().slice(0, 7),
  folha: null,        // { ml, h } quando a folha "outro valor" está aberta
  login: { modo: "entrar", erro: "" },
  dplErro: "",
  cfgMsg: "",
  pendente: false,
};

const $app = document.getElementById("app");
const $agua = document.getElementById("agua");

// ------------------------------------------------------------------ utilidades
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const agoraHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pctDe = (d) => (d.metaMl > 0 ? Math.min(100, Math.round((d.totalMl / d.metaMl) * 100)) : 0);
const litros = (ml) => (ml / 1000).toFixed(1).replace(".", ",");
const dataDe = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const rotuloDia = (key) => maiuscula(dataDe(key).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }));
const ymDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const ymSomar = (ym, n) => { const [y, m] = ym.split("-").map(Number); return ymDe(new Date(y, m - 1 + n, 1)); };

function perfilDe(uid) {
  if (uid === S.user?.uid) return S.perfil || PERFIL_PADRAO;
  if (uid === S.ela) return S.perfilDela || PERFIL_PADRAO;
  return PERFIL_PADRAO;
}
function diaDe(uid, key) {
  const doc = S.dias[uid]?.[key];
  return { ...normalizarDia(doc, perfilDe(uid).metaMl), existe: !!doc };
}
function bateu(uid, key) {
  const d = diaDe(uid, key);
  return d.existe && d.totalMl >= d.metaMl;
}
function ambos(key) {
  return !!S.ela && bateu(S.user.uid, key) && bateu(S.ela, key);
}
function sequencia() {
  if (!S.ela) return 0;
  let n = 0;
  const d = dataDe(S.hoje);
  if (ambos(S.hoje)) n++;
  for (let i = 0; i < 60; i++) {
    d.setDate(d.getDate() - 1);
    if (ambos(chaveDia(d))) n++;
    else break;
  }
  return n;
}

// ------------------------------------------------------------------ assinaturas
function assinar(chave, fn) {
  if (S.subs[chave]) return;
  S.subs[chave] = fn();
}
function cancelar(prefixo) {
  for (const k of Object.keys(S.subs)) {
    if (k.startsWith(prefixo)) {
      try { S.subs[k]?.(); } catch {}
      delete S.subs[k];
    }
  }
}
function garantirMes(uid, ym) {
  if (!uid) return;
  assinar(`mes|${uid}|${ym}`, () =>
    S.store.ouvirMes(uid, ym, (mapa) => {
      const atual = { ...(S.dias[uid] || {}) };
      for (const k of Object.keys(atual)) if (k.startsWith(ym)) delete atual[k];
      S.dias[uid] = { ...atual, ...mapa };
      render();
    })
  );
}
function garantirMeses() {
  const ymHoje = S.hoje.slice(0, 7);
  for (const uid of [S.user?.uid, S.ela]) {
    if (!uid) continue;
    garantirMes(uid, ymHoje);
    garantirMes(uid, ymSomar(ymHoje, -1));
    garantirMes(uid, S.mesVisto);
  }
}

function aoMudarPerfil(p) {
  const antes = S.perfil?.duplaId;
  S.perfil = p;
  if (p && p.duplaId !== antes) {
    cancelar("dupla|");
    cancelar("ela|");
    S.dupla = null;
    S.ela = null;
    S.perfilDela = null;
    if (p.duplaId) {
      assinar(`dupla|${p.duplaId}`, () =>
        S.store.ouvirDupla(p.duplaId, (d) => {
          S.dupla = d;
          const outra = d?.membros?.find((m) => m !== S.user.uid) || null;
          if (outra && outra !== S.ela) {
            S.ela = outra;
            assinar(`ela|perfil|${outra}`, () => S.store.ouvirPerfilDela(outra, (pp) => { S.perfilDela = pp; render(); }));
            garantirMeses();
          }
          render();
        })
      );
    }
  }
  garantirMeses();
  render();
}

// ------------------------------------------------------------------ gravação
async function mudarRegistros(key, fn) {
  const uid = S.user.uid;
  const d = diaDe(uid, key);
  const regs = fn(d.registros.map((r) => ({ ...r }))).filter((r) => r.ml > 0);
  regs.sort((a, b) => a.h.localeCompare(b.h));
  const totalMl = regs.reduce((a, r) => a + r.ml, 0);
  const metaMl = d.existe ? d.metaMl : S.perfil.metaMl;
  try {
    await S.store.salvarDia(uid, key, { metaMl, registros: regs, totalMl });
  } catch (e) {
    alert("Não deu pra salvar. Confira sua internet e tente de novo.");
  }
}
const adicionar = (ml, h = agoraHHMM(), key = S.hoje) =>
  mudarRegistros(key, (regs) => [...regs, { id: novoId(), h, ml }]);

// ------------------------------------------------------------------ rotas
function rota() {
  const partes = (location.hash.replace(/^#\/?/, "") || "hoje").split("/");
  return { nome: partes[0], arg: partes[1] };
}

// ------------------------------------------------------------------ pedaços de UI
const ICONES = {
  hoje: '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 3 L6 12 L6 16 L8 19 L12 21 L16 19 L18 16 L18 12 Z"/></svg>',
  calendario: '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="6" width="16" height="14"/><path d="M4 10 H20 M8 3 V7 M16 3 V7"/></svg>',
  config: '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7 H20 M4 12 H20 M4 17 H20"/><rect x="7" y="5" width="4" height="4" fill="#fff"/><rect x="14" y="10" width="4" height="4" fill="#fff"/><rect x="9" y="15" width="4" height="4" fill="#fff"/></svg>',
  lapis: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 20 L4 16 L16 4 L20 8 L8 20 Z"/></svg>',
  lixo: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7 M10 11 V16 M14 11 V16"/></svg>',
};

function nav(ativo) {
  const item = (id, href, txt) =>
    `<a href="${href}" class="${ativo === id ? "ativo" : ""}" ${ativo === id ? 'aria-current="page"' : ""}>${ICONES[id]}<span>${txt}</span></a>`;
  return `<nav class="barra-nav" aria-label="Navegação principal">${item("hoje", "#/hoje", "Hoje")}${item("calendario", "#/calendario", "Calendário")}${item("config", "#/config", "Config")}</nav>`;
}

function cartaoPessoa(uid, key = S.hoje) {
  const p = perfilDe(uid);
  const d = diaDe(uid, key);
  const pct = pctDe(d);
  const humor = humorDe(d.totalMl, d.metaMl, p.inicio, p.fim);
  const rosa = p.cor === "rosa";
  return `<section class="caixa sombra pessoa">
    ${gotaSVG(p.cor, humor, 7, `${esc(p.nome)}: ${HUMOR_TEXTO[humor]}`)}
    <span class="nome">${esc(p.nome) || "—"}</span>
    <span>${d.totalMl} / ${d.metaMl} ml</span>
    <div class="barra ${rosa ? "rosa" : ""}"><i style="width:${pct}%"></i></div>
    <span class="humor">${pct}% · ${HUMOR_TEXTO[humor]}</span>
  </section>`;
}

function cartaoEsperando() {
  const cod = S.dupla?.codigo || "";
  return `<section class="caixa sombra pessoa" style="justify-content:center">
    ${gotaSVG("rosa", "normal", 5)}
    <span style="font-size:15px">Esperando sua dupla</span>
    <span class="nome" style="font-size:13px">${esc(cod)}</span>
    <button class="btn" data-acao="compartilhar" style="min-height:40px;font-size:10px">Enviar código</button>
  </section>`;
}

function linhaRegistro(r) {
  const dela = r.uid === S.ela;
  const quem = dela ? esc(perfilDe(S.ela).nome || "ela") : "você";
  return `<div class="registro"><span class="h">${esc(r.h)}</span><span class="cresce">+${r.ml} ml</span><span class="tag ${dela ? "rosa" : ""}">${quem}</span></div>`;
}

function registrosMisturados(key) {
  const lista = [];
  for (const uid of [S.user.uid, S.ela]) {
    if (!uid) continue;
    for (const r of diaDe(uid, key).registros) lista.push({ ...r, uid });
  }
  return lista.sort((a, b) => b.h.localeCompare(a.h));
}

function ajustarAgua(visivel) {
  if (!visivel || !S.perfil) { $agua.style.height = "0"; return; }
  const d = diaDe(S.user.uid, S.hoje);
  const pct = pctDe(d);
  $agua.style.height = Math.max(pct, 3) + "%";
  $agua.classList.toggle("cheia", pct >= 100);
}

// ------------------------------------------------------------------ telas
function telaLogin() {
  const demo = S.store.modo === "demo";
  const criar = S.login.modo === "criar";
  return `<div class="tela">
    <div class="nuvem" style="left:30px;top:70px;width:64px"></div>
    <div class="nuvem" style="right:26px;top:140px;width:80px"></div>
    <div class="centro">
      <div class="linha" style="align-items:flex-end;gap:16px">
        ${gotaSVG("azul", "feliz", 9)}
        <span style="margin-bottom:34px">${CORACAO_SVG("#F28DB2", 40)}</span>
        ${gotaSVG("rosa", "feliz", 9)}
      </div>
      <h1 class="logo">Gotinhas</h1>
      <p style="font-size:20px;max-width:280px">Água em dupla, um gole de cada vez.</p>
    </div>
    ${demo ? `
      <div class="aviso">Modo demo: o Firebase ainda não foi configurado. Tudo fica salvo só neste navegador.</div>
      <button class="btn prim grande" data-acao="login-google">Entrar no modo demo</button>
    ` : `
      <button class="btn prim grande" data-acao="login-google">Entrar com Google</button>
      <div class="separador">ou com e-mail</div>
      <form id="form-login" class="caixa" style="display:flex;flex-direction:column;gap:10px">
        <label class="campo">E-mail<input class="pix" type="email" name="email" autocomplete="email" required style="font-family:var(--corpo);font-size:17px"></label>
        <label class="campo">Senha<input class="pix" type="password" name="senha" minlength="6" autocomplete="${criar ? "new-password" : "current-password"}" required style="font-family:var(--corpo);font-size:17px"></label>
        <button class="btn prim" type="submit">${criar ? "Criar conta" : "Entrar"}</button>
        <button class="btn texto" type="button" data-acao="login-alternar" style="border:none;min-height:40px">${criar ? "Já tenho conta" : "Criar conta com e-mail"}</button>
      </form>
      <p class="sub" style="font-size:15px;text-align:center">No iPhone, com o app instalado, o e-mail é o jeito mais garantido de entrar.</p>
    `}
    <p class="erro" role="alert">${esc(S.login.erro)}</p>
  </div>`;
}

function telaDupla() {
  return `<div class="tela">
    <div style="display:flex;flex-direction:column;gap:8px">
      <h1>Formar dupla</h1>
      <p class="sub">Um de vocês cria a dupla e manda o código. O outro entra com ele.</p>
    </div>
    <label class="campo">Como você quer aparecer?
      <input class="pix" id="dpl-nome" maxlength="30" value="${esc(S.perfil.nome)}" style="font-family:var(--corpo);font-size:17px">
    </label>
    <section class="caixa sombra" style="display:flex;flex-direction:column;gap:12px">
      <h2>Criar dupla</h2>
      <p>Você recebe um código de 6 letras pra mandar pra ela.</p>
      <button class="btn prim" data-acao="dupla-criar">Criar dupla</button>
    </section>
    <div class="separador">ou</div>
    <section class="caixa sombra" style="display:flex;flex-direction:column;gap:12px">
      <h2>Entrar com código</h2>
      <label class="campo">Código que você recebeu
        <input class="pix" id="dpl-codigo" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="GOTA42">
      </label>
      <button class="btn prim" data-acao="dupla-entrar">Entrar na dupla</button>
    </section>
    <p class="erro" role="alert">${esc(S.dplErro)}</p>
    <button class="btn texto" data-acao="sair" style="border:none">Sair da conta</button>
  </div>`;
}

function telaHoje() {
  const eu = S.user.uid;
  const meu = diaDe(eu, S.hoje);
  const dela = S.ela ? diaDe(S.ela, S.hoje) : null;
  const seq = sequencia();
  const nomeDela = esc(perfilDe(S.ela).nome || "ela");

  let status, feito = false;
  if (dela && meu.totalMl >= meu.metaMl && dela.totalMl >= dela.metaMl) { status = "Vocês dois bateram a meta hoje! ♥"; feito = true; }
  else if (meu.totalMl >= meu.metaMl) status = dela ? `Você já fechou! Faltam ${dela.metaMl - dela.totalMl} ml pra ${nomeDela}.` : "Você já fechou o dia!";
  else status = `Faltam ${meu.metaMl - meu.totalMl} ml pra você fechar o dia.`;

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  const banner = ios && !instalado && !localStorage.getItem("gotinhas-banner-ok")
    ? `<div class="aviso linha" style="align-items:flex-start"><span class="cresce">Instale no iPhone: no Safari, toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.</span><button class="btn quadrado" data-acao="banner-ok" aria-label="Fechar aviso" style="min-height:36px;width:36px">×</button></div>`
    : "";

  const regs = registrosMisturados(S.hoje).slice(0, 5);
  const copo = S.perfil.copoMl;

  return `<div class="tela com-nav">
    ${banner}
    <header class="linha entre">
      <div style="display:flex;flex-direction:column;gap:6px">
        <h1>Hoje</h1>
        <span class="sub">${esc(rotuloDia(S.hoje))}</span>
      </div>
      ${seq > 0 ? `<span class="chip rosa">${CORACAO_SVG()} ${seq} ${seq === 1 ? "dia junto" : "dias juntos"}</span>` : ""}
    </header>
    <div class="grade2">
      ${cartaoPessoa(eu)}
      ${S.ela ? cartaoPessoa(S.ela) : cartaoEsperando()}
    </div>
    <div class="status ${feito ? "feito" : ""}" role="status">${status}</div>
    <button class="btn prim grande" data-acao="add" data-ml="${copo}">+ copo · ${copo} ml</button>
    <div class="grade2">
      <button class="btn" data-acao="add" data-ml="500">+500 ml</button>
      <button class="btn" data-acao="outro">+ outro</button>
    </div>
    <section style="display:flex;flex-direction:column;gap:6px">
      <div class="linha entre">
        <h2>Registros de hoje</h2>
        <a class="chip" href="#/editar/${S.hoje}" style="text-decoration:none;color:var(--ink)">${ICONES.lapis} Editar</a>
      </div>
      ${regs.length ? regs.map(linhaRegistro).join("") : `<p class="sub">Nenhum copo ainda. Bora o primeiro?</p>`}
    </section>
  </div>${nav("hoje")}`;
}

function telaEditar(key = S.hoje) {
  if (key > S.hoje) key = S.hoje;
  const d = diaDe(S.user.uid, key);
  const p = S.perfil;
  const humor = key === S.hoje ? humorDe(d.totalMl, d.metaMl, p.inicio, p.fim) : (d.totalMl >= d.metaMl ? "feliz" : "triste");
  const ehHoje = key === S.hoje;
  return `<div class="tela">
    <a class="voltar" href="${ehHoje ? "#/hoje" : `#/dia/${key}`}">‹ ${ehHoje ? "Hoje" : "Voltar"}</a>
    <div style="display:flex;flex-direction:column;gap:6px">
      <h1>${ehHoje ? "Editar hoje" : `Editar ${esc(rotuloDia(key))}`}</h1>
      <p class="sub">Errou um copo? Ajuste a quantidade, o horário ou apague. Ela vê o total atualizado na hora.</p>
    </div>
    <section class="caixa sombra linha" style="gap:14px">
      ${gotaSVG(p.cor, humor, 5)}
      <div style="display:flex;flex-direction:column;gap:4px">
        <span class="sub" style="font-size:15px">Total do dia</span>
        <span style="font-family:var(--pixel);font-size:14px">${d.totalMl} / ${d.metaMl} ml</span>
      </div>
    </section>
    <section style="display:flex;flex-direction:column;gap:8px">
      ${d.registros.length ? d.registros.map((r) => `
        <div class="edit-linha" data-id="${esc(r.id)}">
          <input type="time" value="${esc(r.h)}" aria-label="Horário" data-acao="hora">
          <button class="btn quadrado" data-acao="menos" aria-label="Tirar 50 ml" style="background:var(--azul-claro)">−</button>
          <span class="ml">${r.ml} ml</span>
          <button class="btn quadrado" data-acao="mais" aria-label="Somar 50 ml" style="background:var(--azul-claro)">+</button>
          <button class="btn quadrado perigo" data-acao="apagar" aria-label="Apagar registro">${ICONES.lixo}</button>
        </div>`).join("") : `<p class="sub">Nenhum registro nesse dia.</p>`}
    </section>
    <button class="btn texto tracejado" data-acao="esquecido" data-key="${key}">+ Registro esquecido</button>
    <div class="cresce"></div>
    <a class="btn prim grande" href="${ehHoje ? "#/hoje" : `#/dia/${key}`}">Pronto</a>
    ${d.registros.length ? `<button class="link-btn" data-acao="zerar" data-key="${key}">Zerar o dia</button>` : ""}
  </div>`;
}

function telaCalendario() {
  const ym = S.mesVisto;
  const [y, m] = ym.split("-").map(Number);
  const primeiro = new Date(y, m - 1, 1);
  const nDias = new Date(y, m, 0).getDate();
  const eu = S.user.uid;
  let celulas = "";
  for (let i = 0; i < primeiro.getDay(); i++) celulas += "<div></div>";
  let coracoes = 0, somaEu = 0, somaEla = 0, nEu = 0, nEla = 0;
  for (let dd = 1; dd <= nDias; dd++) {
    const key = `${ym}-${String(dd).padStart(2, "0")}`;
    const futuro = key > S.hoje;
    const a = diaDe(eu, key);
    const b = S.ela ? diaDe(S.ela, key) : null;
    const both = !futuro && ambos(key);
    if (both) coracoes++;
    if (!futuro && a.existe) { somaEu += a.totalMl; nEu++; }
    if (!futuro && b?.existe) { somaEla += b.totalMl; nEla++; }
    const label = `${dd}: você ${pctDe(a)}%${b ? `, ela ${pctDe(b)}%` : ""}`;
    celulas += `<a class="dia ${key === S.hoje ? "hoje" : ""} ${both ? "ambos" : ""} ${futuro ? "futuro" : ""}" href="#/dia/${key}" aria-label="${label}">
      <span class="topo"><span>${dd}</span>${both ? CORACAO_SVG("#D9467A", 11) : ""}</span>
      ${futuro ? "" : `<span><span class="mini"><i style="width:${pctDe(a)}%"></i></span>${b ? `<span class="mini rosa"><i style="width:${pctDe(b)}%"></i></span>` : ""}</span>`}
    </a>`;
  }
  const titulo = maiuscula(primeiro.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
  const podeAvancar = ym < S.hoje.slice(0, 7);
  return `<div class="tela com-nav">
    <h1>Calendário</h1>
    <div class="caixa linha entre" style="padding:4px">
      <button class="btn quadrado" data-acao="mes" data-n="-1" aria-label="Mês anterior" style="background:var(--azul-claro)">‹</button>
      <span style="font-family:var(--pixel);font-size:11px">${esc(titulo)}</span>
      <button class="btn quadrado" data-acao="mes" data-n="1" aria-label="Próximo mês" style="background:var(--azul-claro)" ${podeAvancar ? "" : "disabled"}>›</button>
    </div>
    <div class="semana"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>
    <div class="mes">${celulas}</div>
    <div class="legenda">
      <span><span class="quad"></span>você</span>
      ${S.ela ? `<span><span class="quad rosa"></span>${esc(perfilDe(S.ela).nome || "ela")}</span><span>${CORACAO_SVG("#D9467A", 12)} os dois bateram</span>` : ""}
    </div>
    <div class="grade3">
      <div class="caixa rosa stat"><span>Dias com ♥</span><b>${coracoes}</b></div>
      <div class="caixa stat"><span class="sub">Sua média</span><b>${nEu ? litros(somaEu / nEu) : "0,0"} L</b></div>
      <div class="caixa stat"><span class="sub">Média dela</span><b>${nEla ? litros(somaEla / nEla) : "—"}${nEla ? " L" : ""}</b></div>
    </div>
  </div>${nav("calendario")}`;
}

function telaDia(key) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return telaCalendario();
  const eu = S.user.uid;
  const a = diaDe(eu, key);
  const b = S.ela ? diaDe(S.ela, key) : null;
  const porHora = (d) => { const h = new Array(24).fill(0); for (const r of d.registros) { const x = parseInt(r.h, 10); if (!isNaN(x)) h[x] += r.ml; } return h; };
  const ha = porHora(a), hb = b ? porHora(b) : new Array(24).fill(0);
  const max = Math.max(500, ...ha, ...hb);
  let cols = "", rot = "";
  for (let h = 6; h <= 23; h++) {
    cols += `<div class="col"><i style="height:${Math.round((ha[h] / max) * 140)}px"></i>${b ? `<i class="rosa" style="height:${Math.round((hb[h] / max) * 140)}px"></i>` : ""}</div>`;
    rot += `<span>${h % 3 === 0 ? h : ""}</span>`;
  }
  const both = ambos(key);
  const resumo = (uid, d, rosa) => `<div class="caixa stat"><span style="color:${rosa ? "var(--rosa-txt)" : "#0F4C9E"}">${uid === eu ? "Você" : esc(perfilDe(uid).nome || "Ela")}</span><b style="font-size:12px">${d.totalMl} ml</b><span class="sub">meta ${d.metaMl} · ${d.registros.length} registros</span></div>`;
  const regs = registrosMisturados(key);
  return `<div class="tela com-nav">
    <a class="voltar" href="#/calendario">‹ Calendário</a>
    <h1>${esc(rotuloDia(key))}</h1>
    ${both ? `<div class="caixa rosa linha" style="justify-content:center">${gotaSVG(S.perfil.cor, "feliz", 4)}<span>Os dois bateram a meta ♥</span>${gotaSVG(perfilDe(S.ela).cor, "feliz", 4)}</div>` : ""}
    <div class="grade2">${resumo(eu, a, S.perfil.cor === "rosa")}${b ? resumo(S.ela, b, perfilDe(S.ela).cor === "rosa") : ""}</div>
    <section class="caixa" style="display:flex;flex-direction:column;gap:8px">
      <h2>Água por hora</h2>
      <div class="grafico" role="img" aria-label="Água por hora, das 6h às 23h">${cols}</div>
      <div class="horas">${rot}</div>
    </section>
    <section style="display:flex;flex-direction:column;gap:6px">
      <div class="linha entre">
        <h2>Registros</h2>
        ${key <= S.hoje ? `<a class="chip" href="#/editar/${key}" style="text-decoration:none;color:var(--ink)">${ICONES.lapis} Editar os meus</a>` : ""}
      </div>
      ${regs.length ? regs.map(linhaRegistro).join("") : `<p class="sub">Nenhum registro nesse dia.</p>`}
    </section>
  </div>${nav("calendario")}`;
}

function telaConfig() {
  const p = S.perfil;
  const pd = S.perfilDela;
  return `<div class="tela com-nav">
    <h1>Config</h1>
    <form id="form-config" class="caixa sombra" style="display:flex;flex-direction:column;gap:12px">
      <div class="linha" style="gap:14px">
        ${gotaSVG(p.cor, "feliz", 5)}
        <label class="campo cresce">Seu nome<input class="pix" name="nome" maxlength="30" value="${esc(p.nome)}" style="font-family:var(--corpo);font-size:17px"></label>
      </div>
      <div class="grade2">
        <label class="campo">Sua cor
          <select name="cor" class="pix" style="font-family:var(--corpo);font-size:17px">
            <option value="azul" ${p.cor === "azul" ? "selected" : ""}>Azul</option>
            <option value="rosa" ${p.cor === "rosa" ? "selected" : ""}>Rosa</option>
          </select>
        </label>
        <label class="campo">Meta (ml)<input class="pix" name="metaMl" type="number" min="100" max="10000" step="50" value="${p.metaMl}"></label>
        <label class="campo">Copo (ml)<input class="pix" name="copoMl" type="number" min="50" max="2000" step="10" value="${p.copoMl}"></label>
        <span></span>
        <label class="campo">Início<input class="pix" name="inicio" type="time" value="${esc(p.inicio)}" style="font-family:var(--corpo);font-size:17px"></label>
        <label class="campo">Fim<input class="pix" name="fim" type="time" value="${esc(p.fim)}" style="font-family:var(--corpo);font-size:17px"></label>
      </div>
      <p class="sub" style="font-size:15px">O horário define quando a gotinha começa a ficar com sede. A meta nova vale a partir de hoje; dias passados não mudam.</p>
      <button class="btn prim" type="submit">Salvar</button>
      <p role="status" style="font-size:15px;color:#1E6B35;min-height:1em">${esc(S.cfgMsg)}</p>
    </form>
    <section class="caixa rosa linha">
      ${gotaSVG(pd?.cor || "rosa", "feliz", 4)}
      <div style="display:flex;flex-direction:column;gap:2px" class="cresce">
        <span>${pd ? `Dupla com ${esc(pd.nome)}` : "Esperando sua dupla entrar"}</span>
        <span style="font-size:14px">código ${esc(S.dupla?.codigo || "")}</span>
      </div>
      ${pd ? "" : `<button class="btn rosa" data-acao="compartilhar" style="min-height:40px;font-size:10px">Enviar</button>`}
    </section>
    ${S.store.modo === "demo" ? `<div class="aviso">Modo demo. Para usar de verdade, configure o Firebase (veja o README).</div>` : ""}
    <button class="btn perigo" data-acao="sair">Sair da conta</button>
  </div>${nav("config")}`;
}

function folhaOutro() {
  if (!S.folha) return "";
  const vals = [100, 200, 300, 350, 600, 1000];
  return `<div class="fundo-folha" data-acao="folha-fechar">
    <section class="folha" role="dialog" aria-modal="true" aria-label="Adicionar outra quantidade">
      <div class="alca"></div>
      <h2 style="font-size:13px">Quanto você bebeu?</h2>
      <div class="grade3 chips-ml">
        ${vals.map((v) => `<button type="button" data-acao="folha-ml" data-ml="${v}" class="${S.folha.ml === v ? "sel" : ""}">${v} ml</button>`).join("")}
      </div>
      <label class="campo">Outro valor (ml)<input class="pix" id="folha-ml" type="number" min="10" max="3000" step="10" value="${S.folha.ml}"></label>
      <label class="campo">Horário<input class="pix" id="folha-h" type="time" value="${S.folha.h}"></label>
      <div class="grade2">
        <button class="btn" data-acao="folha-fechar">Cancelar</button>
        <button class="btn prim" data-acao="folha-ok">Registrar</button>
      </div>
    </section>
  </div>`;
}

// ------------------------------------------------------------------ render
function digitando() {
  const a = document.activeElement;
  return a && $app.contains(a) && (a.tagName === "INPUT" || a.tagName === "SELECT") && a.type !== "time";
}

function render(forcar = false) {
  if (!S.store) return;
  if (!forcar && digitando()) { S.pendente = true; return; }
  S.pendente = false;

  let html = "";
  const demo = S.store.modo === "demo" && S.user ? `<div class="modo-demo">modo demo</div>` : "";
  if (!S.authPronto) html = `<div class="carregando"><h1>Gotinhas…</h1></div>`;
  else if (!S.user) html = telaLogin();
  else if (!S.perfil) html = `<div class="carregando"><h1>Carregando…</h1></div>`;
  else if (!S.perfil.duplaId) html = telaDupla();
  else {
    const r = rota();
    if (r.nome === "calendario") html = telaCalendario();
    else if (r.nome === "dia") html = telaDia(r.arg);
    else if (r.nome === "editar") html = telaEditar(r.arg || S.hoje);
    else if (r.nome === "config") html = telaConfig();
    else html = telaHoje();
    html += folhaOutro();
  }
  const scroll = window.scrollY;
  $app.innerHTML = demo + html;
  window.scrollTo(0, scroll);
  ajustarAgua(!!(S.user && S.perfil?.duplaId));
}

// ------------------------------------------------------------------ eventos
$app.addEventListener("focusout", () => setTimeout(() => { if (S.pendente && !digitando()) render(); }, 0));

$app.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-acao]");
  if (!el) return;
  const acao = el.dataset.acao;
  if (acao === "folha-fechar" && el !== ev.target && el.classList.contains("fundo-folha")) return; // clique dentro da folha
  const linha = el.closest(".edit-linha");
  const rr = rota();
  const keyEdit = rr.nome === "editar" ? (rr.arg || S.hoje) : S.hoje;

  switch (acao) {
    case "login-google":
      S.login.erro = "";
      try { await S.store.entrarGoogle(); } catch (e) { S.login.erro = erroLogin(e); render(true); }
      break;
    case "login-alternar":
      S.login.modo = S.login.modo === "criar" ? "entrar" : "criar"; S.login.erro = ""; render(true);
      break;
    case "sair":
      if (confirm("Sair da conta neste aparelho?")) { for (const k of Object.keys(S.subs)) cancelar(k); await S.store.sair(); }
      break;
    case "dupla-criar":
      S.dplErro = "";
      try {
        await salvarNomeDupla();
        await S.store.criarDupla(S.user.uid);
        location.hash = "#/hoje";
      } catch (e) { S.dplErro = "Não deu pra criar a dupla. Tente de novo."; render(true); }
      break;
    case "dupla-entrar": {
      S.dplErro = "";
      const cod = document.getElementById("dpl-codigo").value.trim().toUpperCase();
      if (cod.length < 6) { S.dplErro = "O código tem 6 letras."; render(true); break; }
      try {
        await salvarNomeDupla();
        await S.store.entrarDupla(S.user.uid, cod);
        location.hash = "#/hoje";
      } catch (e) {
        S.dplErro = e.message === "codigo-invalido" ? "Esse código não existe. Confere com ela?" : e.message === "dupla-cheia" ? "Essa dupla já tem duas pessoas." : "Não deu pra entrar. Tente de novo.";
        render(true);
      }
      break;
    }
    case "compartilhar": {
      const cod = S.dupla?.codigo || "";
      const texto = `Entra na minha dupla no Gotinhas! Código: ${cod}\n${location.origin}${location.pathname}`;
      try {
        if (navigator.share) await navigator.share({ title: "Gotinhas", text: texto });
        else { await navigator.clipboard.writeText(texto); alert("Código copiado!"); }
      } catch {}
      break;
    }
    case "banner-ok":
      localStorage.setItem("gotinhas-banner-ok", "1"); render(true);
      break;
    case "add":
      await adicionar(Number(el.dataset.ml));
      break;
    case "outro":
      S.folha = { ml: 300, h: agoraHHMM() }; render(true);
      break;
    case "folha-ml":
      S.folha.ml = Number(el.dataset.ml);
      document.getElementById("folha-ml").value = S.folha.ml;
      document.querySelectorAll(".chips-ml button").forEach((b) => b.classList.toggle("sel", b === el));
      break;
    case "folha-fechar":
      S.folha = null; render(true);
      break;
    case "folha-ok": {
      const ml = parseInt(document.getElementById("folha-ml").value, 10);
      const h = document.getElementById("folha-h").value || agoraHHMM();
      if (!ml || ml <= 0) return;
      S.folha = null;
      await adicionar(Math.min(ml, 3000), h);
      render(true);
      break;
    }
    case "mais":
    case "menos": {
      const id = linha.dataset.id;
      const delta = acao === "mais" ? 50 : -50;
      await mudarRegistros(keyEdit, (regs) => regs.map((r) => (r.id === id ? { ...r, ml: Math.max(50, r.ml + delta) } : r)));
      break;
    }
    case "apagar": {
      const id = linha.dataset.id;
      await mudarRegistros(keyEdit, (regs) => regs.filter((r) => r.id !== id));
      break;
    }
    case "esquecido": {
      const key = el.dataset.key;
      await adicionar(S.perfil.copoMl, key === S.hoje ? agoraHHMM() : "12:00", key);
      break;
    }
    case "zerar":
      if (confirm("Apagar todos os registros desse dia?")) await mudarRegistros(el.dataset.key, () => []);
      break;
    case "mes": {
      const n = Number(el.dataset.n);
      const novo = ymSomar(S.mesVisto, n);
      if (novo > S.hoje.slice(0, 7)) return;
      S.mesVisto = novo;
      garantirMeses();
      render(true);
      break;
    }
  }
});

$app.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.dataset.acao === "hora") {
    const id = el.closest(".edit-linha").dataset.id;
    const h = el.value;
    if (!/^\d{2}:\d{2}$/.test(h)) return;
    const rr = rota();
    await mudarRegistros(rr.arg || S.hoje, (regs) => regs.map((r) => (r.id === id ? { ...r, h } : r)));
  }
});

$app.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === "form-login") {
    S.login.erro = "";
    try {
      await S.store.entrarEmail(f.email.value.trim(), f.senha.value, S.login.modo === "criar");
    } catch (e) { S.login.erro = erroLogin(e); render(true); }
  }
  if (f.id === "form-config") {
    const meta = Math.round(Number(f.metaMl.value));
    const copo = Math.round(Number(f.copoMl.value));
    const dados = {
      nome: f.nome.value.trim().slice(0, 30) || S.perfil.nome,
      cor: f.cor.value === "rosa" ? "rosa" : "azul",
      metaMl: Math.min(10000, Math.max(100, meta || 2000)),
      copoMl: Math.min(2000, Math.max(50, copo || 250)),
      inicio: f.inicio.value || "08:00",
      fim: f.fim.value || "17:48",
    };
    try {
      await S.store.salvarPerfil(S.user.uid, dados);
      // a meta nova vale para hoje também
      const d = diaDe(S.user.uid, S.hoje);
      await S.store.salvarDia(S.user.uid, S.hoje, { metaMl: dados.metaMl, registros: d.registros, totalMl: d.totalMl });
      S.cfgMsg = "Salvo ✓";
    } catch { S.cfgMsg = "Não deu pra salvar."; }
    document.activeElement?.blur();
    render(true);
    setTimeout(() => { S.cfgMsg = ""; render(); }, 2500);
  }
});

async function salvarNomeDupla() {
  const nome = document.getElementById("dpl-nome")?.value.trim();
  if (nome && nome !== S.perfil.nome) await S.store.salvarPerfil(S.user.uid, { nome: nome.slice(0, 30) });
}

function erroLogin(e) {
  const c = e?.code || "";
  if (c.includes("popup-closed") || c.includes("cancelled-popup")) return "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "E-mail ou senha errados.";
  if (c.includes("email-already-in-use")) return "Esse e-mail já tem conta. Toque em “Já tenho conta”.";
  if (c.includes("weak-password")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (c.includes("invalid-email")) return "Esse e-mail não parece certo.";
  if (c.includes("popup-blocked")) return "O navegador bloqueou a janela do Google. Tente entrar com e-mail.";
  if (c.includes("unauthorized-domain")) return "Esse endereço não está autorizado no Firebase (veja o README).";
  if (c.includes("network")) return "Sem internet. Tente de novo.";
  return "Não deu pra entrar. Tente de novo.";
}

window.addEventListener("hashchange", () => { S.folha = null; render(true); window.scrollTo(0, 0); });

// virada do dia e humor que muda com o horário
setInterval(() => {
  const k = chaveDia();
  if (k !== S.hoje) {
    S.hoje = k;
    if (S.mesVisto < k.slice(0, 7)) S.mesVisto = k.slice(0, 7);
    garantirMeses();
  }
  render();
}, 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { S.hoje = chaveDia(); garantirMeses(); render(); }
});

// ------------------------------------------------------------------ início
(async function iniciar() {
  try {
    S.store = await criarStore();
  } catch (e) {
    $app.innerHTML = `<div class="tela"><div class="centro"><h1>Ops</h1><p>Não deu pra carregar. Confira a internet e abra de novo.</p></div></div>`;
    return;
  }
  S.store.onAuth(async (u) => {
    for (const k of Object.keys(S.subs)) cancelar(k);
    S.dias = {}; S.perfil = null; S.dupla = null; S.ela = null; S.perfilDela = null;
    S.user = u;
    S.authPronto = true;
    render(true);
    if (!u) return;
    try { await S.store.garantirPerfil(u); } catch {}
    assinar(`perfil|${u.uid}`, () => S.store.ouvirPerfil(u.uid, aoMudarPerfil));
  });
})();
