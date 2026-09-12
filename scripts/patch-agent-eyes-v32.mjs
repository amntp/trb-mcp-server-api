import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/tc-extension-html.ts", import.meta.url);
let source = await readFile(path, "utf8");

if (source.includes("AGENT_EYES_V32_AIR_SYSTEMS")) {
  console.log("Agent Eyes V3.2 patch already applied");
  process.exit(0);
}

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`Agent Eyes V3.2 patch failed: marker not found: ${label}`);
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

replaceOnce(
  'let lastSummaryText = "";\n',
  `let lastSummaryText = "";\n\n/* AGENT_EYES_V32_AIR_SYSTEMS */\nconst AIR_TYPES = {\n  zuluft: { label:"Zuluft", code:"ZUL", canonical:"L_Zuluft" },\n  abluft: { label:"Abluft", code:"ABL", canonical:"L_Abluft" },\n  aussenluft: { label:"Außenluft", code:"AUL", canonical:"L_Außenluft" },\n  fortluft: { label:"Fortluft", code:"FOL", canonical:"L_Fortluft" },\n  umluft: { label:"Umluft", code:"UML", canonical:"L_Umluft" },\n  entrauchung: { label:"Entrauchung", code:"ER", canonical:"L_Entrauchung" }\n};\nconst learnedAirColors = new Map();\n\nfunction normAir(value) {\n  return String(value || "").toLowerCase()\n    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")\n    .replace(/[^a-z0-9]+/g," ").trim();\n}\n\nfunction airTypeFromText(value) {\n  const s = " " + normAir(value) + " ";\n  if (/\\b(entrauch|smoke extract|smoke exhaust|rauchgas|rauchabzug|rwa)\\b/.test(s)) return "entrauchung";\n  if (/\\b(fortluft|fol|eha|exhaust air)\\b/.test(s)) return "fortluft";\n  if (/\\b(aussenluft|aul|oda|outdoor air|fresh air)\\b/.test(s)) return "aussenluft";\n  if (/\\b(zuluft|zul|sup|supply air)\\b/.test(s)) return "zuluft";\n  if (/\\b(abluft|abl|eta|extract air)\\b/.test(s)) return "abluft";\n  if (/\\b(umluft|uml|rca|recirculat|return air)\\b/.test(s)) return "umluft";\n  return null;\n}\n\nfunction rgbHex(r,g,b) {\n  const values = [r,g,b].map((value) => {\n    let n = Number(value);\n    if (!Number.isFinite(n)) n = 0;\n    if (n >= 0 && n <= 1) n *= 255;\n    n = Math.max(0,Math.min(255,Math.round(n)));\n    return n.toString(16).padStart(2,"0");\n  });\n  return "#" + values.join("").toUpperCase();\n}\n\nfunction normalizeColor(value) {\n  if (value == null) return null;\n  if (typeof value === "string") {\n    const s = value.trim();\n    const hex = s.match(/#?([0-9a-f]{6})(?:[0-9a-f]{2})?/i);\n    if (hex) return "#" + hex[1].toUpperCase();\n    const rgb = s.match(/rgba?\\s*\\(\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*,\\s*(\\d+(?:\\.\\d+)?)/i);\n    if (rgb) return rgbHex(rgb[1],rgb[2],rgb[3]);\n  }\n  if (Array.isArray(value) && value.length >= 3) return rgbHex(value[0],value[1],value[2]);\n  if (typeof value === "object") {\n    const r = value.r ?? value.red ?? value.R;\n    const g = value.g ?? value.green ?? value.G;\n    const b = value.b ?? value.blue ?? value.B;\n    if (r != null && g != null && b != null) return rgbHex(r,g,b);\n  }\n  return null;\n}\n\nfunction hexRgb(hex) {\n  if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return null;\n  return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];\n}\n\nfunction colorDistance(a,b) {\n  const x = hexRgb(a), y = hexRgb(b);\n  if (!x || !y) return Infinity;\n  return Math.sqrt((x[0]-y[0])**2 + (x[1]-y[1])**2 + (x[2]-y[2])**2);\n}\n\nfunction learnAirColor(type,color) {\n  if (!type || !color) return;\n  if (!learnedAirColors.has(type)) learnedAirColors.set(type,new Map());\n  const colors = learnedAirColors.get(type);\n  colors.set(color,(colors.get(color) || 0) + 1);\n}\n\nfunction inferAirFromLearnedColor(color) {\n  if (!color) return null;\n  let best = null, bestDistance = Infinity;\n  for (const [type,colors] of learnedAirColors) {\n    for (const knownColor of colors.keys()) {\n      const distance = colorDistance(color,knownColor);\n      if (distance < bestDistance) { best = type; bestDistance = distance; }\n    }\n  }\n  return bestDistance <= 55 ? { type:best, source:"Projektfarbe" } : null;\n}\n\nfunction inferAirFromStandardColor(color) {\n  const rgb = hexRgb(color);\n  if (!rgb) return null;\n  const [r,g,b] = rgb;\n  const max = Math.max(r,g,b), min = Math.min(r,g,b);\n  if (max < 70 || max-min < 35) return null;\n  if (g > r*1.15 && g > b*1.08) return { type:"aussenluft", source:"Farb-Fallback grün" };\n  if (b > r*1.15 && b > g*1.08) return { type:"zuluft", source:"Farb-Fallback blau" };\n  if (r > 180 && g > 150 && b < 120) return { type:"abluft", source:"Farb-Fallback gelb" };\n  if (r > 170 && g > 75 && g < 170 && b < 90) return { type:"umluft", source:"Farb-Fallback orange" };\n  if (r > 80 && r < 180 && g > 35 && g < 125 && b < 80) return { type:"fortluft", source:"Farb-Fallback braun" };\n  return null;\n}\n\nfunction objectText(obj) {\n  const values = [obj.class,obj.name,obj.objectType,obj.description];\n  for (const value of Object.values(obj.product || {})) values.push(value);\n  for (const group of obj.propertySets || []) for (const prop of group.props || []) values.push(prop.name,prop.value);\n  return values.filter(Boolean).join(" ");\n}\n\nfunction objectPropertyColor(obj) {\n  const values = [];\n  for (const [key,value] of Object.entries(obj.product || {})) if (/color|colour|farbe|rgb|appearance|presentation/i.test(key)) values.push(value);\n  for (const group of obj.propertySets || []) for (const prop of group.props || []) if (/color|colour|farbe|rgb|appearance|presentation/i.test(String(prop.name || ""))) values.push(prop.value);\n  for (const value of values) { const color = normalizeColor(value); if (color) return color; }\n  return null;\n}\n\nfunction appendDerived(obj,name,value) {\n  obj.propertySets = obj.propertySets || [];\n  let group = obj.propertySets.find((item) => item.name === "Agent Eyes Derived");\n  if (!group) { group = { name:"Agent Eyes Derived", props:[] }; obj.propertySets.push(group); }\n  if (!group.props.some((prop) => prop.name === name)) group.props.push({ name,value });\n}\n\nfunction enrichAirMetadata(obj,viewerColor) {\n  const color = viewerColor || objectPropertyColor(obj);\n  if (color) appendDerived(obj,"Agent Eyes Color",color);\n  const explicit = airTypeFromText(objectText(obj));\n  if (explicit) {\n    learnAirColor(explicit,color);\n    appendDerived(obj,"Agent Eyes Air Type",AIR_TYPES[explicit].label);\n    appendDerived(obj,"Agent Eyes Air Source","IFC/MEP-Systemdaten");\n    return obj;\n  }\n  const inferred = inferAirFromLearnedColor(color) || inferAirFromStandardColor(color);\n  if (inferred) {\n    appendDerived(obj,"Tech-Medium",AIR_TYPES[inferred.type].canonical);\n    appendDerived(obj,"Agent Eyes Air Type",AIR_TYPES[inferred.type].label);\n    appendDerived(obj,"Agent Eyes Air Source",inferred.source);\n  }\n  return obj;\n}\n`,
  "air recognition core"
);

