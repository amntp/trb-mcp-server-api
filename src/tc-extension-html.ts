/**
 * "Agent Eyes" Trimble Connect extension.
 *
 * Captures live viewer selection + IFC/product properties, sends them to
 * POST /viewer-state and renders both detailed TGA analysis and a V3
 * quantity / piece-list summary prepared for later LV mapping.
 */

export function createTcExtensionHtml(): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Eyes</title>
<style>
  body {
    font-family: "Open Sans", system-ui, sans-serif;
    margin: 0;
    padding: 16px;
    color: #252a2e;
    font-size: 13px;
  }

  h1 {
    font-size: 15px;
    margin: 0 0 4px;
  }

  .sub {
    color: #6a6e79;
    margin: 0 0 16px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid #e0e1e9;
  }

  .row .label {
    color: #6a6e79;
  }

  .ok {
    color: #006638;
    font-weight: 600;
  }

  .warn {
    color: #da212c;
    font-weight: 600;
  }

  .box {
    margin-top: 14px;
    padding: 10px;
    border: 1px solid #d9e1e8;
    border-radius: 6px;
    background: #f7f9fb;
  }

  .box-title {
    font-weight: 700;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .result {
    white-space: pre-line;
    font-size: 12px;
    line-height: 1.55;
    word-break: break-word;
  }

  .summary-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    color: #6a6e79;
    font-size: 11px;
  }

  .qty-row {
    padding: 8px 0;
    border-top: 1px solid #e0e1e9;
  }

  .qty-row:first-child {
    border-top: 0;
  }

  .qty-main {
    font-weight: 700;
    font-size: 12px;
    line-height: 1.45;
  }

  .qty-sub {
    color: #555d66;
    font-size: 11px;
    line-height: 1.45;
    margin-top: 2px;
  }

  .lv-key {
    color: #6a6e79;
    font-size: 10px;
    line-height: 1.35;
    margin-top: 3px;
    word-break: break-all;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 16px;
  }

  button {
    width: 100%;
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    background: #0063a3;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
  }

  button.secondary {
    background: #4d5963;
  }

  button:disabled {
    background: #b7b9c3;
    cursor: default;
  }

  .note {
    margin-top: 12px;
    color: #6a6e79;
    font-size: 12px;
    line-height: 1.5;
  }
</style>
</head>
<body>

<h1>Agent Eyes</h1>
<p class="sub">TGA-Auswertung, Mengen und LV-Vorbereitung direkt aus dem Trimble-3D-Modell</p>

<div class="row">
  <span class="label">Verbindung</span>
  <span id="conn">…</span>
</div>

<div class="row">
  <span class="label">Autorisierung</span>
  <span id="auth">…</span>
</div>

<div class="row">
  <span class="label">Projekt</span>
  <span id="project">–</span>
</div>

<div class="row">
  <span class="label">Auswahl</span>
  <span id="selection">0 Objekte</span>
</div>

<div class="row">
  <span class="label">Letzte Synchronisierung</span>
  <span id="sync">noch nie</span>
</div>

<div class="box">
  <div class="box-title">TGA Analyse</div>
  <div id="tgaBox" class="result">Noch kein Bauteil ausgewertet.</div>
</div>

<div class="box">
  <div class="box-title">V3 Mengen / Stückliste</div>
  <div class="summary-meta">
    <span id="summaryCount">0 Objekte</span>
    <span id="summaryOpen">0 offene Mengen</span>
  </div>
  <div id="qtyBox" class="result">Mehrere Bauteile auswählen, um Mengen zu aggregieren.</div>
</div>

<div class="actions">
  <button id="syncBtn" disabled>Jetzt synchronisieren</button>
  <button id="copyBtn" class="secondary" disabled>Stückliste kopieren</button>
</div>

<p class="note">
Die V3-Stückliste gruppiert gleiche Bauteile nach Typ, Dimension, Produkt und Mengeneinheit. Der LV-Key dient als technische Grundlage für die nächste LV-Zuordnung.
</p>

<script type="module">

import * as WorkspaceAPI
  from "https://esm.sh/trimble-connect-workspace-api@0.3.34";

const els = {
  conn: document.getElementById("conn"),
  auth: document.getElementById("auth"),
  project: document.getElementById("project"),
  selection: document.getElementById("selection"),
  sync: document.getElementById("sync"),
  tgaBox: document.getElementById("tgaBox"),
  qtyBox: document.getElementById("qtyBox"),
  summaryCount: document.getElementById("summaryCount"),
  summaryOpen: document.getElementById("summaryOpen"),
  btn: document.getElementById("syncBtn"),
  copyBtn: document.getElementById("copyBtn"),
};

