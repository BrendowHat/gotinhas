// Conversa com o Firebase direto pela API REST (sem SDK, para caber nas regras do Chrome MV3).
// As regras do Firestore valem do mesmo jeito: a extensão só vê o que você veria no site.
import { API_KEY, PROJECT_ID } from "./config.js";

const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
export const PERFIL_PADRAO = { nome: "", cor: "azul", metaMl: 2000, copoMl: 250, inicio: "08:00", fim: "17:48", intervaloMin: 60 };

export function chaveDia(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const agoraHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// ------------------------------------------------------------------ login
const lerAuth = async () => (await chrome.storage.local.get("auth")).auth || null;
const uidDoToken = (jwt) => {
  const p = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(p + "===".slice((p.length + 3) % 4))).user_id;
};

export async function conectar(tokenCustom) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: tokenCustom, returnSecureToken: true }),
  });
  const d = await r.json();
  if (!d.idToken) throw new Error("conexao-falhou");
  const auth = { uid: uidDoToken(d.idToken), idToken: d.idToken, refreshToken: d.refreshToken, exp: Date.now() + Number(d.expiresIn) * 1000 };
  await chrome.storage.local.set({ auth });
  return auth;
}
export async function desconectar() {
  await chrome.storage.local.remove(["auth", "cache"]);
}
export const conectado = async () => !!(await lerAuth());

async function idToken() {
  const a = await lerAuth();
  if (!a) throw new Error("desconectado");
  if (Date.now() < a.exp - 60000) return a;
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(a.refreshToken)}`,
  });
  const d = await r.json();
  if (!d.id_token) { await desconectar(); throw new Error("desconectado"); }
  const novo = { uid: d.user_id, idToken: d.id_token, refreshToken: d.refresh_token, exp: Date.now() + Number(d.expires_in) * 1000 };
  await chrome.storage.local.set({ auth: novo });
  return novo;
}

// ------------------------------------------------------------------ Firestore
function deValor(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(deValor);
  if ("mapValue" in v) return deCampos(v.mapValue.fields);
  if ("timestampValue" in v) return v.timestampValue;
  return null;
}
const deCampos = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, deValor(v)]));
function paraValor(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === "boolean") return { booleanValue: x };
  if (typeof x === "number") return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === "string") return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(paraValor) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, paraValor(v)])) } };
}

async function fsGet(caminho) {
  const a = await idToken();
  const r = await fetch(`${FS}/${caminho}`, { headers: { Authorization: `Bearer ${a.idToken}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`leitura ${r.status}`);
  return deCampos((await r.json()).fields);
}
async function fsBatch(caminhos) {
  const a = await idToken();
  const nomeBase = `projects/${PROJECT_ID}/databases/(default)/documents`;
  const r = await fetch(`${FS}:batchGet`, {
    method: "POST", headers: { Authorization: `Bearer ${a.idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ documents: caminhos.map((c) => `${nomeBase}/${c}`) }),
  });
  if (!r.ok) throw new Error(`leitura ${r.status}`);
  const out = {};
  for (const item of await r.json()) {
    if (item.found) out[item.found.name.slice(nomeBase.length + 1)] = deCampos(item.found.fields);
  }
  return out;
}
async function fsSet(caminho, obj, soSeNaoExiste = false) {
  const a = await idToken();
  const q = soSeNaoExiste ? "?currentDocument.exists=false" : "";
  const fields = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, paraValor(v)]));
  fields.atualizadoEm = { timestampValue: new Date().toISOString() };
  const r = await fetch(`${FS}/${caminho}${q}`, {
    method: "PATCH", headers: { Authorization: `Bearer ${a.idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`gravacao ${r.status}`);
}

export function normalizarDia(doc, metaPadrao) {
  const registros = Array.isArray(doc?.registros) ? doc.registros : [];
  return { metaMl: doc?.metaMl ?? metaPadrao, registros, totalMl: registros.reduce((a, r) => a + (Number(r.ml) || 0), 0) };
}

// ------------------------------------------------------------------ dados do popup
export async function carregar() {
  const { uid } = await idToken();
  const perfil = { ...PERFIL_PADRAO, ...((await fsGet(`users/${uid}`)) || {}) };
  let ela = null, perfilDela = null;
  if (perfil.duplaId) {
    const dupla = await fsGet(`duplas/${perfil.duplaId}`).catch(() => null);
    ela = (dupla?.membros || []).find((m) => m !== uid) || null;
    if (ela) perfilDela = { ...PERFIL_PADRAO, ...((await fsGet(`users/${ela}`).catch(() => null)) || {}) };
  }
  const dias = [];
  const hoje = new Date();
  for (let i = 6; i >= 0; i--) dias.push(chaveDia(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i)));
  const caminhos = dias.map((k) => `users/${uid}/dias/${k}`).concat(ela ? dias.map((k) => `users/${ela}/dias/${k}`) : []);
  const docs = await fsBatch(caminhos).catch(() => ({}));
  const semana = dias.map((k) => ({
    k,
    eu: normalizarDia(docs[`users/${uid}/dias/${k}`], perfil.metaMl),
    ela: ela ? normalizarDia(docs[`users/${ela}/dias/${k}`], perfilDela.metaMl) : null,
  }));
  const dados = { uid, perfil, ela, perfilDela, semana, atualizado: Date.now() };
  await chrome.storage.local.set({ cache: dados });
  return dados;
}
export const doCache = async () => (await chrome.storage.local.get("cache")).cache || null;

export async function adicionar(ml, perfil) {
  const { uid } = await idToken();
  const k = chaveDia();
  const atual = await fsGet(`users/${uid}/dias/${k}`);
  const d = normalizarDia(atual, perfil.metaMl);
  const registros = [...d.registros, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), h: agoraHHMM(), ml }]
    .sort((a, b) => a.h.localeCompare(b.h));
  const totalMl = registros.reduce((a, r) => a + r.ml, 0);
  await fsSet(`users/${uid}/dias/${k}`, { metaMl: atual?.metaMl ?? perfil.metaMl, registros, totalMl });
}

// Importa o histórico da extensão antiga ("Meta de Água"), se estiver neste mesmo navegador.
// Só cria dias que ainda não existem no Firebase; nunca sobrescreve.
export async function importarHistoricoAntigo() {
  const { history, importadoV2 } = await chrome.storage.local.get(["history", "importadoV2"]);
  if (importadoV2 || !history || typeof history !== "object") return 0;
  const { uid } = await idToken();
  let n = 0;
  for (const [k, dia] of Object.entries(history)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !dia) continue;
    const consumido = Math.max(0, Number(dia.consumedMl) || 0);
    if (!consumido) continue;
    let registros = (Array.isArray(dia.entries) ? dia.entries : [])
      .filter((e) => Number(e.ml) > 0 && /^\d{2}:\d{2}$/.test(e.t))
      .map((e, i) => ({ id: `antigo-${k}-${i}`, h: e.t, ml: Number(e.ml) }));
    if (registros.reduce((a, r) => a + r.ml, 0) !== consumido) registros = [{ id: `antigo-${k}`, h: "12:00", ml: consumido }];
    try {
      await fsSet(`users/${uid}/dias/${k}`, { metaMl: Number(dia.goalMl) || 2000, registros, totalMl: consumido }, true);
      n++;
    } catch { /* dia já existe no Firebase: mantém o de lá */ }
  }
  await chrome.storage.local.set({ importadoV2: true });
  return n;
}