replaceOnce(
  'function scanPropertyWanted(name) {\n  return /(geom|side|width|height|breite|höhe|hoehe|diam|durchmesser|length|länge|laenge|size|dimension|medium|system|layer|storey|geschoss|floor|level|insulation|dämm|daemm|manufacturer|hersteller|fabrikat|flow|volumen|pressure|druck|zeta|tag|kennzeichen)/i.test(String(name || ""));\n}',
  'function scanPropertyWanted(name) {\n  return /(geom|side|width|height|breite|höhe|hoehe|diam|durchmesser|length|länge|laenge|size|dimension|medium|system|layer|storey|geschoss|floor|level|insulation|dämm|daemm|manufacturer|hersteller|fabrikat|flow|volumen|pressure|druck|zeta|tag|kennzeichen|color|colour|farbe|rgb|appearance|presentation)/i.test(String(name || ""));\n}',
  "scan color properties"
);

replaceOnce(
  'async function loadedModels() {\n  try {\n    return (await api.viewer.getModels("loaded")) || [];\n  } catch {\n    return [];\n  }\n}\n\nasync function capture(includeSnapshot) {',
  `async function loadedModels() {\n  try {\n    return (await api.viewer.getModels("loaded")) || [];\n  } catch {\n    return [];\n  }\n}\n\nfunction normalizeObjectGroups(groups) {\n  const byModel = new Map();\n  for (const group of groups || []) {\n    if (!group?.modelId) continue;\n    if (!byModel.has(group.modelId)) byModel.set(group.modelId,new Set());\n    for (const id of group.objectRuntimeIds || []) byModel.get(group.modelId).add(id);\n  }\n  return Array.from(byModel,([modelId,ids]) => ({ modelId, objectRuntimeIds:Array.from(ids) })).filter((group) => group.objectRuntimeIds.length);\n}\n\nfunction objectGroupCount(groups) {\n  return (groups || []).reduce((sum,group) => sum + (group.objectRuntimeIds || []).length,0);\n}\n\nfunction subtractObjectGroups(allGroups,hiddenGroups) {\n  const hidden = new Map();\n  for (const group of normalizeObjectGroups(hiddenGroups)) hidden.set(group.modelId,new Set(group.objectRuntimeIds));\n  return normalizeObjectGroups(allGroups).map((group) => ({\n    modelId:group.modelId,\n    objectRuntimeIds:group.objectRuntimeIds.filter((id) => !hidden.get(group.modelId)?.has(id))\n  })).filter((group) => group.objectRuntimeIds.length);\n}\n\nasync function getVisibleObjectGroups() {\n  try {\n    const direct = normalizeObjectGroups(await api.viewer.getObjects(undefined,{visible:true}));\n    if (objectGroupCount(direct) > 0) return { groups:direct, mode:"visible:true" };\n  } catch (error) {\n    console.warn("visible:true query failed",error);\n  }\n\n  let all = [];\n  try { all = normalizeObjectGroups(await api.viewer.getObjects()); }\n  catch (error) { console.warn("all-object query failed",error); }\n  if (objectGroupCount(all) === 0) return { groups:[], mode:"none" };\n\n  let hidden = [];\n  try { hidden = normalizeObjectGroups(await api.viewer.getObjects(undefined,{visible:false})); }\n  catch (error) { console.warn("hidden-object query failed",error); }\n\n  return {\n    groups:subtractObjectGroups(all,hidden),\n    mode:"all-minus-hidden",\n    allCount:objectGroupCount(all),\n    hiddenCount:objectGroupCount(hidden)\n  };\n}\n\nasync function viewerColorIndex() {\n  const index = new Map();\n  let raw;\n  try { raw = await api.viewer.getColoredObjects(); } catch { return index; }\n  const seen = new Set();\n\n  function walk(node,inheritedColor) {\n    if (!node || typeof node !== "object") return;\n    if (seen.has(node)) return;\n    seen.add(node);\n    if (Array.isArray(node)) { for (const item of node) walk(item,inheritedColor); return; }\n\n    const color = normalizeColor(node.color ?? node.colour ?? node.objectState?.color ?? node.state?.color ?? inheritedColor);\n    const modelId = node.modelId;\n    const ids = node.objectRuntimeIds ?? node.runtimeIds ?? node.objectIds;\n    if (color && modelId && Array.isArray(ids)) for (const id of ids) index.set(String(modelId)+":"+String(id),color);\n    if (Array.isArray(node.modelObjectIds)) for (const item of node.modelObjectIds) walk(item,color);\n    for (const [key,value] of Object.entries(node)) {\n      if (Array.isArray(value) && !["objectRuntimeIds","runtimeIds","objectIds","modelObjectIds"].includes(key)) walk(value,color);\n    }\n  }\n\n  walk(raw,null);\n  return index;\n}\n\nasync function capture(includeSnapshot) {`,
  "visibility fallback and color index"
);

