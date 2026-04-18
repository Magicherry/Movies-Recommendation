"use strict";

let pptxgen;
try {
  pptxgen = require("pptxgenjs");
} catch (err) {
  pptxgen = require("C:/Users/zyt68/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pptxgenjs");
}

const {
  imageSizingContain,
} = require("./pptxgenjs_helpers/image");
const {
  warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds,
} = require("./pptxgenjs_helpers/layout");

const path = require("path");

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Codex";
pptx.company = "OpenAI";
pptx.subject = "Movie recommendation technical report slides";
pptx.title = "Comparative Study of Collaborative Filtering Methods";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: "Aptos Display",
  bodyFontFace: "Aptos",
  lang: "en-US",
};
pptx.defineLayout({ name: "CUSTOM_WIDE", width: 13.333, height: 7.5 });
pptx.layout = "CUSTOM_WIDE";
pptx.margin = 0;

const OUT = "D:/Projects/School/Movies-Recommendation/FinalReport/movie_recommendation_tech_slides.pptx";
const A = "D:/Projects/School/Movies-Recommendation/FinalReport/_slide_work/assets";
const img = (name) => path.join(A, name);

const C = {
  green: "10A37F",
  green2: "0D8F70",
  dark: "1E293B",
  ink: "0F172A",
  slate: "475569",
  mid: "64748B",
  line: "CBD5E1",
  softLine: "E2E8F0",
  bg: "F8FAFC",
  white: "FFFFFF",
  pale: "ECFDF5",
  blue: "2563EB",
  amber: "F59E0B",
  red: "EF4444",
  violet: "7C3AED",
  gray: "E5E7EB",
};

const W = 13.333;
const H = 7.5;
const M = 0.55;
const FONT = "Aptos";
const FONT_HEAD = "Aptos Display";

const ratingRows = [
  ["Deep Hybrid", "0.6005", "0.8148"],
  ["MF-SGD", "0.6020", "0.8061"],
  ["SVD-Ridge", "0.6286", "0.8312"],
  ["SVD-KNN", "0.6810", "0.9058"],
  ["SVD-Lasso", "0.6714", "0.8747"],
  ["MF-ALS", "0.7303", "0.9786"],
];

const topRows = [
  ["Deep Hybrid", "0.0533", "0.0480", "0.0331", "0.0722"],
  ["SVD-Ridge", "0.0520", "0.0240", "0.0212", "0.0671"],
  ["MF-SGD", "0.0367", "0.0294", "0.0218", "0.0509"],
  ["SVD-KNN", "0.0159", "0.0200", "0.0127", "0.0230"],
  ["SVD-Lasso", "0.0152", "0.0099", "0.0063", "0.0177"],
  ["MF-ALS", "0.0072", "0.0038", "0.0034", "0.0091"],
];

function addBg(slide) {
  slide.background = { color: C.bg };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: H,
    fill: { color: C.bg },
    line: { color: C.bg, transparency: 100 },
  });
}

function addTitle(slide, title, eyebrow = "") {
  addBg(slide);
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: 0.16,
    fill: { color: C.green },
    line: { color: C.green, transparency: 100 },
  });
  if (eyebrow) {
    slide.addText(eyebrow.toUpperCase(), {
      x: M,
      y: 0.36,
      w: 5.8,
      h: 0.25,
      fontFace: FONT,
      fontSize: 8,
      color: C.green,
      bold: true,
      margin: 0,
      breakLine: false,
      charSpace: 0.5,
    });
  }
  slide.addText(title, {
    x: M,
    y: eyebrow ? 0.62 : 0.45,
    w: 9.8,
    h: 0.5,
    fontFace: FONT_HEAD,
    fontSize: 23,
    color: C.dark,
    bold: true,
    margin: 0,
    breakLine: false,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: M,
    y: 1.18,
    w: W - 2 * M,
    h: 0,
    line: { color: C.softLine, width: 1 },
  });
}

function addFooter(slide, num) {
  slide.addText("MovieLens Latest recommendation study", {
    x: M,
    y: 7.08,
    w: 4.2,
    h: 0.18,
    fontFace: FONT,
    fontSize: 6.8,
    color: C.mid,
    margin: 0,
  });
  slide.addText(String(num).padStart(2, "0"), {
    x: 12.15,
    y: 7.05,
    w: 0.6,
    h: 0.2,
    fontFace: FONT,
    fontSize: 7.2,
    color: C.mid,
    align: "right",
    margin: 0,
  });
}

function addSectionLabel(slide, text, x, y, w) {
  slide.addText(text.toUpperCase(), {
    x,
    y,
    w,
    h: 0.22,
    fontFace: FONT,
    fontSize: 7,
    bold: true,
    color: C.green,
    margin: 0,
    charSpace: 0.4,
  });
}

function addBullets(slide, items, x, y, w, h, opts = {}) {
  slide.addText(items.map((t) => ({ text: t, options: { bullet: { indent: 10 }, hanging: 3 } })), {
    x,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: opts.fontSize || 12,
    color: opts.color || C.ink,
    fit: "shrink",
    breakLine: false,
    paraSpaceAfterPt: opts.paraSpaceAfterPt || 7,
    margin: 0,
  });
}

function addMetric(slide, label, value, x, y, w, color = C.green) {
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h: 0.82,
    fill: { color: C.white },
    line: { color: C.softLine, width: 1 },
  });
  slide.addText(value, {
    x: x + 0.16,
    y: y + 0.12,
    w: w - 0.32,
    h: 0.28,
    fontFace: FONT_HEAD,
    fontSize: 18,
    bold: true,
    color,
    margin: 0,
    align: "center",
  });
  slide.addText(label, {
    x: x + 0.14,
    y: y + 0.48,
    w: w - 0.28,
    h: 0.2,
    fontFace: FONT,
    fontSize: 7.6,
    color: C.slate,
    margin: 0,
    align: "center",
    fit: "shrink",
  });
}