const PUSH_URL =
  new URL("/viewer-state", window.location.href).toString();

const PUSH_INTERVAL_MS = 5000;

let api = null;
let token = null;
let project = null;
let dirty = true;
let pushing = false;
let lastSummaryText = "";

function setText(el, text, cls) {
  if (!el) return;
  el.textContent = text;
  el.className = cls || "";
}

function normalizeToken(value) {
  if (typeof value !== "string") return null;
  let s = value.trim();
  if (s.toLowerCase().startsWith("bearer ")) {
    s = s.slice(7).trim();
  }
  return s.split(".").length === 3 ? s : null;
}

function onEvent(event, data) {
  if (event === "extension.accessToken") {
    const tok = normalizeToken(data);
    if (tok) {
      token = tok;
      setText(els.auth, "erteilt", "ok");
      dirty = true;
    } else if (data === "denied") {
      setText(els.auth, "verweigert", "warn");
    }
  }

  if (
    event === "viewer.selectionChanged" ||
    event === "viewer.cameraChanged" ||
    event === "viewer.modelLoaded"
  ) {
    dirty = true;
  }
}

/* =========================================================
   IFC / PRODUCT PROPERTIES
========================================================= */

const PROPS_MAX_OBJECTS = 30;
const PROPS_MAX_GROUPS = 80;
const PROPS_MAX_PER_GROUP = 200;

function trimValue(v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 500 ? s.slice(0, 500) + "…" : s;
}

function trimObjectProps(obj) {
  const product = obj.product || {};
  const productData = {};

  for (const [key, value] of Object.entries(product)) {
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      productData[key] = trimValue(value);
    }
  }

  return {
    runtimeId: obj.id,
    class: obj.class,
    name: product.name,
    objectType: product.objectType,
    description: product.description,
    product: productData,
    propertySets: (obj.properties || [])
      .slice(0, PROPS_MAX_GROUPS)
      .map((group) => ({
        name: group.name,
        props: (group.properties || [])
          .slice(0, PROPS_MAX_PER_GROUP)
          .map((p) => ({
            name: p.name,
            value: trimValue(p.value)
          }))
      }))
  };
}

/* =========================================================
   VIEWER CAPTURE
========================================================= */

async function capture() {
  const state = {
    capturedAt: Date.now()
  };

  try {
    state.camera = await api.viewer.getCamera();
  } catch {}

  try {
    const models = await api.viewer.getModels("loaded");
    state.models = (models || []).map((m) => ({
      id: m.id,
      versionId: m.versionId,
      name: m.name
    }));
  } catch {}

  try {
    const selection = await api.viewer.getSelection();
    const entries = [];
    let count = 0;
    let propsBudget = PROPS_MAX_OBJECTS;

    for (const sel of selection || []) {
      const runtimeIds = (sel.objectRuntimeIds || []).slice(0, 500);
      count += runtimeIds.length;

      const entry = {
        modelId: sel.modelId,
        objectRuntimeIds: runtimeIds
      };

      try {
        entry.externalIds = await api.viewer.convertToObjectIds(
          sel.modelId,
          runtimeIds
        );
      } catch {}

      if (propsBudget > 0 && runtimeIds.length > 0) {
        const propIds = runtimeIds.slice(0, propsBudget);

        try {
          const rawProps = await api.viewer.getObjectProperties(
            sel.modelId,
            propIds
          );

          entry.properties = (rawProps || []).map((obj, i) => {
            const trimmed = trimObjectProps(obj);

            if (entry.externalIds && entry.externalIds[i]) {
              trimmed.externalId = entry.externalIds[i];
            }

            return trimmed;
          });

          propsBudget -= propIds.length;
        } catch (err) {
          console.warn("getObjectProperties failed", err);
        }
      }

      const model = (state.models || []).find((m) => m.id === sel.modelId);
      if (model) entry.modelName = model.name;

      entries.push(entry);
    }

    state.selection = entries;

    setText(
      els.selection,
      count + " Objekt" + (count === 1 ? "" : "e")
    );
  } catch (err) {
    console.warn("Selection capture failed", err);
  }

  try {
    state.snapshot = await api.viewer.getSnapshot();
  } catch {}

  if (project) {
    state.project = {
      id: project.id,
      name: project.name,
      location: project.location
    };
  }

  return state;
}