replaceOnce(
  'function renderQuantitySummary(list, meta) {',
  `function renderAirStatus(list) {\n  const counts = {};\n  for (const component of list || []) {\n    const type = airTypeFromText(component.system);\n    if (type) counts[type] = (counts[type] || 0) + 1;\n  }\n  const parts = [];\n  for (const type of ["zuluft","abluft","aussenluft","fortluft","umluft","entrauchung"]) {\n    if (counts[type]) parts.push(AIR_TYPES[type].code + " " + counts[type]);\n  }\n  setText(els.airStatus,parts.length ? parts.join(" · ") : "keine eindeutigen Luftarten",parts.length ? "ok" : "warn");\n}\n\nfunction renderQuantitySummary(list, meta) {`,
  "air summary renderer"
);

replaceOnce(
  '    lastSummaryText = "";\n    return;\n',
  '    lastSummaryText = "";\n    renderAirStatus([]);\n    return;\n',
  "air summary empty"
);

replaceOnce(
  '  lastSummaryText = textLines.join("\\\\n");\n  els.copyBtn.disabled = false;\n}',
  '  lastSummaryText = textLines.join("\\\\n");\n  els.copyBtn.disabled = false;\n  renderAirStatus(list);\n}',
  "air summary populated"
);

replaceOnce(
  '    const models = await loadedModels();\n    const modelMap = new Map(models.map((m) => [m.id,m]));\n    const visibleGroups = (await api.viewer.getObjects(undefined,{visible:true})) || [];\n\n    const normalizedGroups = visibleGroups.map((group) => ({\n      modelId:group.modelId,\n      objectRuntimeIds:Array.from(new Set(group.objectRuntimeIds || []))\n    })).filter((group) => group.objectRuntimeIds.length > 0);\n\n    visibleTotal = normalizedGroups.reduce((sum,group) => sum + group.objectRuntimeIds.length,0);',
  '    const models = await loadedModels();\n    const modelMap = new Map(models.map((m) => [m.id,m]));\n    const visibility = await getVisibleObjectGroups();\n    const normalizedGroups = visibility.groups;\n    const colorIndex = await viewerColorIndex();\n\n    visibleTotal = objectGroupCount(normalizedGroups);',
  "robust visible scan"
);