function addTable(slide, x, y, colWs, rows, opts = {}) {
  const rowH = opts.rowH || 0.32;
  const headH = opts.headH || 0.34;
  const fontSize = opts.fontSize || 8.2;
  const header = rows[0];
  const body = rows.slice(1);
  const totalW = colWs.reduce((a, b) => a + b, 0);
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: totalW,
    h: headH,
    fill: { color: C.dark },
    line: { color: C.dark, transparency: 100 },
  });
  let cx = x;
  header.forEach((cell, i) => {
    slide.addText(cell, {
      x: cx + 0.06,
      y: y + 0.08,
      w: colWs[i] - 0.12,
      h: headH - 0.12,
      fontFace: FONT,
      fontSize: fontSize,
      bold: true,
      color: C.white,
      margin: 0,
      fit: "shrink",
      align: i === 0 ? "left" : "center",
    });
    cx += colWs[i];
  });
  body.forEach((row, r) => {
    const yy = y + headH + r * rowH;
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: yy,
      w: totalW,
      h: rowH,
      fill: { color: r % 2 === 0 ? C.white : "F1F5F9" },
      line: { color: C.softLine, width: 0.5 },
    });
    cx = x;
    row.forEach((cell, i) => {
      slide.addText(String(cell), {
        x: cx + 0.06,
        y: yy + 0.075,
        w: colWs[i] - 0.12,
        h: rowH - 0.1,
        fontFace: FONT,
        fontSize: fontSize,
        color: i === 0 ? C.ink : C.slate,
        bold: opts.boldFirstCol && i === 0,
        margin: 0,
        fit: "shrink",
        align: i === 0 ? "left" : "center",
      });
      cx += colWs[i];
    });
  });
}

function addCallout(slide, title, body, x, y, w, h, accent = C.green) {
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: C.white },
    line: { color: C.softLine, width: 1 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: 0.08,
    h,
    fill: { color: accent },
    line: { color: accent, transparency: 100 },
  });
  slide.addText(title, {
    x: x + 0.22,
    y: y + 0.14,
    w: w - 0.36,
    h: 0.25,
    fontFace: FONT_HEAD,
    fontSize: 13,
    bold: true,
    color: C.dark,
    margin: 0,
  });
  slide.addText(body, {
    x: x + 0.22,
    y: y + 0.48,
    w: w - 0.38,
    h: h - 0.62,
    fontFace: FONT,
    fontSize: 9.6,
    color: C.slate,
    margin: 0,
    fit: "shrink",
    breakLine: false,
  });
}

function addImageBox(slide, imagePath, x, y, w, h, caption = "") {
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: C.white },
    line: { color: C.softLine, width: 1 },
  });
  slide.addImage({ path: imagePath, ...imageSizingContain(imagePath, x + 0.08, y + 0.08, w - 0.16, h - (caption ? 0.42 : 0.16)) });
  if (caption) {
    slide.addText(caption, {
      x: x + 0.12,
      y: y + h - 0.28,
      w: w - 0.24,
      h: 0.18,
      fontFace: FONT,
      fontSize: 7.2,
      color: C.mid,
      margin: 0,
      align: "center",
      fit: "shrink",
    });
  }
}

function addMiniBar(slide, label, value, max, x, y, w, color) {
  slide.addText(label, {
    x,
    y,
    w: 1.45,
    h: 0.18,
    fontFace: FONT,
    fontSize: 7.5,
    color: C.slate,
    margin: 0,
    fit: "shrink",
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: x + 1.55,
    y: y + 0.035,
    w,
    h: 0.11,
    fill: { color: C.gray },
    line: { color: C.gray, transparency: 100 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: x + 1.55,
    y: y + 0.035,
    w: w * (value / max),
    h: 0.11,
    fill: { color },
    line: { color, transparency: 100 },
  });
  slide.addText(String(value), {
    x: x + 1.65 + w,
    y,
    w: 0.46,
    h: 0.18,
    fontFace: FONT,
    fontSize: 7.2,
    color: C.mid,
    margin: 0,
    align: "right",
  });
}

function addGroupedBarChart(slide, x, y, w, h, labels, series, opts = {}) {
  const min = opts.min ?? 0;
  const max = opts.max ?? Math.max(...series.flatMap((s) => s.values)) * 1.1;
  const plotX = x + 0.38;
  const plotY = y + 0.2;
  const plotW = w - 0.55;
  const plotH = h - 0.78;
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w,
    h,
    fill: { color: C.white },
    line: { color: C.softLine, width: 1 },
  });
  for (let i = 0; i <= 4; i++) {
    const gy = plotY + plotH * (i / 4);
    slide.addShape(pptx.ShapeType.line, {
      x: plotX,
      y: gy,
      w: plotW,
      h: 0,
      line: { color: i === 4 ? C.line : "E5E7EB", width: i === 4 ? 1 : 0.5 },
    });
    const val = max - ((max - min) * i) / 4;
    slide.addText(val.toFixed(opts.tickDigits ?? 2), {
      x: x + 0.05,
      y: gy - 0.08,
      w: 0.28,
      h: 0.16,
      fontFace: FONT,
      fontSize: 5.8,
      color: C.mid,
      margin: 0,
      align: "right",
      fit: "shrink",
    });
  }
  const groupW = plotW / labels.length;
  const gap = groupW * 0.16;
  const barW = (groupW - gap) / series.length;
  labels.forEach((label, i) => {
    series.forEach((s, j) => {
      const value = s.values[i];
      const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
      const bh = normalized * plotH;
      const bx = plotX + i * groupW + gap / 2 + j * barW + 0.02;
      const by = plotY + plotH - bh;
      slide.addShape(pptx.ShapeType.rect, {
        x: bx,
        y: by,
        w: Math.max(0.04, barW - 0.04),
        h: bh,
        fill: { color: s.color },
        line: { color: s.color, transparency: 100 },
      });
    });
    slide.addText(label, {
      x: plotX + i * groupW,
      y: y + h - 0.45,
      w: groupW,
      h: 0.18,
      fontFace: FONT,
      fontSize: opts.labelSize || 5.9,
      color: C.slate,
      margin: 0,
      align: "center",
      fit: "shrink",
    });
  });
  let lx = plotX;
  series.forEach((s) => {
    slide.addShape(pptx.ShapeType.rect, {
      x: lx,
      y: y + h - 0.18,
      w: 0.12,
      h: 0.08,
      fill: { color: s.color },
      line: { color: s.color, transparency: 100 },
    });
    slide.addText(s.name, {
      x: lx + 0.16,
      y: y + h - 0.2,
      w: 0.78,
      h: 0.13,
      fontFace: FONT,
      fontSize: 6.2,
      color: C.mid,
      margin: 0,
      fit: "shrink",
    });
    lx += 1.0;
  });
}