/* =========================================================
   FORMAT HELPERS
========================================================= */

function formatNumber(value, decimals) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";

  return number.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function dimensionText(c) {
  if (c.shape === "rectangular") {
    return (
      (c.widthMm != null ? formatNumber(c.widthMm, 0) : "?") +
      " × " +
      (c.heightMm != null ? formatNumber(c.heightMm, 0) : "?") +
      " mm"
    );
  }

  if (c.shape === "round") {
    return "Ø " +
      (c.diameterMm != null ? formatNumber(c.diameterMm, 0) : "?") +
      " mm";
  }

  return "-";
}

function productSourceText(c) {
  const e = c.productEnrichment;
  if (!e || !Array.isArray(e.sources) || e.sources.length === 0) return "-";

  return e.sources
    .slice(0, 2)
    .map((source) => {
      const title = source.title || source.productSeries || source.manufacturer || "Produktquelle";
      return source.source + ": " + title;
    })
    .join(" | ");
}

function etimText(c) {
  if (!Array.isArray(c.etimMatches) || c.etimMatches.length === 0) return "-";
  const first = c.etimMatches[0];
  return (first.referenceCode ? first.referenceCode + " – " : "") + (first.name || "ETIM");
}

function normalizeKeyPart(value) {
  return String(value || "-")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9.]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildLvKey(c) {
  const dim = c.shape === "round"
    ? "dn_" + String(c.diameterMm != null ? Math.round(Number(c.diameterMm)) : "x")
    : c.shape === "rectangular"
      ? "b_" + String(c.widthMm != null ? Math.round(Number(c.widthMm)) : "x") +
        "_h_" + String(c.heightMm != null ? Math.round(Number(c.heightMm)) : "x")
      : "dim_x";

  return [
    normalizeKeyPart(c.type || c.label),
    dim,
    normalizeKeyPart(c.productType || c.objectType),
    c.insulationMm != null ? "daemm_" + Math.round(Number(c.insulationMm)) : "daemm_x"
  ].join("|");
}

/* =========================================================
   SINGLE COMPONENT DISPLAY
========================================================= */

function renderTgaAnalysis(list) {
  if (!list || list.length === 0) {
    els.tgaBox.textContent = "Kein Bauteil ausgewählt.";
    return;
  }

  const c = list[0];

  const flow = c.airflowM3h != null
    ? formatNumber(c.airflowM3h, 0) + " m³/h"
    : "-";

  const velocity = c.velocityMs != null
    ? formatNumber(c.velocityMs, 2) + " m/s"
    : "-";

  const length = c.lengthMm != null
    ? formatNumber(c.lengthMm / 1000, 2) + " m"
    : "-";

  const insulation = c.insulationMm != null
    ? formatNumber(c.insulationMm, 0) + " mm"
    : "-";

  const pressureLoss = c.pressureLossPa != null
    ? formatNumber(c.pressureLossPa, 1) + " Pa"
    : "-";

  const zeta = c.zeta != null
    ? formatNumber(c.zeta, 2)
    : "-";

  let quantity = "-";
  if (c.quantity != null) {
    const decimals = c.quantityUnit === "St." ? 0 : 2;
    quantity = formatNumber(c.quantity, decimals) + " " + (c.quantityUnit || "");
  } else if (c.quantityUnit) {
    quantity = c.quantityUnit + " – Menge offen";
  }

  const enrichedManufacturer =
    c.manufacturer ||
    c.productEnrichment?.manufacturer ||
    "-";

  const enrichedProductType =
    c.productType ||
    c.productEnrichment?.productSeries ||
    c.objectType ||
    "-";

  const lines = [
    "Typ: " + (c.label || "-"),
    "IFC: " + (c.ifcType || "-"),
    "Produkt: " + (c.name || "-"),
    "Produkt-Typ: " + enrichedProductType,
    "Fabrikat: " + enrichedManufacturer,
    "Beschreibung: " + (c.description || "-"),
    "Layer: " + (c.layer || "-"),
    "Dimension: " + dimensionText(c),
    "System: " + (c.system || "-"),
    "Geschoss: " + (c.storey || "-"),
    "Länge: " + length,
    "Dämmung: " + insulation,
    "Volumenstrom: " + flow,
    "Geschwindigkeit: " + velocity,
    "Druckverlust: " + pressureLoss,
    "ζ: " + zeta,
    "Menge: " + quantity,
    "VDI 3805: " + (c.vdi3805Scope || "-"),
    "ETIM: " + etimText(c),
    "Produktquelle: " + productSourceText(c),
    "LV-Key: " + buildLvKey(c)
  ];

  if (c.guid) {
    lines.push("IFC GUID: " + c.guid);
  }

  if (c.quantityNote) {
    lines.push("Hinweis: " + c.quantityNote);
  }

  if (c.matchedBy && c.matchedBy.length) {
    lines.push("Erkennung: " + c.matchedBy.join(", "));
  }

  if (list.length > 1) {
    lines.push("", "Ausgewählte Bauteile: " + list.length);
  }

  els.tgaBox.textContent = lines.join("\\n");
}