replaceOnce(
  '        const properties = rawProps.map((obj) => trimObjectPropsForScan(obj));',
  '        const properties = rawProps.map((obj) => {\n          const compact = trimObjectPropsForScan(obj);\n          const runtimeId = compact.runtimeId ?? obj.id;\n          return enrichAirMetadata(compact,colorIndex.get(String(group.modelId)+":"+String(runtimeId)) || null);\n        });',
  "air enrichment in scan"
);

replaceOnce(
  '    renderQuantitySummary(found,{source:"Modellscan",visibleTotal});\n    setText(\n      els.scanStatus,\n      found.length + " TGA aus " + visibleTotal + " sichtbar" + (propertyErrors ? " | " + propertyErrors + " Lesefehler" : ""),\n      propertyErrors ? "warn" : "ok"\n    );',
  '    renderQuantitySummary(found,{source:"Modellscan",visibleTotal});\n    const learnedCodes = Array.from(learnedAirColors.keys()).map((type) => AIR_TYPES[type]?.code).filter(Boolean);\n    setText(\n      els.scanStatus,\n      found.length + " TGA aus " + visibleTotal + " sichtbar | " + visibility.mode +\n        (propertyErrors ? " | " + propertyErrors + " Lesefehler" : "") +\n        (learnedCodes.length ? " | Farben gelernt: " + learnedCodes.join(",") : ""),\n      propertyErrors ? "warn" : "ok"\n    );',
  "scan status details"
);

replaceOnce(
  '  scanning = true;\n  pushing = false;',
  '  scanning = true;\n  pushing = false;\n  learnedAirColors.clear();',
  "reset learned air colors"
);

await writeFile(path,source,"utf8");
console.log("Agent Eyes V3.2 patch applied");
