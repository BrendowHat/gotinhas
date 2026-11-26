import { criarStore, chaveDia, normalizarDia, PERFIL_PADRAO } from "./store.js";
import { gotaSVG, humorDe, HUMOR_TEXTO, CORACAO_SVG, CORES, ACESSORIOS } from "./gota.js";

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
  meuCodigo: null,
  historico: {},     // todos os dias (para conquistas)
  cutucadasTotal: 0,
  cutucadaMsg: "",
  pushMsg: "",
  extStatus: "",
  convite: lerConvite(),
};

function lerConvite() {
  const m = location.hash.match(/^#\/convite\/([A-Za-z0-9]{6})/);
  if (m) {
    try { localStorage.setItem("gotinhas-convite", m[1].toUpperCase()); } catch {}
    history.replaceState(null, "", location.pathname);
    return m[1].toUpperCase();
  }
  try { return localStorage.getItem("gotinhas-convite"); } catch { return null; }
}
const codigoAtual = () => S.dupla?.codigo || S.perfil?.codigo || S.meuCodigo || "";
const linkConvite = (cod) => `${location.origin}${location.pathname}#/convite/${cod}`;

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
          aoEntrarNaRota();
        })
      );
      if (!p.codigo) {
        S.store.buscarMeuCodigo?.(S.user.uid).then((c) => { if (c) { S.meuCodigo = c; render(); } }).catch(() => {});
      }
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
  estrela: '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="miter"><path d="M12 3 L14.5 9 L21 9.5 L16 13.5 L17.5 20 L12 16.5 L6.5 20 L8 13.5 L3 9.5 L9.5 9 Z"/></svg>',
  lixo: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7 M10 11 V16 M14 11 V16"/></svg>',
};

function nav(ativo) {
  const item = (id, href, txt) =>
    `<a href="${href}" class="${ativo === id ? "ativo" : ""}" ${ativo === id ? 'aria-current="page"' : ""}>${ICONES[id]}<span>${txt}</span></a>`;
  return `<nav class="barra-nav" aria-label="Navegação principal">${item("hoje", "#/hoje", "Hoje")}${item("calendario", "#/calendario", "Calendário")}${item("estrela", "#/conquistas", "Conquistas")}${item("config", "#/config", "Config")}</nav>`;
}

function cartaoPessoa(uid, key = S.hoje) {
  const p = perfilDe(uid);
  const d = diaDe(uid, key);
  const pct = pctDe(d);
  const humor = humorDe(d.totalMl, d.metaMl, p.inicio, p.fim);
  const rosa = p.cor === "rosa";
  return `<section class="caixa sombra pessoa" data-key="pessoa-${uid === S.user.uid ? "eu" : "ela"}">
    ${gotaSVG(p.cor, humor, 7, `${esc(p.nome)}: ${HUMOR_TEXTO[humor]}`, p.acessorio)}
    <span class="nome">${esc(p.nome) || "—"}</span>
    <span>${d.totalMl} / ${d.metaMl} ml</span>
    <div class="barra ${rosa ? "rosa" : ""}"><i style="transform:scaleX(${pct / 100})"></i></div>
    <span class="humor">${pct}% · ${HUMOR_TEXTO[humor]}</span>
  </section>`;
}

function cartaoEsperando() {
  const cod = codigoAtual();
  return `<section class="caixa sombra pessoa" style="justify-content:center">
    ${gotaSVG("rosa", "normal", 5)}
    <span style="font-size:15px">Esperando sua dupla</span>
    <span class="nome" style="font-size:13px">${esc(cod)}</span>
    <button class="btn" data-acao="compartilhar" style="min-height:40px;font-size:10px">Enviar convite</button>
  </section>`;
}

