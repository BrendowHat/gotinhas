// Mascote em pixel art: uma gotinha 8x10 com 4 humores
// humor: "feliz" | "normal" | "triste" | "sede"

const BASE = [
  "...XX...",
  "...XX...",
  "..XLXX..",
  ".XLXXXX.",
  "XXXXXXXX",
  "XXEXXEXX",
  "XBXXXXBX",
  "XXXXXXXX",
  ".XXXXXX.",
  "..XXXX..",
];

const CORES = {
  azul: { body: "#2F80ED", palido: "#8FBDEE", blush: "#F7B6CC" },
  rosa: { body: "#F28DB2", palido: "#F6C3D5", blush: "#D9467A" },
};

export const HUMOR_TEXTO = {
  sede: "com sede…",
  triste: "tristinha, tá atrasada",
  normal: "no ritmo",
  feliz: "radiante!",
};

export function gotaSVG(cor = "azul", humor = "normal", px = 6, label = "") {
  const c = CORES[cor] || CORES.azul;
  const rows = BASE.map((r) => r.split(""));
  const set = (y, x, v) => (rows[y][x] = v);

  if (humor === "feliz") {
    set(5, 2, "X"); set(5, 5, "X");
    set(4, 2, "E"); set(5, 1, "E"); set(5, 3, "E");
    set(4, 5, "E"); set(5, 4, "E"); set(5, 6, "E");
    set(6, 2, "M"); set(6, 5, "M"); set(7, 3, "M"); set(7, 4, "M");
    set(0, 6, "K"); set(2, 1, "K");
  } else if (humor === "triste") {
    set(6, 1, "X"); set(6, 6, "X");
    set(6, 3, "M"); set(6, 4, "M"); set(7, 2, "M"); set(7, 5, "M");
    set(6, 5, "W");
  } else if (humor === "sede") {
    set(6, 1, "X"); set(6, 6, "X");
    set(5, 1, "E"); set(5, 6, "E");
    set(7, 3, "M"); set(7, 4, "M"); set(8, 4, "P");
    set(2, 6, "S"); set(3, 7, "S");
  } else {
    set(7, 3, "M"); set(7, 4, "M");
  }

  const pal = {
    X: humor === "sede" ? c.palido : c.body,
    L: "#FFFFFF", E: "#12324F", M: "#12324F", B: c.blush,
    W: "#FFFFFF", P: "#E0567F", S: "#5AA9F0", K: "#E8B400",
  };

  let rects = "";
  rows.forEach((r, y) =>
    r.forEach((ch, x) => {
      if (ch !== ".") rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`;
    })
  );
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="gota gota-${humor}" ${aria} width="${8 * px}" height="${10 * px}" viewBox="0 0 8 10" shape-rendering="crispEdges">${rects}</svg>`;
}

// Decide o humor a partir do progresso e do horário.
// esperado = quanto da janela (início–fim) já passou, em %.
export function humorDe(consumido, meta, inicio = "08:00", fim = "18:00", agora = new Date()) {
  const pct = meta > 0 ? (consumido / meta) * 100 : 0;
  if (pct >= 100) return "feliz";
  const min = agora.getHours() * 60 + agora.getMinutes();
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  const ini = hi * 60 + mi, end = hf * 60 + mf;
  let esperado = 0;
  if (min >= end) esperado = 100;
  else if (min > ini) esperado = ((min - ini) / Math.max(1, end - ini)) * 100;
  if (pct < 30 && esperado >= 20) return "sede";
  if (pct < esperado - 15) return "triste";
  return "normal";
}

export const CORACAO_SVG = (cor = "#D9467A", w = 14) =>
  `<svg aria-hidden="true" width="${w}" height="${(w * 6) / 7}" viewBox="0 0 7 6" shape-rendering="crispEdges"><path fill="${cor}" d="M1 0h2v1H1zM4 0h2v1H4zM0 1h7v2H0zM1 3h5v1H1zM2 4h3v1H2zM3 5h1v1H3z"/></svg>`;
