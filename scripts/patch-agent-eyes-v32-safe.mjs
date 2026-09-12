import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/tc-extension-html.ts", import.meta.url);
let source = await readFile(path, "utf8");

if (source.includes("AGENT_EYES_V32_SAFE")) {
  console.log("Agent Eyes V3.2 safe patch already applied");
  process.exit(0);
}

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error("Agent Eyes V3.2 patch marker missing: " + label);
  }
  source = source.replace(oldText, newText);
}

replaceOnce(
  '<div class="row"><span class="label">Scan</span><span id="scanStatus">bereit</span></div>\n<div class="row"><span class="label">Letzte Synchronisierung</span>',
  '<div class="row"><span class="label">Scan</span><span id="scanStatus">bereit</span></div>\n<div class="row"><span class="label">Luftarten</span><span id="airStatus">noch nicht gescannt</span></div>\n<div class="row"><span class="label">Letzte Synchronisierung</span>',
  "air status row"
);

replaceOnce(
  '  scanStatus: document.getElementById("scanStatus"),\n  sync: document.getElementById("sync"),',
  '  scanStatus: document.getElementById("scanStatus"),\n  airStatus: document.getElementById("airStatus"),\n  sync: document.getElementById("sync"),',
  "air status element"
);

source = source.replaceAll(
  '    description: product.description,\n    product: productData,',
  '    description: product.description,\n    color: obj.color,\n    product: productData,'
);