function addConnector(slide, x1, y1, x2, y2, color = C.green) {
  slide.addShape(pptx.ShapeType.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color, width: 1.6, beginArrowType: "none", endArrowType: "triangle" },
  });
}

function validate(slide) {
  warnIfSlideHasOverlaps(slide, pptx, {
    muteContainment: true,
    ignoreLines: true,
    ignoreDecorativeShapes: true,
  });
  warnIfSlideElementsOutOfBounds(slide, pptx);
}

const slides = [];
function newSlide(num, title, eyebrow) {
  const slide = pptx.addSlide();
  addTitle(slide, title, eyebrow);
  addFooter(slide, num);
  slides.push(slide);
  return slide;
}

// 1. Cover
{
  const slide = pptx.addSlide();
  addBg(slide);
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 4.1,
    h: H,
    fill: { color: C.dark },
    line: { color: C.dark, transparency: 100 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 3.9,
    y: 0,
    w: 0.2,
    h: H,
    fill: { color: C.green },
    line: { color: C.green, transparency: 100 },
  });
  slide.addText("Movie Recommendation", {
    x: 0.55,
    y: 0.62,
    w: 2.8,
    h: 0.28,
    fontFace: FONT,
    fontSize: 9,
    color: "A7F3D0",
    bold: true,
    margin: 0,
    charSpace: 0.5,
  });
  slide.addText("Comparative Study of Collaborative Filtering Methods", {
    x: 0.55,
    y: 1.28,
    w: 3.0,
    h: 1.55,
    fontFace: FONT_HEAD,
    fontSize: 26,
    color: C.white,
    bold: true,
    margin: 0,
    fit: "shrink",
    breakLine: false,
  });
  slide.addText("MovieLens Latest | 34M ratings | explicit-feedback recommendation", {
    x: 0.58,
    y: 3.05,
    w: 2.8,
    h: 0.52,
    fontFace: FONT,
    fontSize: 12,
    color: "CBD5E1",
    margin: 0,
    fit: "shrink",
  });
  slide.addText("Technical presentation deck generated from report.pdf", {
    x: 0.58,
    y: 6.78,
    w: 2.8,
    h: 0.22,
    fontFace: FONT,
    fontSize: 7.5,
    color: "94A3B8",
    margin: 0,
  });
  slide.addText("Executive result", {
    x: 4.75,
    y: 0.82,
    w: 3.6,
    h: 0.26,
    fontFace: FONT,
    fontSize: 8.5,
    bold: true,
    color: C.green,
    margin: 0,
    charSpace: 0.5,
  });
  slide.addText("Deep Hybrid is the best overall model; SVD-Ridge is the strongest lightweight baseline.", {
    x: 4.75,
    y: 1.14,
    w: 6.9,
    h: 0.82,
    fontFace: FONT_HEAD,
    fontSize: 22,
    bold: true,
    color: C.dark,
    margin: 0,
    fit: "shrink",
  });
  addMetric(slide, "Best MAE: Deep Hybrid", "0.6005", 4.75, 2.42, 1.75, C.green);
  addMetric(slide, "Best RMSE: MF-SGD", "0.8061", 6.7, 2.42, 1.75, C.blue);
  addMetric(slide, "Best NDCG@10", "0.0722", 8.65, 2.42, 1.75, C.green);
  addMetric(slide, "Train / test ratings", "27.1M / 6.77M", 10.6, 2.42, 1.95, C.amber);
  addImageBox(slide, img("metrics_scatter_mae_ndcg.png"), 4.75, 3.72, 3.7, 2.35, "MAE vs. NDCG@10 frontier");
  addImageBox(slide, img("metrics_radar.png"), 8.72, 3.72, 3.7, 2.35, "Normalized multi-metric profile");
  slides.push(slide);
}

