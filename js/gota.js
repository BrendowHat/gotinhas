// Mascote em pixel art: gotinha 16x20 com contorno, sombra e brilho,
// 4 humores, várias cores e acessórios. Desenhada numa tela de 20x26 (sobra espaço pros chapéus).
// humor: "feliz" | "normal" | "triste" | "sede"

const W = 20, H = 26;      // tela
const OX = 2, OY = 5;      // onde a gota começa na tela

// meia-largura de cada linha da gota (16 de largura, centro entre as colunas 7 e 8)
const MEIA = [1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 7, 7, 6, 4];

export const CORES = {
  azul:     { nome: "Azul",     base: "#4A9BF5", sombra: "#2F73D0", luz: "#9ED0FF", contorno: "#173A6B", bochecha: "#F7A8C8" },
  rosa:     { nome: "Rosa",     base: "#F59AC0", sombra: "#D9669A", luz: "#FFD0E3", contorno: "#7A2450", bochecha: "#E0457F" },
  lilas:    { nome: "Lilás",    base: "#B49BF5", sombra: "#8A6AD9", luz: "#DDD0FF", contorno: "#3E2A7A", bochecha: "#F59AC0" },
  menta:    { nome: "Menta",    base: "#6FD9B5", sombra: "#3FB38C", luz: "#BFF5E0", contorno: "#1D5C47", bochecha: "#F59AC0" },
  turquesa: { nome: "Turquesa", base: "#4FD1E0", sombra: "#23A7B8", luz: "#B8F2F8", contorno: "#0F5560", bochecha: "#F59AC0" },
  amarelo:  { nome: "Amarelo",  base: "#FFD45C", sombra: "#E8AD2E", luz: "#FFF0B3", contorno: "#7A5A0B", bochecha: "#F59A7A" },
  laranja:  { nome: "Laranja",  base: "#FFA25C", sombra: "#E07A33", luz: "#FFD6B3", contorno: "#7A3A0B", bochecha: "#F56C8A" },
  vermelho: { nome: "Vermelho", base: "#F56C6C", sombra: "#D04545", luz: "#FFC2C2", contorno: "#6E1A1A", bochecha: "#FFC2D6" },
};

export const ACESSORIOS = {
  nenhum: "Nenhum",
  laco: "Laço",
  coroa: "Coroa",
  festa: "Chapéu de festa",
  gorro: "Gorro",
  oculos: "Óculos escuros",
  fone: "Fone",
  flor: "Florzinha",
};

export const HUMOR_TEXTO = {
  sede: "com sede…",
  triste: "tristinha, tá atrasada",
  normal: "no ritmo",
  feliz: "radiante!",
};

// ------------------------------------------------------------------ forma (calculada uma vez)
const DENTRO = new Set();
for (let y = 0; y < MEIA.length; y++) {
  for (let x = 8 - MEIA[y]; x <= 7 + MEIA[y]; x++) DENTRO.add(`${x},${y}`);
}
const dentro = (x, y) => DENTRO.has(`${x},${y}`);