function linhaRegistro(r) {
  const dela = r.uid === S.ela;
  const quem = dela ? esc(perfilDe(S.ela).nome || "ela") : "você";
  return `<div class="registro" data-key="${esc(r.uid)}-${esc(r.id)}"><span class="h">${esc(r.h)}</span><span class="cresce">+${r.ml} ml</span><span class="tag ${dela ? "rosa" : ""}">${quem}</span></div>`;
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
        <span class="login-gota esq">${gotaSVG("azul", "feliz", 9, "", "fone")}</span>
        <span class="login-coracao" style="margin-bottom:34px">${CORACAO_SVG("#F28DB2", 40)}</span>
        <span class="login-gota dir">${gotaSVG("rosa", "feliz", 9, "", "laco")}</span>
      </div>
      <h1 class="logo login-titulo">Gotinhas</h1>
      <p class="login-sub" style="font-size:20px;max-width:280px">Água em dupla, um gole de cada vez.</p>
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
    ${S.convite ? `<section class="caixa rosa sombra" style="display:flex;flex-direction:column;gap:12px;box-shadow:4px 4px 0 var(--rosa-esc)">
      <h2>Você recebeu um convite ♥</h2>
      <p>Código <b>${esc(S.convite)}</b>. Toque abaixo pra entrar na dupla.</p>
      <button class="btn prim" data-acao="dupla-entrar">Entrar na dupla</button>
    </section>
    <div class="separador">ou</div>` : ""}
    <section class="caixa sombra" style="display:flex;flex-direction:column;gap:12px">
      <h2>Criar dupla</h2>
      <p>Você recebe um código de 6 letras pra mandar pra ela.</p>
      <button class="btn prim" data-acao="dupla-criar">Criar dupla</button>
    </section>
    <div class="separador">ou</div>
    <section class="caixa sombra" style="display:flex;flex-direction:column;gap:12px">
      <h2>Entrar com código</h2>
      <label class="campo">Código que você recebeu
        <input class="pix" id="dpl-codigo" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="GOTA42" value="${esc(S.convite || "")}">
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
    ${botaoCutucar()}
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
      ${gotaSVG(p.cor, humor, 5, "", p.acessorio)}
      <div style="display:flex;flex-direction:column;gap:4px">
        <span class="sub" style="font-size:15px">Total do dia</span>
        <span style="font-family:var(--pixel);font-size:14px">${d.totalMl} / ${d.metaMl} ml</span>
      </div>
    </section>
    <section style="display:flex;flex-direction:column;gap:8px">
      ${d.registros.length ? d.registros.map((r) => `
        <div class="edit-linha" data-id="${esc(r.id)}" data-key="${esc(r.id)}">
          <input type="time" value="${esc(r.h)}" aria-label="Horário" data-acao="hora">
          <button class="btn quadrado" data-acao="menos" aria-label="Tirar 50 ml" style="background:var(--azul-claro)">−</button>
          <span class="ml">${r.ml} ml</span>
          <button class="btn quadrado" data-acao="mais" aria-label="Somar 50 ml" style="background:var(--azul-claro)">+</button>
          <button class="btn quadrado perigo" data-acao="apagar" aria-label="Apagar registro">${ICONES.lixo}</button>
        </div>`).join("") : `<p class="sub">Nenhum registro nesse dia.</p>`}
    </section>
    <button class="btn texto tracejado" data-acao="esquecido" data-dia="${key}">+ Registro esquecido</button>
    <div class="cresce"></div>
    <a class="btn prim grande" href="${ehHoje ? "#/hoje" : `#/dia/${key}`}">Pronto</a>
    ${d.registros.length ? `<button class="link-btn" data-acao="zerar" data-dia="${key}">Zerar o dia</button>` : ""}
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
    ${both ? `<div class="caixa rosa linha" style="justify-content:center">${gotaSVG(S.perfil.cor, "feliz", 4, "", S.perfil.acessorio)}<span>Os dois bateram a meta ♥</span>${gotaSVG(perfilDe(S.ela).cor, "feliz", 4, "", perfilDe(S.ela).acessorio)}</div>` : ""}
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
      <label class="campo">Seu nome<input class="pix" name="nome" maxlength="30" value="${esc(p.nome)}" style="font-family:var(--corpo);font-size:17px"></label>
      <div class="vitrine" id="prev-gota">${gotaSVG(p.cor, "feliz", 12, "Sua gotinha", p.acessorio)}</div>
      <fieldset class="escolha">
        <legend>Cor</legend>
        <div class="cores">
          ${Object.entries(CORES).map(([k, c]) => `<label class="cor" title="${c.nome}"><input type="radio" name="cor" value="${k}" ${p.cor === k ? "checked" : ""}><span style="background:${c.base};border-color:${c.contorno}"></span><b class="sr">${c.nome}</b></label>`).join("")}
        </div>
      </fieldset>
      <fieldset class="escolha">
        <legend>Acessório</legend>
        <div class="acessorios">
          ${Object.entries(ACESSORIOS).map(([k, nome]) => `<label class="acess"><input type="radio" name="acessorio" value="${k}" ${(p.acessorio || "nenhum") === k ? "checked" : ""}><span>${gotaSVG(p.cor, "normal", 3.4, "", k)}<small>${nome}</small></span></label>`).join("")}
        </div>
      </fieldset>
      <div class="grade2">
        <label class="campo">Meta (ml)<input class="pix" name="metaMl" type="number" min="100" max="10000" step="50" value="${p.metaMl}"></label>
        <label class="campo">Copo (ml)<input class="pix" name="copoMl" type="number" min="50" max="2000" step="10" value="${p.copoMl}"></label>
        <label class="campo">Início<input class="pix" name="inicio" type="time" value="${esc(p.inicio)}" style="font-family:var(--corpo);font-size:17px"></label>
        <label class="campo">Fim<input class="pix" name="fim" type="time" value="${esc(p.fim)}" style="font-family:var(--corpo);font-size:17px"></label>
      </div>
      <p class="sub" style="font-size:15px">O horário define quando a gotinha começa a ficar com sede. A meta nova vale a partir de hoje; dias passados não mudam.</p>
      <button class="btn prim" type="submit">Salvar</button>
      <p role="status" style="font-size:15px;color:${S.cfgMsg.includes("✓") ? "#1E6B35" : "var(--perigo)"};min-height:1em">${esc(S.cfgMsg)}</p>
    </form>
    <section class="caixa rosa linha">
      ${gotaSVG(pd?.cor || "rosa", "feliz", 4, "", pd?.acessorio)}
      <div style="display:flex;flex-direction:column;gap:2px" class="cresce">
        <span>${pd ? `Dupla com ${esc(pd.nome)}` : "Esperando sua dupla entrar"}</span>
        <span style="font-size:14px">${codigoAtual() ? `código ${esc(codigoAtual())}` : ""}</span>
      </div>
      ${pd ? "" : `<button class="btn rosa" data-acao="compartilhar" style="min-height:40px;font-size:10px">Enviar convite</button>`}
    </section>
    ${secaoNotificacoes()}
    ${S.store.modo === "demo" ? `<div class="aviso">Modo demo. Para usar de verdade, configure o Firebase (veja o README).</div>` : ""}
    <button class="btn perigo" data-acao="sair">Sair da conta</button>
  </div>${nav("config")}`;
}

function folhaOutro() {
  if (!S.folha) return "";
  const vals = [100, 200, 300, 350, 600, 1000];
  return `<div class="fundo-folha ${S.folha.fechando ? "saindo" : ""}" data-acao="folha-fechar">
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

// ------------------------------------------------------------------ fase 2: cutucada e notificações
function erroCutucada(e) {
  const nome = esc(perfilDe(S.ela).nome || "Ela");
  return ({
    espera: `Calma! Próxima cutucada em ${e.faltaMin || 30} min.`,
    "limite-dia": "Já foram 5 cutucadas hoje. Amanhã tem mais 😉",
    "fora-do-horario": `${nome} está fora do horário de lembretes${e.janela ? ` (${e.janela}; agora ${e.agora})` : ""}.`,
    "ela-ja-bateu": `${nome} já bateu a meta hoje ♥`,
    "ela-sem-notificacao": `${nome} ainda não ativou as notificações (Config → Notificações).`,
    "ela-desligou": `${nome} desligou as cutucadas.`,
    "sem-worker": "A cutucada ainda não foi configurada (veja o README).",
  })[e.message] || "Não deu pra cutucar agora.";
}

function botaoCutucar() {
  if (!S.ela) return "";
  const ate = Number(localStorage.getItem("gotinhas-cutucada-ate") || 0);
  const falta = Math.ceil((ate - Date.now()) / 60000);
  const nome = esc(perfilDe(S.ela).nome || "ela");
  if (S.cutucadaMsg) return `<div class="status ${S.cutucadaMsg.includes("✓") ? "feito" : ""}" role="status">${S.cutucadaMsg}</div>`;
  if (falta > 0) return `<button class="btn texto tracejado" disabled>Cutucada enviada · próxima em ${falta} min</button>`;
  return `<button class="btn texto rosa" data-acao="cutucar">Cutucar ${nome} 💧</button>`;
}

function secaoNotificacoes() {
  const p = S.perfil;
  const disp = S.store.pushDisponivel?.();
  const ativo = S.store.pushAtivoNesteAparelho?.();
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  let corpo;
  if (!disp) corpo = `<p class="sub" style="font-size:15px">Ainda não configurado. Siga a fase 2 do README (Cloudflare + chave do Firebase).</p>`;
  else if (ios && !instalado) corpo = `<p style="font-size:15px">No iPhone, as notificações só funcionam com o app instalado: Safari → Compartilhar → <b>Adicionar à Tela de Início</b>, e abra pelo ícone.</p>`;
  else corpo = ativo
    ? `<button class="btn" data-acao="push-desativar">Desligar lembretes</button>`
    : `<button class="btn prim" data-acao="push-ativar">🔔 Ativar notificações</button>`;
  return `<section class="caixa sombra" style="display:flex;flex-direction:column;gap:12px">
    <h2>Notificações</h2>
    ${corpo}
    <label class="campo">Lembrar a cada
      <select id="cfg-intervalo" class="pix" style="font-family:var(--corpo);font-size:17px">
        ${[60, 120, 180].map((m) => `<option value="${m}" ${(p.intervaloMin || 60) === m ? "selected" : ""}>${m / 60} hora${m > 60 ? "s" : ""}</option>`).join("")}
      </select>
    </label>
    <label class="linha" style="min-height:44px;font-size:17px"><span class="cresce">Receber cutucadas</span><input type="checkbox" id="cfg-cutucadas" ${p.cutucadas === false ? "" : "checked"} style="width:22px;height:22px;accent-color:var(--azul-esc)"></label>
    <p class="sub" style="font-size:14px">Os lembretes só chegam dentro do seu horário e param quando você bate a meta. Cutucadas: no máximo 1 a cada 30 min e 5 por dia.</p>
    <p role="status" style="font-size:15px;min-height:1em">${esc(S.pushMsg)}</p>
  </section>`;
}

// ------------------------------------------------------------------ fase 3: conectar extensão
function telaConectarExtensao() {
  const st = S.extStatus;
  const msg = {
    conectando: ["Conectando…", "normal"],
    ok: ["Extensão conectada! Pode fechar esta aba.", "feliz"],
    "sem-extensao": ["Não encontrei a extensão. Abra esta página pelo botão “Conectar” da extensão.", "triste"],
    "sem-worker": ["A conexão da extensão precisa do Worker configurado (fase 2 do README).", "triste"],
    erro: ["Não deu pra conectar. Tente de novo.", "triste"],
  }[st] || ["Conectando…", "normal"];
  return `<div class="tela"><div class="centro">
    ${gotaSVG(S.perfil.cor, msg[1], 9, "", S.perfil.acessorio)}
    <h1>Extensão do Chrome</h1>
    <p>${msg[0]}</p>
    <a class="btn prim" href="#/hoje">Ir para o app</a>
  </div></div>`;
}

// ------------------------------------------------------------------ fase 4: conquistas e resumo
function todosDias(uid) { return { ...(S.historico[uid] || {}), ...(S.dias[uid] || {}) }; }
function bateuDoc(doc, metaPadrao) { const d = normalizarDia(doc, metaPadrao); return d.registros.length > 0 && d.totalMl >= d.metaMl; }
function maiorSequenciaJuntos(a, b, metaA, metaB) {
  const chaves = Object.keys(a).filter((k) => bateuDoc(a[k], metaA) && bateuDoc(b[k], metaB)).sort();
  let melhor = 0, atual = 0, ant = null;
  for (const k of chaves) {
    const d = dataDe(k);
    atual = ant && (d - ant) / 86400000 === 1 ? atual + 1 : 1;
    melhor = Math.max(melhor, atual);
    ant = d;
  }
  return melhor;
}

function calcularConquistas() {
  const eu = S.user.uid, metaEu = S.perfil.metaMl;
  const a = todosDias(eu);
  const b = S.ela ? todosDias(S.ela) : {};
  const metaEla = perfilDe(S.ela).metaMl;
  const docs = Object.values(a).map((d) => normalizarDia(d, metaEu));
  const algumCopo = docs.some((d) => d.registros.length > 0);
  const algumaMeta = docs.some((d) => d.registros.length > 0 && d.totalMl >= d.metaMl);
  const juntos = Object.keys(a).some((k) => bateuDoc(a[k], metaEu) && bateuDoc(b[k], metaEla));
  const cedo = docs.some((d) => d.registros.some((r) => r.h < "08:00"));
  const seq = maiorSequenciaJuntos(a, b, metaEu, metaEla);
  const maior = Math.max(0, ...docs.map((d) => d.totalMl));
  const cut = S.cutucadasTotal;
  return [
    { t: "Primeiro gole", d: "Registrou o primeiro copo", p: algumCopo ? 1 : 0 },
    { t: "Meta batida", d: "Fechou a meta de um dia", p: algumaMeta ? 1 : 0 },
    { t: "Dupla ♥", d: "Os dois bateram no mesmo dia", p: juntos ? 1 : 0 },
    { t: "Madrugador", d: "Um copo antes das 8h", p: cedo ? 1 : 0 },
    { t: "Cutucador", d: `Cutucou 10 vezes (${Math.min(cut, 10)}/10)`, p: Math.min(1, cut / 10) },
    { t: "7 dias juntos", d: `Uma semana de ♥ seguida (${Math.min(seq, 7)}/7)`, p: Math.min(1, seq / 7) },
    { t: "Maratona", d: `3 L num dia só (${litros(Math.min(maior, 3000))}/3,0 L)`, p: Math.min(1, maior / 3000) },
    { t: "Mês perfeito", d: `30 dias de ♥ seguidos (${Math.min(seq, 30)}/30)`, p: Math.min(1, seq / 30) },
  ];
}

function telaConquistas() {
  const lista = calcularConquistas();
  const feitas = lista.filter((c) => c.p >= 1).length;
  return `<div class="tela com-nav">
    <div class="linha entre"><h1>Conquistas</h1><span class="sub">${feitas} de ${lista.length}</span></div>
    <a class="btn prim" href="#/resumo" style="justify-content:space-between;min-height:64px">
      <span style="display:flex;flex-direction:column;gap:4px;text-align:left"><span>Resumo da semana</span><span style="font-family:var(--corpo);font-size:15px">quem bebeu mais nos últimos 7 dias?</span></span><span>›</span>
    </a>
    <div class="grade2">
      ${lista.map((c) => {
        const ok = c.p >= 1;
        return `<div class="conquista ${ok ? "" : "travada"}">
          <div class="linha" style="gap:8px"><span class="ic">${ICONES.estrela}</span><b>${esc(c.t)}</b></div>
          <span class="sub" style="font-size:14px">${esc(c.d)}</span>
          ${ok ? "" : `<div class="barra" style="height:8px;border-color:#7C95AE"><i style="width:${Math.round(c.p * 100)}%;background:#7C95AE"></i></div>`}
        </div>`;
      }).join("")}
    </div>
  </div>${nav("estrela")}`;
}

function telaResumo() {
  const eu = S.user.uid;
  const dias = [];
  const d = dataDe(S.hoje);
  for (let i = 6; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - i); dias.push(chaveDia(x)); }
  const tot = (uid) => dias.reduce((acc, k) => { const v = diaDe(uid, k); acc.ml += v.totalMl; acc.meta += v.metaMl; return acc; }, { ml: 0, meta: 0 });
  const A = tot(eu);
  const B = S.ela ? tot(S.ela) : null;
  const coracoes = dias.filter((k) => ambos(k)).length;
  const pa = A.meta ? A.ml / A.meta : 0, pb = B && B.meta ? B.ml / B.meta : 0;
  const nomeEla = esc(perfilDe(S.ela).nome || "Ela");
  let campeao = "", corCamp = S.perfil.cor, acCamp = S.perfil.acessorio;
  if (B) {
    if (Math.abs(pa - pb) < 0.01) campeao = "Empate! ♥";
    else if (pa > pb) campeao = `${esc(S.perfil.nome || "Você")}`;
    else { campeao = nomeEla; corCamp = perfilDe(S.ela).cor; acCamp = perfilDe(S.ela).acessorio; }
  }
  const max = Math.max(2500, ...dias.map((k) => Math.max(diaDe(eu, k).totalMl, B ? diaDe(S.ela, k).totalMl : 0)));
  const nomeDia = (k) => maiuscula(dataDe(k).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")) + " " + k.slice(8);
  return `<div class="tela com-nav">
    <a class="voltar" href="#/conquistas">‹ Conquistas</a>
    <h1>Últimos 7 dias</h1>
    ${B ? `<section class="caixa sombra linha" style="gap:16px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
        <svg aria-hidden="true" width="40" height="20" viewBox="0 0 8 4" shape-rendering="crispEdges"><path fill="#C99A06" d="M0 0h1v4H0zM3 0h2v4H3zM7 0h1v4H7zM0 2h8v2H0z"/></svg>
        ${gotaSVG(corCamp, "feliz", 7, "", acCamp)}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <span class="sub" style="font-size:15px">${campeao.includes("Empate") ? "Resultado" : "Campeão(ã) da semana"}</span>
        <span style="font-family:var(--pixel);font-size:13px">${campeao}</span>
        <span style="font-size:15px">pela % da meta cumprida</span>
      </div>
    </section>` : ""}
    <div class="grade3">
      <div class="caixa azul stat"><span style="color:#0F4C9E">Você</span><b>${litros(A.ml)} L</b><span class="sub">${Math.round(pa * 100)}% da meta</span></div>
      ${B ? `<div class="caixa rosa stat"><span>${nomeEla}</span><b>${litros(B.ml)} L</b><span>${Math.round(pb * 100)}% da meta</span></div>` : "<div></div>"}
      <div class="caixa stat"><span class="sub">Dias com ♥</span><b>${coracoes} de 7</b></div>
    </div>
    <section class="caixa" style="display:flex;flex-direction:column;gap:8px">
      ${dias.map((k) => `<div style="display:grid;grid-template-columns:64px minmax(0,1fr) 16px;align-items:center;gap:8px">
        <span style="font-size:15px">${esc(nomeDia(k))}</span>
        <span style="display:flex;flex-direction:column;gap:3px">
          <i style="display:block;height:9px;width:${Math.round((diaDe(eu, k).totalMl / max) * 100)}%;background:var(--azul)"></i>
          ${B ? `<i style="display:block;height:9px;width:${Math.round((diaDe(S.ela, k).totalMl / max) * 100)}%;background:var(--rosa)"></i>` : ""}
        </span>
        <span>${ambos(k) ? CORACAO_SVG("#D9467A", 14) : ""}</span>
      </div>`).join("")}
    </section>
  </div>${nav("estrela")}`;
}

// ------------------------------------------------------------------ atualização sem recriar a tela
// Compara a tela nova com a atual e mexe só no que mudou. Assim as transições de CSS funcionam
// (a barra cresce em vez de pular) e só o que realmente entrou ganha animação de entrada.
const ANIMA_AO_ENTRAR = ".registro, .edit-linha, .status, .fundo-folha";
function mesmoNo(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  return a.nodeName === b.nodeName && (a.getAttribute("data-key") || "") === (b.getAttribute("data-key") || "");
}
function morphNo(a, b) {
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name) && at.name !== "data-novo") a.removeAttribute(at.name);
  for (const at of [...b.attributes]) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  if (a.tagName === "INPUT" || a.tagName === "SELECT" || a.tagName === "TEXTAREA") {
    if (document.activeElement !== a) {
      if (a.type === "checkbox" || a.type === "radio") a.checked = b.hasAttribute("checked");
      else if (a.tagName !== "SELECT" && a.value !== (b.getAttribute("value") ?? "")) a.value = b.getAttribute("value") ?? "";
    }
    if (a.tagName !== "SELECT") return;
    if (document.activeElement === a) return;
  }
  morph(a, b);
  if (a.tagName === "SELECT") { const sel = [...b.options].findIndex((o) => o.hasAttribute("selected")); if (sel >= 0) a.selectedIndex = sel; }
}
function morph(pai, novoPai) {
  const novos = [...novoPai.childNodes];
  const porChave = new Map();
  const repetidas = new Set();
  for (const n of pai.childNodes) {
    if (n.nodeType !== 1 || !n.dataset.key) continue;
    if (porChave.has(n.dataset.key)) repetidas.add(n.dataset.key); // chave repetida: não confia nela
    porChave.set(n.dataset.key, n);
  }
  for (const k of repetidas) porChave.delete(k);
  novos.forEach((nb, i) => {
    const atual = pai.childNodes[i];
    let alvo = null;
    const chave = nb.nodeType === 1 ? nb.dataset.key : null;
    if (chave && porChave.has(chave)) { alvo = porChave.get(chave); porChave.delete(chave); }
    else if (atual && !(atual.nodeType === 1 && atual.dataset.key && !chave) && mesmoNo(atual, nb)) alvo = atual;
    if (alvo && mesmoNo(alvo, nb)) {
      if (alvo !== atual) pai.insertBefore(alvo, atual || null);
      morphNo(alvo, nb);
    } else {
      if (nb.nodeType === 1 && nb.matches(ANIMA_AO_ENTRAR) && pai.isConnected && $app.dataset.pronto) nb.setAttribute("data-novo", "");
      pai.insertBefore(nb, atual || null);
    }
  });
  while (pai.childNodes.length > novos.length) pai.removeChild(pai.lastChild);
}
requestAnimationFrame(() => requestAnimationFrame(() => { $app.dataset.pronto = "1"; }));