/* =========================================================
   V3 QUANTITY AGGREGATION
========================================================= */

function aggregateTga(list) {
  const groups = new Map();

  for (const c of list || []) {
    const dim = dimensionText(c);
    const manufacturer = c.manufacturer || c.productEnrichment?.manufacturer || "-";
    const productType = c.productType || c.productEnrichment?.productSeries || c.objectType || "-";
    const unit = c.quantityUnit || "";
    const insulation = c.insulationMm != null ? Number(c.insulationMm) : null;

    const key = [
      c.type || c.label || "unknown",
      dim,
      manufacturer,
      productType,
      unit,
      insulation == null ? "" : String(insulation)
    ].join("||");

    if (!groups.has(key)) {
      groups.set(key, {
        type: c.type || "unknown",
        label: c.label || "Nicht erkannt",
        dimension: dim,
        manufacturer,
        productType,
        insulationMm: insulation,
        unit,
        quantity: 0,
        knownQuantityCount: 0,
        count: 0,
        systems: new Set(),
        storeys: new Set(),
        lvKey: buildLvKey(c)
      });
    }

    const row = groups.get(key);
    row.count += 1;

    if (c.quantity != null && Number.isFinite(Number(c.quantity))) {
      row.quantity += Number(c.quantity);
      row.knownQuantityCount += 1;
    }

    if (c.system) row.systems.add(c.system);
    if (c.storey) row.storeys.add(c.storey);
  }

  return Array.from(groups.values()).sort((a, b) => {
    const typeCompare = String(a.label).localeCompare(String(b.label), "de");
    if (typeCompare !== 0) return typeCompare;
    return String(a.dimension).localeCompare(String(b.dimension), "de", { numeric: true });
  });
}

function compactSet(setValue) {
  const values = Array.from(setValue || []);
  if (values.length === 0) return "-";
  if (values.length <= 2) return values.join(", ");
  return values.slice(0, 2).join(", ") + " +" + String(values.length - 2);
}

function renderQuantitySummary(list) {
  if (!list || list.length === 0) {
    els.summaryCount.textContent = "0 Objekte";
    els.summaryOpen.textContent = "0 offene Mengen";
    els.qtyBox.textContent = "Keine Bauteile ausgewählt.";
    els.copyBtn.disabled = true;
    lastSummaryText = "";
    return;
  }

  const rows = aggregateTga(list);
  const openRows = rows.filter((row) => row.knownQuantityCount < row.count);

  els.summaryCount.textContent =
    list.length + " Objekt" + (list.length === 1 ? "" : "e") +
    " / " + rows.length + " Gruppe" + (rows.length === 1 ? "" : "n");

  els.summaryOpen.textContent =
    openRows.length + " offene Mengen";

  els.qtyBox.textContent = "";

  const textLines = [
    "Agent Eyes V3 Stückliste",
    "Ausgewählte Objekte: " + list.length,
    "Gruppen: " + rows.length,
    ""
  ];

  rows.forEach((row, index) => {
    const div = document.createElement("div");
    div.className = "qty-row";

    const main = document.createElement("div");
    main.className = "qty-main";

    let quantityText = "Menge offen";
    if (row.knownQuantityCount > 0) {
      const decimals = row.unit === "St." ? 0 : 2;
      quantityText = formatNumber(row.quantity, decimals) + (row.unit ? " " + row.unit : "");

      if (row.knownQuantityCount < row.count) {
        quantityText += " + offen";
      }
    } else if (row.unit) {
      quantityText = row.unit + " – Menge offen";
    }

    main.textContent =
      String(index + 1) + ". " +
      row.label + " | " +
      row.dimension + " | " +
      quantityText;

    const sub = document.createElement("div");
    sub.className = "qty-sub";
    sub.textContent =
      "Anzahl Objekte: " + row.count +
      " | Fabrikat: " + row.manufacturer +
      " | Typ: " + row.productType +
      " | System: " + compactSet(row.systems) +
      " | Geschoss: " + compactSet(row.storeys) +
      (row.insulationMm != null ? " | Dämmung: " + formatNumber(row.insulationMm, 0) + " mm" : "");

    const lv = document.createElement("div");
    lv.className = "lv-key";
    lv.textContent = "LV-Key: " + row.lvKey;

    div.appendChild(main);
    div.appendChild(sub);
    div.appendChild(lv);
    els.qtyBox.appendChild(div);

    textLines.push(
      String(index + 1) + ". " + row.label + " | " + row.dimension + " | " + quantityText,
      "   Objekte: " + row.count +
        " | Fabrikat: " + row.manufacturer +
        " | Typ: " + row.productType +
        " | System: " + compactSet(row.systems) +
        " | Geschoss: " + compactSet(row.storeys),
      "   LV-Key: " + row.lvKey,
      ""
    );
  });

  lastSummaryText = textLines.join("\\n");
  els.copyBtn.disabled = false;
}