function misturar(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
  const m = (u, v) => Math.round(u + (v - u) * t).toString(16).padStart(2, "0");
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

// ------------------------------------------------------------------ acessórios (mapas de pixels na tela 20x26)
// cada linha: [coluna inicial, linha, "texto"], onde cada letra é uma cor da paleta do acessório e "." é vazio
const ACESS = {
  laco: {
    pal: { c: "#7A1238", r: "#E8336D", l: "#FF8FB3" },
    px: [
      [2, 5, "cc...cc"],
      [1, 6, "crrc.crc"],
      [1, 7, "crlrcrlrc"],
      [1, 8, "crrrcrrrc"],
      [1, 9, "crrc.crrc"],
      [2, 10, "cc...cc"],
    ],
  },
  coroa: {
    pal: { c: "#6B4A00", o: "#F5C518", l: "#FFE680", g: "#E8336D" },
    px: [
      [5, 0, "c...c...c"],
      [4, 1, "coc.coc.coc"],
      [4, 2, "colcoocoloc"],
      [4, 3, "cooooooooc"],
      [4, 4, "cooogoooooc"],
      [4, 5, "cooooooooooc"],
      [4, 6, "cccccccccccc"],
    ],
  },
  festa: {
    pal: { c: "#1D3A6B", a: "#5BC0FF", b: "#FFD45C", w: "#FFFFFF", r: "#F56C8A" },
    px: [
      [9, 1, "rr"],
      [9, 2, "cc"],
      [8, 3, "cabc"],
      [8, 4, "cbac"],
      [7, 5, "cabbac"],
      [7, 6, "cbaabc"],
      [6, 7, "cabbbbac"],
      [6, 8, "cccccccc"],
    ],
  },
  gorro: {
    pal: { c: "#3A1E1E", v: "#E0457F", e: "#B02A5B", w: "#FFFFFF", s: "#F2F2F2" },
    px: [
      [9, 2, "ww"],
      [8, 3, "wsww"],
      [7, 4, "ccvvcc"],
      [6, 5, "cvvvvvvc"],
      [5, 6, "cvvevvevvc"],
      [4, 7, "cvvvvvvvvvvc"],
      [3, 8, "cwswswswswswsc"],
      [3, 9, "cswswswswswswc"],
      [3, 10, "cccccccccccccc"],
    ],
  },
  oculos: {
    pal: { c: "#111111", d: "#1E1E2E", w: "#9FB6FF" },
    px: [
      [3, 15, "cccccc..cccccc"],
      [3, 16, "cdwddcccdwdddc"],
      [3, 17, "cddddc..cddddc"],
      [4, 18, "cccc....cccc"],
    ],
  },
  fone: {
    pal: { c: "#1B1B2E", g: "#5A5F78", l: "#8C93B0", r: "#F56C8A" },
    px: [
      [6, 1, "cccccccc"],
      [4, 2, "ccggllllggcc"],
      [3, 3, "cgc........cgc"],
      [2, 4, "cgc..........cgc"],
      [2, 5, "cgc..........cgc"],
      [1, 6, "cgc............cgc"],
      [1, 7, "cgc............cgc"],
      [1, 8, "cgc............cgc"],
      [1, 9, "cgc............cgc"],
      [1, 10, "cgc............cgc"],
      [1, 11, "cgc............cgc"],
      [1, 12, "cgc............cgc"],
      [0, 13, "cccc............cccc"],
      [0, 14, "crrgc..........cgrrc"],
      [0, 15, "crlgc..........cglrc"],
      [0, 16, "crrgc..........cgrrc"],
      [0, 17, "crrgc..........cgrrc"],
      [0, 18, "cccc............cccc"],
    ],
  },
  flor: {
    pal: { c: "#7A3A0B", p: "#FFFFFF", s: "#E8E8F0", m: "#FFC93C", f: "#3FB38C" },
    px: [
      [14, 5, ".cpc."],
      [13, 6, "cppppc"],
      [13, 7, "pcmmcp"],
      [13, 8, "ppmmps"],
      [13, 9, "cppssc"],
      [14, 10, ".cfc"],
    ],
  },
};

// ------------------------------------------------------------------ desenho
export function gotaSVG(cor = "azul", humor = "normal", px = 6, label = "", acessorio = "nenhum") {
  const C = CORES[cor] || CORES.azul;
  const palido = humor === "sede";
  const base = palido ? misturar(C.base, "#C9CED6", 0.45) : C.base;
  const sombra = palido ? misturar(C.sombra, "#A9B0BB", 0.45) : C.sombra;
  const luz = palido ? misturar(C.luz, "#E6E9EE", 0.45) : C.luz;
  const OLHO = "#1B2A3A";

  const tela = {}; // "x,y" → cor
  const pinta = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) tela[`${x},${y}`] = c; };
  const pg = (x, y, c) => pinta(OX + x, OY + y, c); // coordenadas da gota

  // contorno: tudo que encosta na gota por fora
  for (let y = -1; y <= MEIA.length; y++)
    for (let x = -1; x <= 16; x++)
      if (!dentro(x, y) && (dentro(x + 1, y) || dentro(x - 1, y) || dentro(x, y + 1) || dentro(x, y - 1))) pg(x, y, C.contorno);

  // corpo com luz (cima-esquerda) e sombra (baixo-direita)
  for (const k of DENTRO) {
    const [x, y] = k.split(",").map(Number);
    const nx = (x - 7.5) / 8, ny = (y - 12.5) / 8;
    const d = nx * 0.55 + ny * 0.85;
    let c = base;
    if (d > 0.5 || (y >= 18)) c = sombra;
    else if (d < -0.75) c = luz;
    pg(x, y, c);
  }
  // borda interna mais escura embaixo
  for (let x = 4; x <= 11; x++) pg(x, 19, sombra);

  // brilho
  for (const [x, y] of [[5, 5], [4, 6], [4, 7], [3, 8], [3, 9]]) pg(x, y, "#FFFFFF");
  pg(3, 11, "#FFFFFF");

  // rosto
  const olhoAberto = (x0) => {
    for (let y = 11; y <= 13; y++) for (let x = x0; x <= x0 + 1; x++) pg(x, y, OLHO);
    pg(x0, 11, "#FFFFFF");
  };
  const bochechas = () => { pg(2, 14, C.bochecha); pg(3, 14, C.bochecha); pg(12, 14, C.bochecha); pg(13, 14, C.bochecha); };

  if (humor === "feliz") {
    for (const [x, y] of [[3, 13], [4, 12], [5, 12], [6, 13], [9, 13], [10, 12], [11, 12], [12, 13]]) pg(x, y, OLHO);
    bochechas();
    for (let x = 6; x <= 9; x++) pg(x, 14, OLHO);
    pg(6, 15, OLHO); pg(7, 15, "#E0567F"); pg(8, 15, "#E0567F"); pg(9, 15, OLHO);
    pg(7, 16, OLHO); pg(8, 16, OLHO);
    // brilhinhos
    for (const [x, y] of [[0, 9], [1, 8], [1, 10], [2, 9]]) pinta(x, y, "#FFC93C");
    for (const [x, y] of [[18, 3], [17, 4], [19, 4], [18, 5]]) pinta(x, y, "#FFC93C");
    pinta(1, 9, "#FFF3B0"); pinta(18, 4, "#FFF3B0");
  } else if (humor === "triste") {
    olhoAberto(4); olhoAberto(10);
    pg(4, 9, OLHO); pg(5, 10, OLHO); pg(11, 9, OLHO); pg(10, 10, OLHO); // sobrancelhas
    pg(6, 16, OLHO); pg(7, 15, OLHO); pg(8, 15, OLHO); pg(9, 16, OLHO);
    pg(11, 14, "#BFE6FF"); pg(11, 15, "#8FD0FF"); pg(12, 16, "#BFE6FF"); // lágrima
  } else if (humor === "sede") {
    for (let x = 3; x <= 6; x++) pg(x, 12, OLHO);
    for (let x = 9; x <= 12; x++) pg(x, 12, OLHO);
    pg(4, 13, OLHO); pg(5, 13, OLHO); pg(10, 13, OLHO); pg(11, 13, OLHO);
    for (let x = 6; x <= 9; x++) pg(x, 15, OLHO);
    pg(6, 16, OLHO); pg(7, 16, "#E0567F"); pg(8, 16, "#E0567F"); pg(9, 16, OLHO);
    pg(8, 17, "#E0567F"); pg(8, 18, OLHO);
    // gotas de suor
    pinta(18, 8, "#8FD0FF"); pinta(17, 9, "#8FD0FF"); pinta(18, 9, "#BFE6FF"); pinta(18, 10, "#5AA9F0");
    pinta(17, 12, "#8FD0FF"); pinta(17, 13, "#5AA9F0");
  } else {
    olhoAberto(4); olhoAberto(10);
    bochechas();
    pg(6, 15, OLHO); pg(7, 16, OLHO); pg(8, 16, OLHO); pg(9, 15, OLHO);
  }

  // acessório por cima
  const a = ACESS[acessorio];
  if (a) for (const [x0, y, s] of a.px) [...s].forEach((ch, i) => { if (ch !== ".") pinta(x0 + i, y, a.pal[ch]); });

  // junta pixels vizinhos da mesma cor na mesma linha (SVG menor)
  let rects = "";
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = tela[`${x},${y}`];
      if (!c) { x++; continue; }
      let w = 1;
      while (tela[`${x + w},${y}`] === c) w++;
      rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`;
      x += w;
    }
  }
  const largura = Math.round(px * 10);
  const altura = Math.round((largura * H) / W);
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="gota gota-${humor}" ${aria} width="${largura}" height="${altura}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects}</svg>`;
}

