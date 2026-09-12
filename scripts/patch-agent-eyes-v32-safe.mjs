import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/tc-extension-html.ts", import.meta.url);
let source = await readFile(path, "utf8");

if (source.includes("AGENT_EYES_V32_SAFE2")) {
  console.log("Agent Eyes V3.2 safe2 patch already applied");
  process.exit(0);
}

const marker = "/* AGENT_EYES_V32_SAFE2 */";
const helpers = String.raw`
/* AGENT_EYES_V32_SAFE2 */
function aeNormalizeGroups(groups) {
  return (groups || []).map((group) => {
    const objects = Array.isArray(group.objects) ? group.objects : [];
    const ids = objects.length
      ? objects.map((obj) => obj && obj.id).filter((id) => id !== undefined && id !== null)
      : (group.objectRuntimeIds || []);
    return { modelId:group.modelId, objectRuntimeIds:Array.from(new Set(ids)) };
  }).filter((group) => group.modelId && group.objectRuntimeIds.length > 0);
}

function aeGroupCount(groups) {
  return (groups || []).reduce((sum,group) => sum + (group.objectRuntimeIds || []).length,0);
}

function aeSubtractHidden(allGroups,hiddenGroups) {
  const hidden = new Map();
  for (const group of hiddenGroups || []) {
    hidden.set(group.modelId,new Set(group.objectRuntimeIds || []));
  }
  return (allGroups || []).map((group) => {
    const blocked = hidden.get(group.modelId) || new Set();
    return {
      modelId:group.modelId,
      objectRuntimeIds:(group.objectRuntimeIds || []).filter((id) => !blocked.has(id))
    };
  }).filter((group) => group.objectRuntimeIds.length > 0);
}

async function aeVisibleGroups() {
  try {
    const direct = aeNormalizeGroups(await api.viewer.getObjects(undefined,{visible:true}));
    if (aeGroupCount(direct) > 0) return direct;
  } catch (err) {
    console.warn("Agent Eyes visible:true query failed",err);
  }

  let all = [];
  let hidden = [];
  try { all = aeNormalizeGroups(await api.viewer.getObjects()); } catch (err) { console.warn("Agent Eyes all-object query failed",err); }
  try { hidden = aeNormalizeGroups(await api.viewer.getObjects(undefined,{visible:false})); } catch (err) { console.warn("Agent Eyes hidden-object query failed",err); }
  return aeSubtractHidden(all,hidden);
}

function aeAirTypeFromText(value) {
  const s = String(value || "").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/[^a-z0-9]+/g," ").trim();
  const tokens = new Set(s.split(" ").filter(Boolean));
  if (s.includes("entrauch") || s.includes("smoke extract") || s.includes("smoke exhaust") || tokens.has("rwa")) return "L_Entrauchung";
  if (s.includes("fortluft") || tokens.has("fol") || tokens.has("eha") || s.includes("exhaust air")) return "L_Fortluft";
  if (s.includes("aussenluft") || tokens.has("aul") || tokens.has("oda") || s.includes("outdoor air") || s.includes("fresh air")) return "L_Außenluft";
  if (s.includes("zuluft") || tokens.has("zul") || tokens.has("sup") || s.includes("supply air")) return "L_Zuluft";
  if (s.includes("abluft") || tokens.has("abl") || tokens.has("eta") || s.includes("extract air")) return "L_Abluft";
  if (s.includes("umluft") || tokens.has("uml") || tokens.has("rca") || s.includes("recirculat") || s.includes("return air")) return "L_Umluft";
  return null;
}

function aeAirTypeFromColor(color) {
  if (typeof color !== "string") return null;
  const match = color.match(/#?([0-9a-f]{6})/i);
  if (!match) return null;
  const hex = match[1];
  const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  if (max < 70 || max-min < 35) return null;
  if (g > r*1.18 && g > b*1.10) return "L_Außenluft";
  if (b > r*1.18 && b > g*1.10) return "L_Zuluft";
  if (r > 175 && g > 145 && b < 125) return "L_Abluft";
  if (r > 165 && g > 75 && g < 175 && b < 105) return "L_Umluft";
  if (r > 80 && r < 185 && g > 35 && g < 135 && b < 95) return "L_Fortluft";
  return null;
}

function aeAddDerived(obj,name,value) {
  if (!value) return;
  obj.propertySets = obj.propertySets || [];
  let group = obj.propertySets.find((item) => item.name === "Agent Eyes Derived");
  if (!group) {
    group = { name:"Agent Eyes Derived", props:[] };
    obj.propertySets.push(group);
  }
  if (!group.props.some((prop) => prop.name === name)) group.props.push({ name,value });
}

function aeEnrichAir(obj) {
  const values = [obj.class,obj.name,obj.objectType,obj.description];
  for (const value of Object.values(obj.product || {})) values.push(value);
  for (const group of obj.propertySets || []) {
    for (const prop of group.props || []) values.push(prop.name,prop.value);
  }
  const explicit = aeAirTypeFromText(values.filter(Boolean).join(" "));
  const inferred = explicit || aeAirTypeFromColor(obj.color);
  if (inferred) {
    aeAddDerived(obj,"Tech-Medium",inferred);
    aeAddDerived(obj,"Agent Eyes Air Source",explicit ? "IFC/MEP-Systemdaten" : "Farb-Fallback");
    if (obj.color) aeAddDerived(obj,"Agent Eyes Color",obj.color);
  }
  return obj;
}
`;

if (!source.includes("async function scanVisibleTga() {")) {
  console.log("Agent Eyes V3.2: scan function not found; leaving stable source unchanged");
  process.exit(0);
}

source = source.replace("async function scanVisibleTga() {", helpers + "\nasync function scanVisibleTga() {");

source = source.replaceAll(
  "    description: product.description,\n    product: productData,",
  "    description: product.description,\n    color: obj.color,\n    product: productData,"
);

source = source.replace(
  "    const visibleGroups = (await api.viewer.getObjects(undefined,{visible:true})) || [];",
  "    const visibleGroups = await aeVisibleGroups();"
);

source = source.replace(
  "        const properties = rawProps.map((obj) => trimObjectPropsForScan(obj));",
  "        const properties = rawProps.map((obj) => aeEnrichAir(trimObjectPropsForScan(obj)));"
);

source = source.replace(
  '<div class="box-title">V3.1 Mengen / Stückliste</div>',
  '<div class="box-title">V3.2 Mengen / Stückliste</div>'
);

if (!source.includes(marker)) {
  console.log("Agent Eyes V3.2 marker missing after patch; leaving source unchanged");
  process.exit(0);
}

await writeFile(path,source,"utf8");
console.log("Agent Eyes V3.2 safe2 patch applied");