async function copySummary() {
  if (!lastSummaryText) return;

  try {
    await navigator.clipboard.writeText(lastSummaryText);
    const old = els.copyBtn.textContent;
    els.copyBtn.textContent = "Kopiert ✓";
    setTimeout(() => {
      els.copyBtn.textContent = old;
    }, 1500);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = lastSummaryText;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand("copy");
      els.copyBtn.textContent = "Kopiert ✓";
      setTimeout(() => {
        els.copyBtn.textContent = "Stückliste kopieren";
      }, 1500);
    } catch {
      els.copyBtn.textContent = "Kopieren fehlgeschlagen";
      setTimeout(() => {
        els.copyBtn.textContent = "Stückliste kopieren";
      }, 1800);
    }

    document.body.removeChild(textarea);
  }
}

/* =========================================================
   PUSH TO SERVER
========================================================= */

async function push(force) {
  if (!api || !token || pushing) return;
  if (!dirty && !force) return;

  pushing = true;

  try {
    const state = await capture();

    const res = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify(state)
    });

    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json()).error || "";
      } catch {}

      throw new Error(
        "HTTP " + res.status + (detail ? " - " + detail : "")
      );
    }

    const data = await res.json();
    const analysis = data.tgaAnalysis || [];

    renderTgaAnalysis(analysis);
    renderQuantitySummary(analysis);

    dirty = false;

    setText(
      els.sync,
      new Date().toLocaleTimeString("de-DE"),
      "ok"
    );
  } catch (err) {
    setText(els.sync, "Fehler", "warn");
    els.tgaBox.textContent =
      "TGA-Auswertung fehlgeschlagen:\\n" + String(err);
    els.qtyBox.textContent = "Mengenaggregation nicht verfügbar.";
  } finally {
    pushing = false;
  }
}

/* =========================================================
   INITIALISIERUNG
========================================================= */

async function init() {
  try {
    api = await WorkspaceAPI.connect(
      window.parent,
      onEvent,
      30000
    );

    setText(els.conn, "verbunden", "ok");
  } catch {
    setText(els.conn, "Fehler", "warn");
    return;
  }

  try {
    project = await api.project.getCurrentProject();
    setText(
      els.project,
      project?.name || project?.id || "–"
    );
  } catch {}

  try {
    const result = await api.extension.requestPermission("accesstoken");
    const tok = normalizeToken(result);

    if (tok) {
      token = tok;
      setText(els.auth, "erteilt", "ok");
    } else if (result === "denied") {
      setText(els.auth, "verweigert", "warn");
    } else {
      setText(els.auth, "warte…");
    }
  } catch {
    setText(els.auth, "Fehler", "warn");
  }

  els.btn.disabled = false;
  els.btn.addEventListener("click", () => push(true));
  els.copyBtn.addEventListener("click", copySummary);

  setInterval(() => push(false), PUSH_INTERVAL_MS);

  setInterval(() => {
    dirty = true;
  }, 30000);
}

init();

</script>
</body>
</html>`;
}