// Decide o humor a partir do progresso e do horário.
// esperado = quanto da janela (início–fim) já passou, em %.
export function humorDe(consumido, meta, inicio = "08:00", fim = "18:00", agora = new Date()) {
  const pct = meta > 0 ? (consumido / meta) * 100 : 0;
  if (pct >= 100) return "feliz";
  const min = agora.getHours() * 60 + agora.getMinutes();
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  const ini = hi * 60 + mi;
  let end = hf * 60 + mf;
  if (end <= ini) end += 1440; // janela que passa da meia-noite (ex.: 08:00–00:00)
  const m = min < ini && end > 1440 && min <= end - 1440 ? min + 1440 : min;
  let esperado = 0;
  if (m >= end) esperado = 100;
  else if (m > ini) esperado = ((m - ini) / Math.max(1, end - ini)) * 100;
  if (pct < 30 && esperado >= 20) return "sede";
  if (pct < esperado - 15) return "triste";
  return "normal";
}

export const CORACAO_SVG = (cor = "#D9467A", w = 14) =>
  `<svg aria-hidden="true" width="${w}" height="${(w * 6) / 7}" viewBox="0 0 7 6" shape-rendering="crispEdges"><path fill="${cor}" d="M1 0h2v1H1zM4 0h2v1H4zM0 1h7v2H0zM1 3h5v1H1zM2 4h3v1H2zM3 5h1v1H3z"/></svg>`;
