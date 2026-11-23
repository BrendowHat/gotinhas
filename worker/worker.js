// Gotinhas — Cloudflare Worker (plano grátis)
//
// Faz três coisas:
//   POST /cutucar     → manda uma cutucada pra outra pessoa da dupla (com anti-spam)
//   POST /ext-token   → gera um token para conectar a extensão do Chrome à conta
//   cron (de hora em hora) → manda os lembretes de água
//
// Variáveis (Settings → Variables and Secrets):
//   FIREBASE_SA  (Secret)  → o JSON inteiro da conta de serviço do Firebase
//   API_KEY      (Text)    → apiKey do firebase-config.js
//   SITE_ORIGIN  (Text)    → https://brendowhat.github.io

const FUSO = "America/Sao_Paulo";
const ESPERA_MIN = 30;      // intervalo mínimo entre cutucadas
const MAX_POR_DIA = 5;      // cutucadas por dia

// ------------------------------------------------------------------ HTTP
export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    try {
      if (req.method === "POST" && url.pathname === "/cutucar") return json(await cutucar(req, env), 200, cors);
      if (req.method === "POST" && url.pathname === "/ext-token") return json(await extToken(req, env), 200, cors);
      if (url.pathname === "/") return json({ ok: true, app: "gotinhas" }, 200, cors);
      return json({ erro: "nao-encontrado" }, 404, cors);
    } catch (e) {
      const status = e.status || 500;
      return json({ erro: e.code || "erro-interno", faltaMin: e.faltaMin, detalhe: status === 500 ? String(e.message || e) : undefined }, status, cors);
    }
  },

  async scheduled(_evento, env, ctx) {
    ctx.waitUntil(lembretes(env));
  },
};

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const ok = origin === env.SITE_ORIGIN || origin.startsWith("http://localhost");
  return {
    "Access-Control-Allow-Origin": ok ? origin : env.SITE_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
  };
}
const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });
function falha(code, status = 400, extra = {}) {
  const e = new Error(code);
  e.code = code; e.status = status; Object.assign(e, extra);
  return e;
}

// ------------------------------------------------------------------ hora de São Paulo
export function agoraSP(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value])
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), hora: Number(p.hour) };
}
const paraMin = (hhmm = "00:00") => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
export function dentroDaJanela(perfil, min) {
  return min >= paraMin(perfil.inicio || "08:00") && min <= paraMin(perfil.fim || "18:00");
}

// ------------------------------------------------------------------ Google: token de acesso da conta de serviço
const b64url = (buf) => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new TextEncoder().encode(buf);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
let chaveCache = null;
async function chavePrivada(sa) {
  if (chaveCache) return chaveCache;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  chaveCache = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  return chaveCache;
}
export async function assinarJWT(sa, payload) {
  const cab = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await chavePrivada(sa), new TextEncoder().encode(`${cab}.${corpo}`));
  return `${cab}.${corpo}.${b64url(sig)}`;
}
let acessoCache = { token: null, exp: 0 };
async function tokenAcesso(env) {
  if (acessoCache.token && Date.now() < acessoCache.exp - 60000) return acessoCache.token;
  const sa = conta(env);
  const agora = Math.floor(Date.now() / 1000);
  const assertion = await assinarJWT(sa, {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora, exp: agora + 3600,
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("google-token: " + JSON.stringify(d));
  acessoCache = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return acessoCache.token;
}
function conta(env) {
  if (!env.FIREBASE_SA) throw new Error("FIREBASE_SA não configurado");
  return typeof env.FIREBASE_SA === "string" ? JSON.parse(env.FIREBASE_SA) : env.FIREBASE_SA;
}

// ------------------------------------------------------------------ quem está chamando (token do Firebase Auth)
async function usuarioDoPedido(req, env) {
  const idToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!idToken) throw falha("sem-login", 401);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  const d = await r.json();
  const uid = d?.users?.[0]?.localId;
  if (!uid) throw falha("login-invalido", 401);
  return uid;
}

// ------------------------------------------------------------------ Firestore REST (como administrador)
export function deValor(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(deValor);
  if ("mapValue" in v) return deCampos(v.mapValue.fields || {});
  return null;
}
export const deCampos = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, deValor(v)]));
export function paraValor(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(paraValor) } };
  return { mapValue: { fields: paraCampos(x) } };
}
export const paraCampos = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, paraValor(v)]));