// ------------------------------------------------------------------ movimento
const reduzir = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Adiciona água; se for hoje, a gotinha "engole" e, se bateu a meta agora, comemora.
async function adicionarComFesta(ml, h, key = S.hoje) {
  const antes = diaDe(S.user.uid, key);
  await adicionar(ml, h, key);
  if (key !== S.hoje) return;
  const card = $app.querySelector('[data-key="pessoa-eu"]');
  if (!card || reduzir()) return;
  const gota = card.querySelector("svg");
  const bateuAgora = antes.totalMl < antes.metaMl && antes.totalMl + ml >= antes.metaMl;
  if (bateuAgora) {
    // raro (1 vez por dia): aqui cabe um pulinho com bounce e confete
    gota.animate(
      [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-14px) scale(1.08)", offset: 0.35 }, { transform: "translateY(0) scale(0.96)", offset: 0.7 }, { transform: "translateY(0) scale(1)" }],
      { duration: 650, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
    );
    confete(card);
  } else {
    // frequente (dezenas por dia): gole discreto, quase imperceptível
    gota.animate([{ transform: "scale(1, 1)" }, { transform: "scale(1.04, 0.94)" }, { transform: "scale(1, 1)" }], { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
  }
}

function confete(origem) {
  const r = origem.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * 0.35;
  const cores = ["#4A9BF5", "#F59AC0", "#FFC93C", "#6FD9B5", "#B49BF5", "#FFFFFF"];
  for (let i = 0; i < 26; i++) {
    const p = document.createElement("i");
    p.className = "confete";
    p.style.left = cx + "px"; p.style.top = cy + "px";
    p.style.background = cores[i % cores.length];
    document.body.appendChild(p);
    const ang = (Math.PI * 2 * i) / 26 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 70;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 30;
    p.animate(
      [{ transform: "translate(-50%, -50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1, offset: 0.6 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 40}px)) scale(0.6)`, opacity: 0 }],
      { duration: 900 + Math.random() * 300, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
    ).onfinish = () => p.remove();
  }
}

// Folha "+ outro": sai pelo mesmo caminho que entrou
function fecharFolha() {
  const f = $app.querySelector(".fundo-folha");
  if (!f || f.classList.contains("saindo")) { S.folha = null; render(true); return; }
  f.classList.remove("arrastando");
  f.querySelector(".folha").style.transform = "";
  f.classList.add("saindo");
  if (S.folha) S.folha.fechando = true; // se a tela redesenhar no meio, continua saindo
  setTimeout(() => { S.folha = null; render(true); }, reduzir() ? 0 : 250);
}

// Arrastar a folha pra baixo pra fechar (skill gestures: segue o dedo 1:1, fecha por distância OU velocidade)
let arraste = null;
$app.addEventListener("pointerdown", (ev) => {
  const folha = ev.target.closest(".folha");
  if (!folha || arraste || ev.target.closest("button, input, select, label")) return;
  ev.preventDefault(); // não seleciona texto enquanto arrasta
  arraste = { folha, y0: ev.clientY, t0: performance.now(), dy: 0, id: ev.pointerId };
  folha.setPointerCapture(ev.pointerId);
  folha.closest(".fundo-folha").classList.add("arrastando");
});
$app.addEventListener("pointermove", (ev) => {
  if (!arraste || ev.pointerId !== arraste.id) return;
  let dy = ev.clientY - arraste.y0;
  if (dy < 0) dy = -Math.sqrt(-dy) * 2; // pra cima: resistência em vez de parede
  arraste.dy = dy;
  arraste.folha.style.transform = `translateY(${dy}px)`;
});
function soltarArraste(ev) {
  if (!arraste || ev.pointerId !== arraste.id) return;
  const { folha, dy, t0 } = arraste;
  arraste = null;
  const vel = Math.abs(dy) / Math.max(1, performance.now() - t0);
  if (dy > folha.offsetHeight * 0.3 || (dy > 10 && vel > 0.11)) return fecharFolha();
  folha.closest(".fundo-folha").classList.remove("arrastando");
  folha.style.transform = ""; // volta com a curva da gaveta
}
$app.addEventListener("pointerup", soltarArraste);
$app.addEventListener("pointercancel", soltarArraste);

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
    else if (r.nome === "conquistas") html = telaConquistas();
    else if (r.nome === "resumo") html = telaResumo();
    else if (r.nome === "conectar-extensao") html = telaConectarExtensao();
    else html = telaHoje();
    html += folhaOutro();
  }
  const novo = document.createElement("div");
  novo.innerHTML = demo + html;
  // cada tela tem sua chave: trocar de aba troca a tela inteira; dentro da mesma tela, só o que mudou
  const tela = novo.querySelector(".tela, .carregando");
  if (tela) tela.dataset.key = "tela-" + (S.user ? (S.perfil?.duplaId ? rota().nome : "x") : "login");
  morph($app, novo);
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
      const cod = (document.getElementById("dpl-codigo")?.value || S.convite || "").trim().toUpperCase();
      if (cod.length < 6) { S.dplErro = "O código tem 6 letras."; render(true); break; }
      try {
        await salvarNomeDupla();
        await S.store.entrarDupla(S.user.uid, cod);
        try { localStorage.removeItem("gotinhas-convite"); } catch {}
        S.convite = null;
        location.hash = "#/hoje";
      } catch (e) {
        S.dplErro = e.message === "codigo-invalido" ? "Esse código não existe. Confere com ela?" : e.message === "dupla-cheia" ? "Essa dupla já tem duas pessoas." : "Não deu pra entrar. Tente de novo.";
        render(true);
      }
      break;
    }
    case "compartilhar": {
      const cod = codigoAtual();
      if (!cod) { alert("Não achei o código da dupla. Feche e abra o app de novo."); break; }
      const link = linkConvite(cod);
      const texto = `Bora beber água comigo no Gotinhas? 💧 Toca no link pra entrar na minha dupla (no iPhone, abre no Safari):`;
      try {
        const celular = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
        if (celular && navigator.share) await navigator.share({ title: "Gotinhas", text: texto, url: link });
        else { await navigator.clipboard.writeText(`${texto}\n${link}`); alert("Convite copiado! É só colar no WhatsApp."); }
      } catch {}
      break;
    }
    case "banner-ok":
      localStorage.setItem("gotinhas-banner-ok", "1"); render(true);
      break;
    case "add":
      await adicionarComFesta(Number(el.dataset.ml));
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
      fecharFolha();
      break;
    case "folha-ok": {
      const ml = parseInt(document.getElementById("folha-ml").value, 10);
      const h = document.getElementById("folha-h").value || agoraHHMM();
      if (!ml || ml <= 0) return;
      fecharFolha();
      await adicionarComFesta(Math.min(ml, 3000), h);
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
      const key = el.dataset.dia;
      await adicionar(S.perfil.copoMl, key === S.hoje ? agoraHHMM() : "12:00", key);
      break;
    }
    case "zerar":
      if (confirm("Apagar todos os registros desse dia?")) await mudarRegistros(el.dataset.dia, () => []);
      break;
    case "cutucar": {
      const ate = Number(localStorage.getItem("gotinhas-cutucada-ate") || 0);
      if (Date.now() < ate) break;
      el.disabled = true;
      try {
        const r = await S.store.cutucar();
        localStorage.setItem("gotinhas-cutucada-ate", String(Date.now() + (r.proximaEmMin || 30) * 60000));
        S.cutucadaMsg = "Cutucada enviada ✓";
      } catch (e) {
        S.cutucadaMsg = erroCutucada(e);
        if (e.faltaMin) localStorage.setItem("gotinhas-cutucada-ate", String(Date.now() + e.faltaMin * 60000));
      }
      render(true);
      setTimeout(() => { S.cutucadaMsg = ""; render(); }, 6000);
      break;
    }
    case "push-ativar":
      S.pushMsg = "";
      try {
        await S.store.ativarPush(S.user.uid);
        await S.store.salvarPerfil(S.user.uid, { lembretes: true });
        S.pushMsg = "Notificações ativadas neste aparelho ✓";
      } catch (e) {
        S.pushMsg = ({ negado: "Você recusou a permissão. Libere nas configurações do aparelho.", "nao-suportado": "Este navegador não recebe notificações. No iPhone, abra pelo ícone da tela inicial.", "sem-vapid": "Notificações ainda não configuradas (veja o README)." })[e.message] || "Não deu pra ativar. Tente de novo.";
      }
      render(true);
      break;
    case "push-desativar":
      await S.store.desativarPush(S.user.uid);
      await S.store.salvarPerfil(S.user.uid, { lembretes: false });
      S.pushMsg = "Lembretes desligados.";
      render(true);
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
  if (el.name === "cor" || el.name === "acessorio") {
    const f = document.getElementById("form-config");
    const cor = f.cor.value, ac = f.acessorio.value;
    document.getElementById("prev-gota").innerHTML = gotaSVG(cor, "feliz", 12, "Sua gotinha", ac);
    if (el.name === "cor") f.querySelectorAll(".acess span").forEach((sp, i) => { sp.firstElementChild.outerHTML = gotaSVG(cor, "normal", 3.4, "", Object.keys(ACESSORIOS)[i]); });
    return;
  }
  if (el.id === "cfg-intervalo") { await S.store.salvarPerfil(S.user.uid, { intervaloMin: Number(el.value) }); return; }
  if (el.id === "cfg-cutucadas") { await S.store.salvarPerfil(S.user.uid, { cutucadas: el.checked }); return; }
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
      cor: CORES[f.cor.value] ? f.cor.value : "azul",
      acessorio: ACESSORIOS[f.acessorio.value] ? f.acessorio.value : "nenhum",
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
    } catch (e) {
      console.warn("config:", e);
      S.cfgMsg = String(e?.code || "").includes("permission") ? "Não deu pra salvar: as regras do Firestore estão desatualizadas (publique o firestore.rules de novo)." : "Não deu pra salvar. Confira a internet.";
    }
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

window.addEventListener("hashchange", () => { S.folha = null; aoEntrarNaRota(); render(true); window.scrollTo(0, 0); });

async function aoEntrarNaRota() {
  if (!S.user || !S.perfil?.duplaId) return;
  const r = rota();
  if (r.nome === "conquistas" || r.nome === "resumo") {
    for (const uid of [S.user.uid, S.ela]) {
      if (!uid) continue;
      S.store.buscarTodosDias(uid).then((m) => { S.historico[uid] = m; render(); }).catch(() => {});
    }
    S.store.contagemCutucadas(S.user.uid).then((n) => { S.cutucadasTotal = n; render(); }).catch(() => {});
  }
  if (r.nome === "conectar-extensao" && !S.extStatus) {
    S.extStatus = "conectando";
    try {
      const token = await S.store.tokenExtensao();
      let confirmou = false;
      const ouvir = (ev) => { if (ev.data?.fonte === "gotinhas-ext" && ev.data?.tipo === "ok") { confirmou = true; S.extStatus = "ok"; render(); } };
      window.addEventListener("message", ouvir);
      window.postMessage({ fonte: "gotinhas-site", tipo: "token-extensao", token }, location.origin);
      setTimeout(() => { window.removeEventListener("message", ouvir); if (!confirmou) { S.extStatus = "sem-extensao"; render(); } }, 4000);
    } catch (e) {
      S.extStatus = e.message === "sem-worker" ? "sem-worker" : "erro";
    }
    render();
  }
}

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
