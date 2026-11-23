// Camada de dados. Mesma interface para o Firebase e para o modo demo (localStorage).
import * as CFG from "./firebase-config.js";
const firebaseConfig = CFG.firebaseConfig;
const VAPID = CFG.vapidKey || "";
const WORKER = (CFG.workerUrl || "").replace(/\/$/, "");

export const PERFIL_PADRAO = {
  nome: "",
  cor: "azul",
  metaMl: 2000,
  copoMl: 250,
  inicio: "08:00",
  fim: "17:48",
  duplaId: null,
  codigo: null,
  lembretes: false,
  cutucadas: true,
  intervaloMin: 60,
};

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I
export function gerarCodigo() {
  let s = "";
  const r = crypto.getRandomValues(new Uint32Array(6));
  for (const n of r) s += ALFABETO[n % ALFABETO.length];
  return s;
}

export function chaveDia(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function normalizarDia(doc, metaPadrao) {
  const registros = Array.isArray(doc?.registros) ? doc.registros : [];
  const totalMl = Math.max(0, registros.reduce((a, r) => a + (Number(r.ml) || 0), 0));
  return { metaMl: doc?.metaMl ?? metaPadrao, registros, totalMl };
}

// ---------------------------------------------------------------- Firebase
async function criarFirebase(cfg) {
  const V = "12.10.0";
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const A = await import(`${base}/firebase-auth.js`);
  const F = await import(`${base}/firebase-firestore.js`);

  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch {
    db = F.getFirestore(app);
  }

  return {
    modo: "firebase",
    onAuth: (cb) => A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, nome: u.displayName || "", email: u.email || "" } : null)),
    entrarGoogle: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    entrarEmail: (email, senha, criar) =>
      criar ? A.createUserWithEmailAndPassword(auth, email, senha) : A.signInWithEmailAndPassword(auth, email, senha),
    sair: () => A.signOut(auth),

    async garantirPerfil(user) {
      const ref = F.doc(db, "users", user.uid);
      const snap = await F.getDoc(ref);
      if (!snap.exists()) {
        await F.setDoc(ref, { ...PERFIL_PADRAO, nome: user.nome || (user.email || "").split("@")[0] });
      }
    },
    ouvirPerfil: (uid, cb) =>
      F.onSnapshot(F.doc(db, "users", uid), (s) => cb(s.exists() ? { ...PERFIL_PADRAO, ...s.data() } : null), () => cb(null)),
    salvarPerfil: (uid, parcial) => F.setDoc(F.doc(db, "users", uid), parcial, { merge: true }),

    async criarDupla(uid) {
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const codigo = gerarCodigo();
        const dRef = F.doc(F.collection(db, "duplas"));
        const batch = F.writeBatch(db);
        batch.set(dRef, { membros: [uid], codigo, criadoEm: F.serverTimestamp() });
        batch.set(F.doc(db, "codigos", codigo), { duplaId: dRef.id, dono: uid });
        batch.set(F.doc(db, "users", uid), { duplaId: dRef.id, codigo }, { merge: true });
        try {
          await batch.commit();
          return codigo;
        } catch (e) {
          if (tentativa === 4) throw e;
        }
      }
    },
    async entrarDupla(uid, codigo) {
      const c = await F.getDoc(F.doc(db, "codigos", codigo.toUpperCase().trim()));
      if (!c.exists()) throw new Error("codigo-invalido");
      const duplaId = c.data().duplaId;
      try {
        await F.updateDoc(F.doc(db, "duplas", duplaId), { membros: F.arrayUnion(uid) });
      } catch {
        throw new Error("dupla-cheia");
      }
      await F.setDoc(F.doc(db, "users", uid), { duplaId, cor: "rosa" }, { merge: true });
    },
    ouvirDupla: (id, cb) =>
      F.onSnapshot(F.doc(db, "duplas", id), (s) => cb(s.exists() ? { id, ...s.data() } : null), (e) => { console.warn("dupla:", e); cb(null); }),
    async buscarMeuCodigo(uid) {
      const q = F.query(F.collection(db, "codigos"), F.where("dono", "==", uid), F.limit(1));
      const snap = await F.getDocs(q);
      return snap.empty ? null : snap.docs[0].id;
    },
    ouvirPerfilDela: (uid, cb) =>
      F.onSnapshot(F.doc(db, "users", uid), (s) => cb(s.exists() ? { ...PERFIL_PADRAO, ...s.data() } : null), () => cb(null)),

    ouvirMes(uid, ym, cb) {
      const q = F.query(
        F.collection(db, "users", uid, "dias"),
        F.where(F.documentId(), ">=", `${ym}-01`),
        F.where(F.documentId(), "<=", `${ym}-31`)
      );
      return F.onSnapshot(
        q,
        (snap) => {
          const mapa = {};
          snap.forEach((d) => (mapa[d.id] = d.data()));
          cb(mapa);
        },
        () => cb({})
      );
    },
    async buscarTodosDias(uid) {
      const snap = await F.getDocs(F.collection(db, "users", uid, "dias"));
      const mapa = {};
      snap.forEach((d) => (mapa[d.id] = d.data()));
      return mapa;
    },
    async contagemCutucadas(uid) {
      try { const s = await F.getDoc(F.doc(db, "cutucadas", uid)); return s.exists() ? s.data().total || 0 : 0; } catch { return 0; }
    },

    // ---- notificações (push)
    pushDisponivel: () => !!(VAPID && WORKER),
    async ativarPush(uid) {
      if (!VAPID) throw new Error("sem-vapid");
      const M = await import(`${base}/firebase-messaging.js`);
      if (!(await M.isSupported())) throw new Error("nao-suportado");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("negado");
      const reg = await navigator.serviceWorker.ready;
      const token = await M.getToken(M.getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: reg });
      if (!token) throw new Error("sem-token");
      await F.setDoc(F.doc(db, "users", uid, "tokens", token), { criadoEm: F.serverTimestamp(), ua: navigator.userAgent.slice(0, 120) });
      try { localStorage.setItem("gotinhas-push-token", token); } catch {}
      return token;
    },
    async desativarPush(uid) {
      const token = localStorage.getItem("gotinhas-push-token");
      if (token) await F.deleteDoc(F.doc(db, "users", uid, "tokens", token)).catch(() => {});
      localStorage.removeItem("gotinhas-push-token");
    },
    pushAtivoNesteAparelho: () => !!localStorage.getItem("gotinhas-push-token") && typeof Notification !== "undefined" && Notification.permission === "granted",
    async chamarWorker(caminho) {
      if (!WORKER) throw new Error("sem-worker");
      const idToken = await auth.currentUser.getIdToken();
      const r = await fetch(`${WORKER}${caminho}`, { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(d.erro || "erro"); Object.assign(e, d); throw e; }
      return d;
    },
    cutucar() { return this.chamarWorker("/cutucar"); },
    async tokenExtensao() { return (await this.chamarWorker("/ext-token")).token; },

    salvarDia: (uid, key, dados) =>
      F.setDoc(F.doc(db, "users", uid, "dias", key), { ...dados, atualizadoEm: F.serverTimestamp() }),
  };
}