const base = (env) => `https://firestore.googleapis.com/v1/projects/${conta(env).project_id}/databases/(default)/documents`;
async function fsGet(env, caminho) {
  const r = await fetch(`${base(env)}/${caminho}`, { headers: { Authorization: `Bearer ${await tokenAcesso(env)}` } });
  if (r.status === 404) return null;
  const d = await r.json();
  if (!r.ok) throw new Error("firestore-get: " + JSON.stringify(d));
  return deCampos(d.fields);
}
async function fsSet(env, caminho, obj) {
  const r = await fetch(`${base(env)}/${caminho}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${await tokenAcesso(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: paraCampos(obj) }),
  });
  if (!r.ok) throw new Error("firestore-set: " + (await r.text()));
}
async function fsDel(env, caminho) {
  await fetch(`${base(env)}/${caminho}`, { method: "DELETE", headers: { Authorization: `Bearer ${await tokenAcesso(env)}` } });
}
async function fsListar(env, colecao) {
  const r = await fetch(`${base(env)}/${colecao}?pageSize=50`, { headers: { Authorization: `Bearer ${await tokenAcesso(env)}` } });
  const d = await r.json();
  return (d.documents || []).map((doc) => ({ id: doc.name.split("/").pop(), ...deCampos(doc.fields) }));
}
async function usuariosComLembrete(env) {
  const r = await fetch(`${base(env)}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await tokenAcesso(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where: { fieldFilter: { field: { fieldPath: "lembretes" }, op: "EQUAL", value: { booleanValue: true } } },
        limit: 50,
      },
    }),
  });
  const linhas = await r.json();
  return (Array.isArray(linhas) ? linhas : []).filter((l) => l.document).map((l) => ({ uid: l.document.name.split("/").pop(), ...deCampos(l.document.fields) }));
}

// ------------------------------------------------------------------ envio de push (FCM)
async function enviarPush(env, uid, msg) {
  const tokens = await fsListar(env, `users/${uid}/tokens`);
  let enviados = 0;
  for (const t of tokens) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${conta(env).project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await tokenAcesso(env)}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: t.id,
          data: { title: msg.title, body: msg.body, tag: msg.tag || "gotinhas", url: msg.url || "./" },
          webpush: { headers: { Urgency: "high", TTL: "3600" } },
        },
      }),
    });
    if (r.ok) enviados++;
    else if (r.status === 404 || r.status === 400) await fsDel(env, `users/${uid}/tokens/${t.id}`); // token velho
  }
  return enviados;
}

function totalDoDia(dia, metaPadrao) {
  const regs = Array.isArray(dia?.registros) ? dia.registros : [];
  const total = regs.reduce((a, r) => a + (Number(r?.ml) || 0), 0);
  return { total, meta: dia?.metaMl ?? metaPadrao ?? 2000 };
}