const helpers = String.raw`
/* AGENT_EYES_V32_SAFE */
const AIR_TYPES = {
  zuluft: { label:"Zuluft", code:"ZUL", canonical:"L_Zuluft" },
  abluft: { label:"Abluft", code:"ABL", canonical:"L_Abluft" },
  aussenluft: { label:"Außenluft", code:"AUL", canonical:"L_Außenluft" },
  fortluft: { label:"Fortluft", code:"FOL", canonical:"L_Fortluft" },
  umluft: { label:"Umluft", code:"UML", canonical:"L_Umluft" },
  entrauchung: { label:"Entrauchung", code:"ER", canonical:"L_Entrauchung" }
};
const learnedAirColors = new Map();

function normalizeAirText(value) {
  return String(value || "").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/[^a-z0-9]+/g," ").trim();
}

function airTypeFromText(value) {
  const s = normalizeAirText(value);
  const tokens = new Set(s.split(" ").filter(Boolean));
  if (s.includes("entrauch") || s.includes("smoke extract") || s.includes("smoke exhaust") || s.includes("rauchabzug") || tokens.has("rwa")) return "entrauchung";
  if (s.includes("fortluft") || tokens.has("fol") || tokens.has("eha") || s.includes("exhaust air")) return "fortluft";
  if (s.includes("aussenluft") || tokens.has("aul") || tokens.has("oda") || s.includes("outdoor air") || s.includes("fresh air")) return "aussenluft";
  if (s.includes("zuluft") || tokens.has("zul") || tokens.has("sup") || s.includes("supply air")) return "zuluft";
  if (s.includes("abluft") || tokens.has("abl") || tokens.has("eta") || s.includes("extract air")) return "abluft";
  if (s.includes("umluft") || tokens.has("uml") || tokens.has("rca") || s.includes("recirculat") || s.includes("return air")) return "umluft";
  return null;
}

function normalizeColor(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/#?([0-9a-f]{6})/i);
  return match ? "#" + match[1].toUpperCase() : null;
}

function hexRgb(hex) {
  if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return null;
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function standardAirFromColor(color) {
  const rgb = hexRgb(color);
  if (!rgb) return null;
  const r = rgb[0], g = rgb[1], b = rgb[2];
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  if (max < 70 || max - min < 35) return null;
  if (g > r * 1.18 && g > b * 1.10) return "aussenluft";
  if (b > r * 1.18 && b > g * 1.10) return "zuluft";
  if (r > 175 && g > 145 && b < 125) return "abluft";
  if (r > 165 && g > 75 && g < 175 && b < 105) return "umluft";
  if (r > 80 && r < 185 && g > 35 && g < 135 && b < 95) return "fortluft";
  return null;
}

function objectAirText(obj) {
  const values = [obj.class,obj.name,obj.objectType,obj.description];
  for (const value of Object.values(obj.product || {})) values.push(value);
  for (const group of obj.propertySets || []) {
    for (const prop of group.props || []) values.push(prop.name,prop.value);
  }
  return values.filter(Boolean).join(" ");
}

function appendDerived(obj,name,value) {
  obj.propertySets = obj.propertySets || [];
  let group = obj.propertySets.find((item) => item.name === "Agent Eyes Derived");
  if (!group) {
    group = { name:"Agent Eyes Derived", props:[] };
    obj.propertySets.push(group);
  }
  if (!group.props.some((prop) => prop.name === name)) group.props.push({ name,value });
}

function learnAirColor(obj) {
  const type = airTypeFromText(objectAirText(obj));
  const color = normalizeColor(obj.color);
  if (!type || !color) return;
  if (!learnedAirColors.has(color)) learnedAirColors.set(color,new Map());
  const counts = learnedAirColors.get(color);
  counts.set(type,(counts.get(type) || 0) + 1);
}

function learnedAirFromColor(color) {
  const counts = learnedAirColors.get(color);
  if (!counts) return null;
  let best = null, bestCount = 0;
  for (const [type,count] of counts) {
    if (count > bestCount) { best = type; bestCount = count; }
  }
  return best;
}

function enrichAirMetadata(obj) {
  const explicit = airTypeFromText(objectAirText(obj));
  const color = normalizeColor(obj.color);
  const inferred = explicit || learnedAirFromColor(color) || standardAirFromColor(color);
  if (!inferred) return obj;

  appendDerived(obj,"Agent Eyes Air Type",AIR_TYPES[inferred].label);
  appendDerived(obj,"Agent Eyes Air Source",explicit ? "IFC/MEP-Systemdaten" : (learnedAirFromColor(color) ? "Projektfarbe" : "Normfarb-Fallback"));
  if (!explicit) appendDerived(obj,"Tech-Medium",AIR_TYPES[inferred].canonical);
  if (color) appendDerived(obj,"Agent Eyes Color",color);
  return obj;
}

function normalizeViewerGroups(groups) {
  return (groups || []).map((group) => {
    const objects = Array.isArray(group.objects) ? group.objects : [];
    const ids = objects.length
      ? objects.map((obj) => obj && obj.id).filter((id) => id !== undefined && id !== null)
      : (group.objectRuntimeIds || []);
    return {
      modelId:group.modelId,
      objects,
      objectRuntimeIds:Array.from(new Set(ids))
    };
  }).filter((group) => group.modelId && group.objectRuntimeIds.length > 0);
}

function groupCount(groups) {
  return (groups || []).reduce((sum,group) => sum + group.objectRuntimeIds.length,0);
}

function subtractHiddenGroups(allGroups,hiddenGroups) {
  const hidden = new Map();
  for (const group of hiddenGroups) hidden.set(group.modelId,new Set(group.objectRuntimeIds));
  return allGroups.map((group) => {
    const blocked = hidden.get(group.modelId) || new Set();
    const objects = group.objects.filter((obj) => !blocked.has(obj.id));
    const ids = group.objectRuntimeIds.filter((id) => !blocked.has(id));
    return { modelId:group.modelId, objects, objectRuntimeIds:ids };
  }).filter((group) => group.objectRuntimeIds.length > 0);
}

async function getVisibleGroupsSafe() {
  try {
    const direct = normalizeViewerGroups(await api.viewer.getObjects(undefined,{visible:true}));
    if (groupCount(direct) > 0) return { groups:direct, mode:"visible:true" };
  } catch (err) {
    console.warn("visible:true scan failed",err);
  }

  let all = [];
  let hidden = [];
  try { all = normalizeViewerGroups(await api.viewer.getObjects()); } catch (err) { console.warn("all objects scan failed",err); }
  try { hidden = normalizeViewerGroups(await api.viewer.getObjects(undefined,{visible:false})); } catch (err) { console.warn("hidden objects scan failed",err); }

  return {
    groups:subtractHiddenGroups(all,hidden),
    mode:"all-minus-hidden",
    allCount:groupCount(all),
    hiddenCount:groupCount(hidden)
  };
}

function renderAirStatus(list) {
  const counts = { zuluft:0, abluft:0, aussenluft:0, fortluft:0, umluft:0, entrauchung:0 };
  for (const component of list || []) {
    const type = airTypeFromText(component.system);
    if (type && counts[type] !== undefined) counts[type] += 1;
  }
  const parts = [];
  for (const key of ["zuluft","abluft","aussenluft","fortluft","umluft","entrauchung"]) {
    if (counts[key] > 0) parts.push(AIR_TYPES[key].code + " " + counts[key]);
  }
  setText(els.airStatus,parts.length ? parts.join(" · ") : "keine Luftart erkannt",parts.length ? "ok" : "warn");
}
`;