// ---------------------------------------------------------------- Demo
function criarDemo() {
  const KEY = "gotinhas-demo-v1";
  const ELA = "demo-ela";
  const EU = "demo-eu";
  const ouvintes = new Set();
  let authCb = null;

  function semente() {
    const db = {
      logado: false,
      perfis: { [ELA]: { ...PERFIL_PADRAO, nome: "Ela (demo)", cor: "rosa", duplaId: null } },
      duplas: {},
      dias: { [EU]: {}, [ELA]: {} },
    };
    const hoje = new Date();
    for (let i = 1; i <= 50; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i);
      const k = chaveDia(d);
      for (const [uid, sal] of [[EU, 7], [ELA, 13]]) {
        const regs = [];
        const n = 5 + ((i * sal) % 4);
        for (let j = 0; j < n; j++) {
          const h = 8 + Math.floor((j * 10) / n) + (uid === ELA ? 1 : 0);
          regs.push({ id: `${k}-${j}`, h: `${String(h).padStart(2, "0")}:${String((j * 17 + i) % 60).padStart(2, "0")}`, ml: [250, 300, 350, 500][(i + j * sal) % 4] });
        }
        db.dias[uid][k] = normalizarDia({ metaMl: 2000, registros: regs }, 2000);
      }
    }
    // hoje dela: até a hora atual
    const regs = [];
    const agora = hoje.getHours();
    for (let h = 8; h <= Math.min(agora, 21); h += 2) regs.push({ id: `ela-${h}`, h: `${String(h).padStart(2, "0")}:10`, ml: 300 });
    db.dias[ELA][chaveDia(hoje)] = normalizarDia({ metaMl: 2000, registros: regs }, 2000);
    return db;
  }

  const ler = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || semente(); } catch { return semente(); }
  };
  let db = ler();
  const gravar = () => {
    localStorage.setItem(KEY, JSON.stringify(db));
    for (const f of ouvintes) f();
  };
  const ouvir = (fn) => {
    ouvintes.add(fn);
    setTimeout(fn, 0);
    return () => ouvintes.delete(fn);
  };
  const user = () => (db.logado ? { uid: EU, nome: "Você", email: "demo@gotinhas" } : null);

  return {
    modo: "demo",
    onAuth(cb) { authCb = cb; setTimeout(() => cb(user()), 0); return () => (authCb = null); },
    async entrarGoogle() { db.logado = true; gravar(); authCb?.(user()); },
    async entrarEmail() { db.logado = true; gravar(); authCb?.(user()); },
    async sair() { localStorage.removeItem(KEY); db = semente(); authCb?.(null); },

    async garantirPerfil(u) {
      if (!db.perfis[u.uid]) { db.perfis[u.uid] = { ...PERFIL_PADRAO, nome: "Você" }; gravar(); }
    },
    ouvirPerfil: (uid, cb) => ouvir(() => cb(db.perfis[uid] ? { ...PERFIL_PADRAO, ...db.perfis[uid] } : null)),
    ouvirPerfilDela: (uid, cb) => ouvir(() => cb(db.perfis[uid] ? { ...PERFIL_PADRAO, ...db.perfis[uid] } : null)),
    async salvarPerfil(uid, parcial) { db.perfis[uid] = { ...db.perfis[uid], ...parcial }; gravar(); },

    async criarDupla(uid) {
      const codigo = gerarCodigo();
      db.duplas.demo = { id: "demo", codigo, membros: [uid] };
      db.perfis[uid].duplaId = "demo";
      db.perfis[uid].codigo = codigo;
      gravar();
      // a "namorada demo" entra sozinha depois de 3 segundos
      setTimeout(() => {
        db.duplas.demo.membros = [uid, ELA];
        db.perfis[ELA].duplaId = "demo";
        gravar();
      }, 3000);
      return codigo;
    },
    async entrarDupla(uid, codigo) {
      if (!codigo || codigo.trim().length < 4) throw new Error("codigo-invalido");
      db.duplas.demo = { id: "demo", codigo: codigo.toUpperCase(), membros: [ELA, uid] };
      db.perfis[uid] = { ...db.perfis[uid], duplaId: "demo", cor: "azul" };
      db.perfis[ELA].duplaId = "demo";
      gravar();
    },
    ouvirDupla: (id, cb) => ouvir(() => cb(db.duplas[id] || null)),

    ouvirMes: (uid, ym, cb) =>
      ouvir(() => {
        const mapa = {};
        for (const [k, v] of Object.entries(db.dias[uid] || {})) if (k.startsWith(ym)) mapa[k] = v;
        cb(mapa);
      }),
    async buscarTodosDias(uid) { return { ...(db.dias[uid] || {}) }; },
    async contagemCutucadas() { return db.cutucadasTotal || 0; },
    pushDisponivel: () => true,
    async ativarPush() { localStorage.setItem("gotinhas-push-token", "demo"); return "demo"; },
    async desativarPush() { localStorage.removeItem("gotinhas-push-token"); },
    pushAtivoNesteAparelho: () => !!localStorage.getItem("gotinhas-push-token"),
    async cutucar() {
      const ultima = db.ultimaCutucada || 0;
      const passou = (Date.now() - ultima) / 60000;
      if (passou < 30) { const e = new Error("espera"); e.faltaMin = Math.ceil(30 - passou); throw e; }
      db.ultimaCutucada = Date.now(); db.cutucadasTotal = (db.cutucadasTotal || 0) + 1; gravar();
      return { ok: true, proximaEmMin: 30 };
    },
    async tokenExtensao() { return "demo-token"; },
    async salvarDia(uid, key, dados) {
      db.dias[uid] = db.dias[uid] || {};
      db.dias[uid][key] = dados;
      gravar();
    },
  };
}

export async function criarStore() {
  if (firebaseConfig && firebaseConfig.apiKey) return criarFirebase(firebaseConfig);
  return criarDemo();
}