// ------------------------------------------------------------------ /cutucar
async function cutucar(req, env) {
  const eu = await usuarioDoPedido(req, env);
  const perfil = await fsGet(env, `users/${eu}`);
  if (!perfil?.duplaId) throw falha("sem-dupla");
  const dupla = await fsGet(env, `duplas/${perfil.duplaId}`);
  const ela = (dupla?.membros || []).find((m) => m !== eu);
  if (!ela) throw falha("sem-dupla");
  const perfilDela = (await fsGet(env, `users/${ela}`)) || {};
  if (perfilDela.cutucadas === false) throw falha("ela-desligou");

  const agora = agoraSP();
  if (!dentroDaJanela(perfilDela, agora.min)) throw falha("fora-do-horario", 429);

  const diaDela = totalDoDia(await fsGet(env, `users/${ela}/dias/${agora.dia}`), perfilDela.metaMl);
  if (diaDela.total >= diaDela.meta) throw falha("ela-ja-bateu", 429);

  const reg = (await fsGet(env, `cutucadas/${eu}`)) || {};
  const passou = (Date.now() - (reg.ultimaMs || 0)) / 60000;
  if (passou < ESPERA_MIN) throw falha("espera", 429, { faltaMin: Math.ceil(ESPERA_MIN - passou) });
  const qtdHoje = reg.dia === agora.dia ? reg.qtdDia || 0 : 0;
  if (qtdHoje >= MAX_POR_DIA) throw falha("limite-dia", 429);

  const nome = perfil.nome || "Sua dupla";
  const enviados = await enviarPush(env, ela, {
    title: `${nome} te cutucou 💧`,
    body: `Bora um copinho? Você está em ${diaDela.total} de ${diaDela.meta} ml.`,
    tag: "cutucada",
  });
  if (!enviados) throw falha("ela-sem-notificacao", 409);

  await fsSet(env, `cutucadas/${eu}`, { ultimaMs: Date.now(), dia: agora.dia, qtdDia: qtdHoje + 1, total: (reg.total || 0) + 1 });
  return { ok: true, proximaEmMin: ESPERA_MIN, restamHoje: MAX_POR_DIA - qtdHoje - 1 };
}

// ------------------------------------------------------------------ /ext-token (conectar extensão)
async function extToken(req, env) {
  const uid = await usuarioDoPedido(req, env);
  const sa = conta(env);
  const agora = Math.floor(Date.now() / 1000);
  const token = await assinarJWT(sa, {
    iss: sa.client_email, sub: sa.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: agora, exp: agora + 3600, uid,
  });
  return { token };
}

// ------------------------------------------------------------------ cron: lembretes
export function deveLembrar(perfil, agora) {
  if (!dentroDaJanela(perfil, agora.min)) return false;
  const intervalo = [60, 120, 180].includes(perfil.intervaloMin) ? perfil.intervaloMin : 60;
  const desdeInicio = agora.min - paraMin(perfil.inicio || "08:00");
  // o cron roda de hora em hora; avisa quando passou um múltiplo do intervalo
  return Math.floor(desdeInicio / 60) % (intervalo / 60) === 0;
}

async function lembretes(env) {
  const agora = agoraSP();
  const usuarios = await usuariosComLembrete(env);
  for (const u of usuarios) {
    try {
      if (!deveLembrar(u, agora)) continue;
      const d = totalDoDia(await fsGet(env, `users/${u.uid}/dias/${agora.dia}`), u.metaMl);
      if (d.total >= d.meta) continue;
      const pct = Math.round((d.total / d.meta) * 100);
      let extra = "";
      if (u.duplaId) {
        const dupla = await fsGet(env, `duplas/${u.duplaId}`);
        const ela = (dupla?.membros || []).find((m) => m !== u.uid);
        if (ela) {
          const pe = (await fsGet(env, `users/${ela}`)) || {};
          const de = totalDoDia(await fsGet(env, `users/${ela}/dias/${agora.dia}`), pe.metaMl);
          if (de.total >= de.meta) extra = ` ${pe.nome || "Sua dupla"} já bateu a meta 😉`;
        }
      }
      await enviarPush(env, u.uid, {
        title: "Hora de beber água 💧",
        body: `${d.total} de ${d.meta} ml (${pct}%). Faltam ${d.meta - d.total} ml até ${u.fim || "18:00"}.${extra}`,
        tag: "lembrete",
      });
    } catch (e) {
      console.log("lembrete falhou", u.uid, String(e));
    }
  }
}