replaceOnce(
  'async function scanVisibleTga() {',
  helpers + '\nasync function scanVisibleTga() {',
  "safe helpers"
);

const oldScanStart = '    const models = await loadedModels();\n    const modelMap = new Map(models.map((m) => [m.id,m]));\n    const visibleGroups = (await api.viewer.getObjects(undefined,{visible:true})) || [];\n\n    const normalizedGroups = visibleGroups.map((group) => ({\n      modelId:group.modelId,\n      objectRuntimeIds:Array.from(new Set(group.objectRuntimeIds || []))\n    })).filter((group) => group.objectRuntimeIds.length > 0);';

const newScanStart = '    const models = await loadedModels();\n    const modelMap = new Map(models.map((m) => [m.id,m]));\n    const visibility = await getVisibleGroupsSafe();\n    const normalizedGroups = visibility.groups;';
replaceOnce(oldScanStart,newScanStart,"viewer group shape");

const oldBatch = '        let rawProps = [];\n\n        try {\n          rawProps = (await api.viewer.getObjectProperties(group.modelId,batchIds)) || [];\n        } catch (err) {\n          propertyErrors += batchIds.length;\n          console.warn("scan getObjectProperties failed",group.modelId,err);\n        }\n\n        const properties = rawProps.map((obj) => trimObjectPropsForScan(obj));';

const newBatch = '        const byId = new Map((group.objects || []).map((obj) => [obj.id,obj]));\n        let rawProps = batchIds.map((id) => byId.get(id)).filter(Boolean);\n\n        if (rawProps.length < batchIds.length) {\n          const have = new Set(rawProps.map((obj) => obj.id));\n          const missing = batchIds.filter((id) => !have.has(id));\n          if (missing.length) {\n            try {\n              const fetched = (await api.viewer.getObjectProperties(group.modelId,missing)) || [];\n              rawProps = rawProps.concat(fetched);\n            } catch (err) {\n              propertyErrors += missing.length;\n              console.warn("scan getObjectProperties failed",group.modelId,err);\n            }\n          }\n        }\n\n        const properties = rawProps.map((obj) => trimObjectPropsForScan(obj));\n        for (const property of properties) learnAirColor(property);\n        for (const property of properties) enrichAirMetadata(property);';
replaceOnce(oldBatch,newBatch,"reuse getObjects properties");

replaceOnce(
  '      renderQuantitySummary(found,{source:"Modellscan",visibleTotal});\n    };',
  '      renderQuantitySummary(found,{source:"Modellscan",visibleTotal});\n      renderAirStatus(found);\n    };',
  "air status during scan"
);

replaceOnce(
  '    renderQuantitySummary(found,{source:"Modellscan",visibleTotal});\n    setText(\n      els.scanStatus,\n      found.length + " TGA aus " + visibleTotal + " sichtbar" + (propertyErrors ? " | " + propertyErrors + " Lesefehler" : ""),',
  '    renderQuantitySummary(found,{source:"Modellscan",visibleTotal});\n    renderAirStatus(found);\n    setText(\n      els.scanStatus,\n      found.length + " TGA aus " + visibleTotal + " sichtbar | " + visibility.mode + (propertyErrors ? " | " + propertyErrors + " Lesefehler" : ""),',
  "final scan status"
);

replaceOnce(
  '<div class="box-title">V3.1 Mengen / Stückliste</div>',
  '<div class="box-title">V3.2 Mengen / Stückliste</div>',
  "version label"
);

await writeFile(path,source,"utf8");
console.log("Agent Eyes V3.2 safe patch applied");