// 2. Problem and evaluation
{
  const slide = newSlide(2, "Problem Definition and Evaluation Lens", "Research framing");
  addCallout(
    slide,
    "Goal",
    "Learn a scoring function that predicts user-item ratings and ranks candidate movies for each user under a shared, reproducible split.",
    0.65,
    1.55,
    4.2,
    1.1,
    C.green
  );
  addCallout(
    slide,
    "Why this is hard",
    "The matrix is sparse, user activity is heavy-tailed, item popularity is heavy-tailed, and rating error does not always translate into ranking quality.",
    0.65,
    2.85,
    4.2,
    1.1,
    C.amber
  );
  addCallout(
    slide,
    "Evaluation split",
    "Per-user 80/20 random holdout with a fixed seed: 27,065,494 training ratings and 6,766,668 held-out test ratings.",
    0.65,
    4.15,
    4.2,
    1.1,
    C.blue
  );
  addSectionLabel(slide, "Two complementary objectives", 5.35, 1.55, 4);
  slide.addShape(pptx.ShapeType.rect, { x: 5.35, y: 1.95, w: 3.1, h: 3.55, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
  slide.addText("Rating Prediction", { x: 5.62, y: 2.22, w: 2.5, h: 0.3, fontFace: FONT_HEAD, fontSize: 16, bold: true, color: C.dark, margin: 0, align: "center" });
  slide.addText("Point-wise error over all held-out ratings", { x: 5.72, y: 2.72, w: 2.3, h: 0.46, fontFace: FONT, fontSize: 10.5, color: C.slate, margin: 0, fit: "shrink", align: "center" });
  addMetric(slide, "Mean absolute error", "MAE", 5.75, 3.45, 1.0, C.green);
  addMetric(slide, "Root mean squared error", "RMSE", 7.0, 3.45, 1.0, C.blue);
  slide.addText("Lower is better", { x: 6.03, y: 4.62, w: 1.7, h: 0.18, fontFace: FONT, fontSize: 8, color: C.mid, margin: 0, align: "center" });
  slide.addShape(pptx.ShapeType.rect, { x: 8.8, y: 1.95, w: 3.55, h: 3.55, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
  slide.addText("Top-10 Recommendation", { x: 9.08, y: 2.22, w: 3.0, h: 0.3, fontFace: FONT_HEAD, fontSize: 16, bold: true, color: C.dark, margin: 0, align: "center" });
  slide.addText("Rank candidate items and score the top-10 list", { x: 9.25, y: 2.72, w: 2.68, h: 0.46, fontFace: FONT, fontSize: 10.5, color: C.slate, margin: 0, fit: "shrink", align: "center" });
  addMetric(slide, "Precision@10", "P@10", 9.15, 3.45, 0.85, C.green);
  addMetric(slide, "Recall@10", "R@10", 10.13, 3.45, 0.85, C.blue);
  addMetric(slide, "F1@10", "F1", 11.1, 3.45, 0.85, C.amber);
  slide.addText("NDCG@10", { x: 9.25, y: 4.65, w: 2.65, h: 0.24, fontFace: FONT_HEAD, fontSize: 14, bold: true, color: C.green, margin: 0, align: "center" });
  slide.addText("Higher is better", { x: 9.75, y: 4.98, w: 1.7, h: 0.18, fontFace: FONT, fontSize: 8, color: C.mid, margin: 0, align: "center" });
  addBullets(slide, [
    "The protocol treats every held-out test item as relevant for top-10 metrics.",
    "Absolute top-N scores are small because each user can have many held-out items.",
  ], 5.42, 5.95, 6.65, 0.55, { fontSize: 9.2, paraSpaceAfterPt: 3 });
}

// 3. Dataset
{
  const slide = newSlide(3, "Dataset Scale and Distribution Shape", "MovieLens Latest");
  addTable(slide, 0.65, 1.48, [2.15, 1.45], [
    ["Statistic", "Value"],
    ["Users", "330,975"],
    ["Rated movies", "83,239"],
    ["Ratings", "33,832,162"],
    ["Density", "0.12%"],
    ["Sparsity", "99.88%"],
    ["Mean rating", "3.54"],
    ["Median ratings/user", "31.0"],
    ["Median ratings/item", "5.0"],
  ], { rowH: 0.36, headH: 0.36, fontSize: 8.5, boldFirstCol: true });
  addCallout(slide, "Data behavior", "Ratings are left-skewed and both user activity and item popularity follow heavy-tailed distributions. This makes tail-item generalization and ranking calibration central to the comparison.", 0.65, 5.08, 3.6, 0.98, C.green);
  addImageBox(slide, img("rating_dist.png"), 4.62, 1.48, 3.75, 2.0, "Rating values are concentrated around 3.0 and 4.0");
  addImageBox(slide, img("user_item_dist.png"), 8.63, 1.48, 3.85, 2.0, "Log-scaled activity and popularity tails");
  addImageBox(slide, img("genre_dist.png"), 4.62, 4.02, 3.75, 2.08, "Top catalog genres");
  slide.addText("Catalog imbalance matters: frequent genres dominate metadata, while long-tail movies carry sparse collaborative signal.", {
    x: 8.72,
    y: 4.25,
    w: 3.45,
    h: 0.9,
    fontFace: FONT_HEAD,
    fontSize: 15,
    color: C.dark,
    bold: true,
    margin: 0,
    fit: "shrink",
  });
  addBullets(slide, [
    "Top genres: Drama, Comedy, Thriller.",
    "User Gini approx. 0.70; item Gini approx. 0.95.",
    "Model capacity should help where explicit ratings are sparse.",
  ], 8.8, 5.25, 3.25, 0.92, { fontSize: 9.2, paraSpaceAfterPt: 4 });
}

// 4. Methods
{
  const slide = newSlide(4, "Model Families Compared Under One Pipeline", "Methodology");
  const lanes = [
    ["MF-SGD", "Matrix factorization trained by SGD with user/item biases.", C.green],
    ["Deep Hybrid", "PyTorch tower with IDs, genres, titles, Huber loss, and GPU minibatches.", C.blue],
    ["SVD Hybrids", "Sparse SVD embeddings plus Ridge/Lasso calibration or KNN latent scoring.", C.amber],
    ["MF-ALS", "Alternating least squares baseline with validation early stopping.", C.violet],
  ];
  lanes.forEach((lane, i) => {
    const x = 0.65 + i * 3.05;
    slide.addShape(pptx.ShapeType.rect, { x, y: 1.58, w: 2.68, h: 3.42, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
    slide.addShape(pptx.ShapeType.rect, { x, y: 1.58, w: 2.68, h: 0.12, fill: { color: lane[2] }, line: { color: lane[2], transparency: 100 } });
    slide.addText(lane[0], { x: x + 0.18, y: 1.92, w: 2.3, h: 0.28, fontFace: FONT_HEAD, fontSize: 15, color: C.dark, bold: true, margin: 0, align: "center" });
    slide.addText(lane[1], { x: x + 0.2, y: 2.48, w: 2.25, h: 0.9, fontFace: FONT, fontSize: 9.7, color: C.slate, margin: 0, fit: "shrink", align: "center" });
    slide.addShape(pptx.ShapeType.rect, { x: x + 0.34, y: 3.72, w: 2.0, h: 0.44, fill: { color: "F1F5F9" }, line: { color: C.softLine, width: 0.5 } });
    slide.addText(i === 0 ? "latent IDs" : i === 1 ? "IDs + content" : i === 2 ? "SVD factors" : "ALS factors", { x: x + 0.42, y: 3.85, w: 1.84, h: 0.15, fontFace: FONT, fontSize: 7.5, color: C.slate, bold: true, margin: 0, align: "center" });
  });
  addConnector(slide, 1.98, 5.23, 11.35, 5.23, C.green);
  slide.addText("Shared data split, shared evaluation driver, persisted metrics and per-epoch histories", {
    x: 2.4,
    y: 5.52,
    w: 8.7,
    h: 0.28,
    fontFace: FONT_HEAD,
    fontSize: 14,
    color: C.dark,
    bold: true,
    margin: 0,
    align: "center",
  });
  addTable(slide, 1.05, 6.05, [2.05, 2.05, 2.05, 2.05, 2.05], [
    ["MF-SGD", "Deep", "SVD-R/L", "SVD-KNN", "MF-ALS"],
    ["k=64", "k=96", "k=48", "k=48", "k=96"],
  ], { rowH: 0.28, headH: 0.28, fontSize: 7.5 });
}

// 5. Experiment setup
{
  const slide = newSlide(5, "Experimental Setup and Training Presets", "Controlled comparison");
  addCallout(slide, "Implementation", "Python 3.11 with a shared tabular pipeline. MF-SGD and Deep Hybrid were migrated to PyTorch; SVD variants use sparse linear algebra; ALS stays NumPy-based.", 0.65, 1.48, 4.0, 1.35, C.green);
  addCallout(slide, "Reliability guard", "The evaluator checks vectorized predict_batch results against scalar predict on sampled inputs, then falls back automatically if inconsistencies are detected.", 0.65, 3.05, 4.0, 1.16, C.blue);
  addCallout(slide, "Scale target", "Large minibatches and persisted histories make tens of millions of explicit ratings tractable while preserving comparable evaluation conditions.", 0.65, 4.43, 4.0, 1.16, C.amber);
  addTable(slide, 5.1, 1.48, [1.25, 1.15, 1.25, 1.28, 1.35, 1.2], [
    ["Preset", "MF-SGD", "Deep", "SVD-R/L", "SVD-KNN", "MF-ALS"],
    ["Factors", "64", "96", "48/48", "48", "96"],
    ["Epochs", "150", "50", "1", "1", "40"],
    ["Batch", "131k", "65k", "-", "-", "-"],
    ["LR", "0.0050", "0.0008", "-", "-", "-"],
    ["Reg", "0.05", "1e-5", "0.1/0.1", "-", "0.16"],
    ["Bias reg", "-", "-", "10.0", "12.0", "6.0"],
    ["Early stop", "pat. 6", "best ckpt", "-", "-", "pat. 6"],
    ["Loss", "MSE", "Huber", "-", "-", "MSE"],
  ], { rowH: 0.34, headH: 0.36, fontSize: 7.5, boldFirstCol: true });
  slide.addText("Takeaway: the study controls the split and metrics, but lets each model use a practical tuned preset for MovieLens Latest.", {
    x: 5.12,
    y: 5.72,
    w: 6.7,
    h: 0.45,
    fontFace: FONT_HEAD,
    fontSize: 14.5,
    color: C.dark,
    bold: true,
    margin: 0,
    fit: "shrink",
  });
}

// 6. Rating prediction
{
  const slide = newSlide(6, "Rating Prediction: Deep Wins MAE, MF-SGD Wins RMSE", "Results");
  addTable(slide, 0.65, 1.48, [1.65, 0.82, 0.82], [
    ["Model", "MAE", "RMSE"],
    ...ratingRows,
  ], { rowH: 0.36, headH: 0.36, fontSize: 8.5, boldFirstCol: true });
  addGroupedBarChart(
    slide,
    4.25,
    1.48,
    5.75,
    3.35,
    ["Deep", "MF-SGD", "Ridge", "KNN", "Lasso", "ALS"],
    [
      { name: "MAE", values: ratingRows.map((r) => Number(r[1])), color: C.green },
      { name: "RMSE", values: ratingRows.map((r) => Number(r[2])), color: C.blue },
    ],
    { max: 1.05, tickDigits: 2, labelSize: 6.2 }
  );
  addCallout(slide, "Interpretation", "Deep Hybrid achieves the best absolute-error profile, but MF-SGD slightly improves RMSE. SVD-Ridge is the strongest linear model after retuning.", 10.35, 1.48, 2.15, 1.7, C.green);
  addImageBox(slide, img("model_comparison_rating.png"), 4.1, 5.12, 5.9, 1.18, "Report figure: side-by-side error comparison");
  addBullets(slide, [
    "Deep Hybrid: best MAE at 0.6005.",
    "MF-SGD: best RMSE at 0.8061.",
    "MF-ALS trails on both point-wise metrics under this preset.",
  ], 10.45, 3.58, 1.85, 1.45, { fontSize: 8.8, paraSpaceAfterPt: 4 });
}

// 7. Top-N recommendation
{
  const slide = newSlide(7, "Top-10 Ranking: Deep Hybrid Leads, SVD-Ridge Is Close", "Results");
  addTable(slide, 0.65, 1.42, [1.38, 0.68, 0.68, 0.68, 0.72], [
    ["Model", "P@10", "R@10", "F1@10", "NDCG"],
    ...topRows,
  ], { rowH: 0.35, headH: 0.36, fontSize: 7.0, boldFirstCol: true });
  addGroupedBarChart(
    slide,
    5.25,
    1.42,
    3.3,
    2.55,
    ["Deep", "Ridge", "MF", "KNN", "Lasso", "ALS"],
    [{ name: "NDCG@10", values: topRows.map((r) => Number(r[4])), color: C.green }],
    { max: 0.08, tickDigits: 2, labelSize: 5.7 }
  );
  addGroupedBarChart(
    slide,
    8.95,
    1.42,
    3.45,
    2.55,
    ["Deep", "Ridge", "MF", "KNN", "Lasso", "ALS"],
    [
      { name: "P@10", values: topRows.map((r) => Number(r[1])), color: C.green },
      { name: "R@10", values: topRows.map((r) => Number(r[2])), color: C.blue },
    ],
    { max: 0.06, tickDigits: 2, labelSize: 5.7 }
  );
  addImageBox(slide, img("model_comparison_topn.png"), 5.25, 4.48, 3.3, 1.55, "All top-N metrics");
  addCallout(slide, "Ranking insight", "MF-SGD is competitive on rating error, but ranks third for top-N quality. SVD-Ridge almost matches Deep Hybrid on NDCG@10 with lower complexity.", 8.95, 4.48, 3.45, 1.55, C.amber);
}

// 8. Trade-offs
{
  const slide = newSlide(8, "Cross-Metric Trade-Offs Reveal Model Roles", "Diagnostics");
  addImageBox(slide, img("metrics_scatter_mae_ndcg.png"), 0.65, 1.48, 5.4, 4.05, "Lower MAE and higher NDCG define the preferred frontier");
  addImageBox(slide, img("metrics_radar.png"), 6.35, 1.48, 5.4, 4.05, "Normalized profile across rating and ranking metrics");
  addCallout(slide, "Operating point", "Deep Hybrid sits on the strongest overall frontier: best MAE and best NDCG@10. MF-SGD has excellent RMSE but loses ranking quality.", 0.9, 5.85, 3.45, 0.72, C.green);
  addCallout(slide, "Baseline choice", "SVD-Ridge is attractive when training cost, interpretability, or deployment simplicity matter more than the final fraction of ranking lift.", 4.9, 5.85, 3.45, 0.72, C.blue);
  addCallout(slide, "Failure mode", "MF-ALS and SVD-Lasso show that point-wise calibration and score diversity are critical for top-10 recommendation.", 8.9, 5.85, 3.45, 0.72, C.red);
}

// 9. Training dynamics
{
  const slide = newSlide(9, "Training Dynamics Explain Generalization Patterns", "Optimization");
  addImageBox(slide, img("training_mf_sgd.png"), 0.65, 1.42, 3.78, 2.55, "MF-SGD: validation reverses early");
  addImageBox(slide, img("training_deep.png"), 4.78, 1.42, 3.78, 2.55, "Deep Hybrid: smoother stabilization");
  addImageBox(slide, img("training_als.png"), 8.9, 1.42, 3.78, 2.55, "MF-ALS: train-validation divergence");
  addCallout(slide, "MF-SGD", "Rapid training progress but validation MAE/RMSE worsen after early epochs, motivating checkpoint restoration.", 0.65, 4.45, 3.78, 1.0, C.green);
  addCallout(slide, "Deep Hybrid", "GPU-scale minibatches, Huber loss, and plateau learning-rate reduction stabilize validation error across 50 epochs.", 4.78, 4.45, 3.78, 1.0, C.blue);
  addCallout(slide, "MF-ALS", "Training error keeps decreasing while validation quality plateaus or drifts; current preset restores an earlier checkpoint.", 8.9, 4.45, 3.78, 1.0, C.amber);
  slide.addText("Takeaway: optimization behavior is part of the model comparison. Better training loss is not sufficient when ranking calibration is weak.", {
    x: 1.0,
    y: 6.03,
    w: 11.2,
    h: 0.42,
    fontFace: FONT_HEAD,
    fontSize: 16,
    color: C.dark,
    bold: true,
    margin: 0,
    align: "center",
    fit: "shrink",
  });
}

// 10. Feature ablation and latent interpretation
{
  const slide = newSlide(10, "Feature Signals Add Value Beyond Raw IDs", "Analysis");
  addTable(slide, 0.65, 1.48, [1.55, 0.85, 1.05, 0.85], [
    ["Feature block", "Full R2", "R2 w/o block", "Delta R2"],
    ["Full model", "0.1116", "-", "-"],
    ["w/o Content", "-", "0.0582", "0.0534"],
    ["w/o Engagement", "-", "0.0815", "0.0302"],
    ["w/o Noise", "-", "0.1117", "-0.0001"],
  ], { rowH: 0.4, headH: 0.38, fontSize: 7.2, boldFirstCol: true });
  addSectionLabel(slide, "Marginal contribution", 0.65, 3.95, 2.8);
  addMiniBar(slide, "Content", 0.0534, 0.06, 0.65, 4.35, 1.7, C.green);
  addMiniBar(slide, "Engagement", 0.0302, 0.06, 0.65, 4.7, 1.7, C.blue);
  addMiniBar(slide, "Noise", 0.0001, 0.06, 0.65, 5.05, 1.7, C.gray);
  addCallout(slide, "How to read this", "The ablation is an auxiliary MovieLens-Small probe, not a direct MovieLens Latest claim. It motivates the Deep Hybrid item tower: content and engagement features carry useful signal, but most variance remains latent.", 0.65, 5.35, 4.2, 1.12, C.amber);
  slide.addShape(pptx.ShapeType.rect, { x: 5.65, y: 1.55, w: 2.15, h: 0.72, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
  slide.addText("Collaborative IDs", { x: 5.82, y: 1.8, w: 1.8, h: 0.2, fontFace: FONT_HEAD, fontSize: 12, color: C.dark, bold: true, margin: 0, align: "center" });
  slide.addShape(pptx.ShapeType.rect, { x: 5.65, y: 3.0, w: 2.15, h: 0.72, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
  slide.addText("Genre + title", { x: 5.82, y: 3.25, w: 1.8, h: 0.2, fontFace: FONT_HEAD, fontSize: 12, color: C.dark, bold: true, margin: 0, align: "center" });
  slide.addShape(pptx.ShapeType.rect, { x: 5.65, y: 4.45, w: 2.15, h: 0.72, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
  slide.addText("Engagement", { x: 5.82, y: 4.7, w: 1.8, h: 0.2, fontFace: FONT_HEAD, fontSize: 12, color: C.dark, bold: true, margin: 0, align: "center" });
  slide.addShape(pptx.ShapeType.rect, { x: 9.0, y: 1.55, w: 2.25, h: 3.62, fill: { color: C.pale }, line: { color: C.green, width: 1 } });
  slide.addText("Deep Hybrid\nitem tower", { x: 9.24, y: 3.0, w: 1.75, h: 0.48, fontFace: FONT_HEAD, fontSize: 15, color: C.dark, bold: true, margin: 0, align: "center", fit: "shrink" });
  addConnector(slide, 7.8, 1.91, 9.0, 1.91, C.green);
  addConnector(slide, 7.8, 3.36, 9.0, 3.36, C.green);
  addConnector(slide, 7.8, 4.81, 9.0, 4.81, C.green);
  addCallout(slide, "Latent factor interpretation", "PCA on item factors can recover semantically coherent directions, but full-scale exemplars are noisier across seeds. Interpret directions, not cherry-picked movies.", 8.35, 5.55, 3.65, 0.92, C.blue);
}

// 11. Discussion
{
  const slide = newSlide(11, "What the Results Mean for Model Selection", "Discussion");
  addTable(slide, 0.65, 1.45, [2.0, 2.4, 2.35, 2.25, 2.35], [
    ["Use case", "Best fit", "Why", "Risk", "Metric signal"],
    ["Best quality", "Deep Hybrid", "Strong MAE and top-N", "GPU cost", "MAE 0.6005 / NDCG 0.0722"],
    ["Light baseline", "SVD-Ridge", "Strong ranking at low complexity", "Less expressive", "NDCG 0.0671"],
    ["Point-wise RMSE", "MF-SGD", "Lowest RMSE", "Weaker top-N", "RMSE 0.8061"],
    ["Interpretability probe", "SVD-KNN", "Geometry-aware profiles", "Uncalibrated scores", "NDCG 0.0230"],
    ["Improve later", "MF-ALS", "Classic scalable baseline", "Needs larger sweep", "NDCG 0.0091"],
  ], { rowH: 0.47, headH: 0.38, fontSize: 7.4, boldFirstCol: true });
  addCallout(slide, "Core finding", "At approx. 34M interactions, the deep model's extra capacity is no longer just a liability. Content channels and robust training help align rating accuracy with ranking utility.", 0.85, 4.88, 3.7, 1.0, C.green);
  addCallout(slide, "Classical baseline", "SVD-Ridge remains the practical challenger: simple, interpretable, and close to Deep Hybrid on NDCG@10 after retuning.", 4.85, 4.88, 3.7, 1.0, C.blue);
  addCallout(slide, "Ranking caveat", "MSE/RMSE optimization does not guarantee top-10 quality. Score calibration and item separation dominate fixed-cutoff recommendation.", 8.85, 4.88, 3.7, 1.0, C.amber);
}

// 12. Demo application
{
  const slide = newSlide(12, "StreamX Demo Architecture", "Application layer");
  slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.75, w: 2.2, h: 1.0, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
  slide.addText("Next.js Frontend", { x: 1.03, y: 2.1, w: 1.72, h: 0.22, fontFace: FONT_HEAD, fontSize: 13, color: C.dark, bold: true, align: "center", margin: 0 });
  slide.addText("browse, details,\npersonalized recs", { x: 1.05, y: 2.38, w: 1.7, h: 0.28, fontFace: FONT, fontSize: 7.8, color: C.slate, align: "center", margin: 0, fit: "shrink" });
  slide.addShape(pptx.ShapeType.rect, { x: 4.0, y: 1.75, w: 2.35, h: 1.0, fill: { color: C.pale }, line: { color: C.green, width: 1 } });
  slide.addText("Django REST API", { x: 4.24, y: 2.1, w: 1.87, h: 0.22, fontFace: FONT_HEAD, fontSize: 13, color: C.dark, bold: true, align: "center", margin: 0 });
  slide.addText("runtime model switcher", { x: 4.32, y: 2.43, w: 1.72, h: 0.18, fontFace: FONT, fontSize: 7.8, color: C.slate, align: "center", margin: 0 });
  slide.addShape(pptx.ShapeType.rect, { x: 7.35, y: 1.75, w: 2.35, h: 1.0, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
  slide.addText("Model Artifacts", { x: 7.61, y: 2.1, w: 1.83, h: 0.22, fontFace: FONT_HEAD, fontSize: 13, color: C.dark, bold: true, align: "center", margin: 0 });
  slide.addText("MF, Deep, SVD,\nALS checkpoints", { x: 7.65, y: 2.38, w: 1.75, h: 0.28, fontFace: FONT, fontSize: 7.8, color: C.slate, align: "center", margin: 0, fit: "shrink" });
  slide.addShape(pptx.ShapeType.rect, { x: 10.3, y: 1.75, w: 2.15, h: 1.0, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
  slide.addText("TMDB Enrichment", { x: 10.53, y: 2.1, w: 1.7, h: 0.22, fontFace: FONT_HEAD, fontSize: 12.5, color: C.dark, bold: true, align: "center", margin: 0, fit: "shrink" });
  slide.addText("posters, metadata,\nsimilar movies", { x: 10.55, y: 2.38, w: 1.65, h: 0.28, fontFace: FONT, fontSize: 7.8, color: C.slate, align: "center", margin: 0, fit: "shrink" });
  addConnector(slide, 3.0, 2.25, 4.0, 2.25, C.green);
  addConnector(slide, 6.35, 2.25, 7.35, 2.25, C.green);
  addConnector(slide, 9.7, 2.25, 10.3, 2.25, C.blue);
  slide.addText("Online request flow", { x: 1.2, y: 3.35, w: 10.8, h: 0.28, fontFace: FONT_HEAD, fontSize: 15, color: C.dark, bold: true, align: "center", margin: 0 });
  addTable(slide, 1.1, 3.92, [2.0, 2.05, 2.05, 2.15, 2.0], [
    ["Step", "Input", "API action", "Model output", "UI result"],
    ["1", "User profile", "candidate scoring", "ranked movie IDs", "recommendations"],
    ["2", "Movie ID", "similarity lookup", "neighbor titles", "similar movies"],
    ["3", "Metadata", "TMDB join", "poster + details", "rich detail page"],
  ], { rowH: 0.44, headH: 0.36, fontSize: 7.8 });
  addCallout(slide, "Presentation angle", "The demo turns offline metrics into an inspectable product surface: users can compare model behavior through recommendations and similar-movie suggestions.", 2.1, 5.95, 9.2, 0.72, C.green);
}

// 13. Limitations and future work
{
  const slide = newSlide(13, "Limitations and Future Work", "Research hygiene");
  addSectionLabel(slide, "Limitations", 0.75, 1.48, 2.5);
  addBullets(slide, [
    "MovieLens Latest is a development snapshot, so exact metrics are tied to the July 2023-era checkout.",
    "Large-scale automated hyperparameter search was not run for every model.",
    "Top-N relevance treats every held-out test item as relevant, which compresses absolute scores.",
    "SVD-KNN averages rated items without rating or temporal weights.",
    "Temporal dynamics, implicit feedback, and review text remain unexplored.",
  ], 0.85, 1.88, 5.25, 2.65, { fontSize: 10.4, paraSpaceAfterPt: 5 });
  addSectionLabel(slide, "Next experiments", 7.0, 1.48, 2.8);
  addBullets(slide, [
    "Dedicated MF-ALS and MF-SGD rank/regularization sweeps at web scale.",
    "Frozen MovieLens benchmark splits for publication-grade comparability.",
    "Learning-to-rank objectives aligned directly with NDCG.",
    "Rating-weighted or attention-based SVD-KNN user profiles.",
    "Implicit-feedback variants and temporal modeling.",
  ], 7.1, 1.88, 5.15, 2.65, { fontSize: 10.4, paraSpaceAfterPt: 5 });
  slide.addShape(pptx.ShapeType.rect, { x: 0.75, y: 5.25, w: 11.75, h: 0.82, fill: { color: C.white }, line: { color: C.softLine, width: 1 } });
  slide.addText("Most important improvement path: move from point-wise rating loss toward ranking-aware objectives while preserving the shared evaluation guardrails.", {
    x: 1.0,
    y: 5.52,
    w: 11.25,
    h: 0.26,
    fontFace: FONT_HEAD,
    fontSize: 15,
    color: C.dark,
    bold: true,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
}

// 14. Conclusion
{
  const slide = newSlide(14, "Conclusion: Quality, Efficiency, and Ranking Are Separate Choices", "Final takeaways");
  addCallout(slide, "1. Best overall", "Deep Hybrid achieves the best overall profile: MAE 0.6005 and NDCG@10 0.0722.", 0.85, 1.62, 3.65, 1.08, C.green);
  addCallout(slide, "2. Best RMSE", "Tuned MF-SGD has the best RMSE at 0.8061, but it does not lead ranking quality.", 4.85, 1.62, 3.65, 1.08, C.blue);
  addCallout(slide, "3. Best lightweight baseline", "SVD-Ridge is the strongest classical baseline: P@10 0.0520 and NDCG@10 0.0671.", 8.85, 1.62, 3.65, 1.08, C.amber);
  slide.addShape(pptx.ShapeType.rect, { x: 1.15, y: 3.42, w: 10.95, h: 1.35, fill: { color: C.dark }, line: { color: C.dark, transparency: 100 } });
  slide.addText("Recommendation: use Deep Hybrid when maximizing quality is the goal; keep SVD-Ridge as the efficient, interpretable baseline; evaluate future work with ranking-aware objectives.", {
    x: 1.55,
    y: 3.78,
    w: 10.15,
    h: 0.62,
    fontFace: FONT_HEAD,
    fontSize: 19,
    color: C.white,
    bold: true,
    align: "center",
    margin: 0,
    fit: "shrink",
  });
  addImageBox(slide, img("metrics_scatter_mae_ndcg.png"), 2.2, 5.25, 3.6, 1.35, "Frontier");
  addImageBox(slide, img("model_comparison_topn.png"), 6.0, 5.25, 4.9, 1.35, "Ranking metrics");
}

slides.forEach(validate);

(async () => {
  await pptx.writeFile({ fileName: OUT });
})();
