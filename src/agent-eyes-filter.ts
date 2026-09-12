/**
 * Agent Eyes V3.4 scan criteria.
 * Keeps the proven V3.2 scanner as fallback, but when a criterion is entered
 * it intercepts the scan and prefilters viewer objects BEFORE server analysis.
 */
export function injectAgentEyesFilter(html: string): string {
  const css = String.raw`
<style id="agentEyesFilterStyle">
.ae-filter{margin-top:14px;padding:10px;border:1px solid #cfd8df;border-radius:6px;background:#fff}
.ae-filter-label{display:block;font-weight:700;margin-bottom:6px}
.ae-filter-row{display:grid;grid-template-columns:1fr auto;gap:6px}
.ae-filter input{min-width:0;border:1px solid #aeb8c1;border-radius:4px;padding:9px 10px;font:inherit}
.ae-filter button{width:auto;padding:9px 12px;border:0;border-radius:4px;background:#0063a3;color:#fff;font:inherit}
.ae-filter-state{margin-top:6px;font-size:11px;font-weight:600;color:#08783e}
.ae-filter-help{margin-top:5px;font-size:11px;line-height:1.4;color:#6a6e79}
</style>`;

  const panel = String.raw`
<div class="ae-filter">
  <label class="ae-filter-label" for="aeFilterInput">Scan-Kriterium</label>
  <div class="ae-filter-row">
    <input id="aeFilterInput" type="text" autocomplete="off" placeholder="z. B. nur Zuluft Kanal">
    <button id="aeFilterApply" type="button">Setzen</button>
  </div>
  <div id="aeFilterState" class="ae-filter-state">Kein Kriterium – normaler Sichtbar-Scan</div>
  <div class="ae-filter-help">Mit Kriterium wird vor der TGA-Analyse gefiltert. Beispiele: „Zuluft Kanal“, „Abluft BSK“, „Fortluft Schalldämpfer“, „nur VSR“, „Entrauchung Kanal“. Feld leeren = normaler Scan.</div>
</div>`;

  const browserScript = String.raw`
<script type="module" id="agentEyesFilterScript">
import * as WorkspaceAPI from "https://esm.sh/trimble-connect-workspace-api@0.3.34";

const aeInput=document.getElementById("aeFilterInput");
const aeApply=document.getElementById("aeFilterApply");
const aeState=document.getElementById("aeFilterState");
const aeScanBtn=document.getElementById("scanBtn");
const aeQtyBox=document.getElementById("qtyBox");
const aeSummaryCount=document.getElementById("summaryCount");
const aeSummaryOpen=document.getElementById("summaryOpen");
const aeScanStatus=document.getElementById("scanStatus");
const aeAirStatus=document.getElementById("airStatus");
const aeCopy=document.getElementById("copyBtn");
const aePushUrl=new URL("/viewer-state",window.location.href).toString();
const aeIgnore=new Set(["nur","in","im","der","die","das","den","dem","und","oder","von","fuer","für","mit","alle","anzeigen","zeige","zeig","mir","bitte"]);
let aeApi=null,aeToken=null,aeRunning=false,aeLastRows=[],aeLastQuery="";

function aeNorm(value){return String(value||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim()}
function aeTokens(value){return aeNorm(value).split(" ").filter((word)=>word.length>1&&!aeIgnore.has(word))}
function aeCriterion(){return String(aeInput?.value||"").trim()}
function aeSetStatus(text,cls){if(!aeScanStatus)return;aeScanStatus.textContent=text;aeScanStatus.className=cls||""}
function aeNormalizeToken(value){if(typeof value!=="string")return null;let s=value.trim();if(s.toLowerCase().startsWith("bearer "))s=s.slice(7).trim();return s.split(".").length===3?s:null}

function aeAirFromText(text){const s=aeNorm(text),t=new Set(s.split(" ").filter(Boolean));if(s.includes("entrauch")||s.includes("smoke extract")||s.includes("rauchabzug")||t.has("rwa"))return "entrauchung";if(s.includes("fortluft")||t.has("fol")||t.has("eha"))return "fortluft";if(s.includes("aussenluft")||t.has("aul")||t.has("oda")||s.includes("outdoor air"))return "aussenluft";if(s.includes("zuluft")||t.has("zul")||t.has("sup")||s.includes("supply air"))return "zuluft";if(s.includes("abluft")||t.has("abl")||t.has("eta")||s.includes("extract air"))return "abluft";if(s.includes("umluft")||t.has("uml")||t.has("rca")||s.includes("return air"))return "umluft";return null}
function aeHexRgb(value){if(typeof value!=="string")return null;const m=value.match(/#?([0-9a-f]{6})/i);if(!m)return null;return [parseInt(m[1].slice(0,2),16),parseInt(m[1].slice(2,4),16),parseInt(m[1].slice(4,6),16)]}
function aeAirFromColor(value){const rgb=aeHexRgb(value);if(!rgb)return null;const r=rgb[0],g=rgb[1],b=rgb[2],max=Math.max(r,g,b),min=Math.min(r,g,b);if(max<70||max-min<35)return null;if(g>r*1.18&&g>b*1.10)return "aussenluft";if(b>r*1.18&&b>g*1.10)return "zuluft";if(r>175&&g>145&&b<125)return "abluft";if(r>165&&g>75&&g<175&&b<105)return "umluft";if(r>80&&r<185&&g>35&&g<135&&b<95)return "fortluft";return null}

function aeObjectText(obj){const values=[obj?.class,obj?.name,obj?.objectType,obj?.description];const product=obj?.product||{};for(const value of Object.values(product))values.push(value);for(const group of obj?.properties||[]){values.push(group?.name);for(const prop of group?.properties||[])values.push(prop?.name,prop?.value)}return values.filter((v)=>v!==null&&v!==undefined).join(" ")}
function aeComponentMatches(text,token,airType){const s=aeNorm(text);if(token==="kanal"||token==="luftkanal"||token==="luftleitung")return s.includes("luftleitung")||s.includes("luftkanal")||s.includes("duct")||(s.includes("ifcflowsegment")&&!!airType);if(token==="bsk"||token==="brandschutzklappe")return s.includes("brandschutzklappe")||s.includes("fkrs")||s.includes("fk2 eu")||s.includes("l bsk");if(token==="vsr"||token==="volumenstromregler")return s.includes("volumenstromreg")||s.includes("vav")||s.includes("tvr")||s.includes("tvj")||s.includes("tvz")||s.includes("tve")||s.includes("vfc");if(token==="schalldaempfer"||token==="schalldampfer")return s.includes("schalldaempfer")||s.includes("silencer")||s.includes("sound attenuator");if(token==="gitter"||token==="luftgitter")return s.includes("luftgitter")||s.includes("grille");if(token==="auslass"||token==="luftauslass")return s.includes("auslass")||s.includes("diffuser")||s.includes("tellerventil")||s.includes("air terminal");return null}
function aeParseQuery(query){const tokens=aeTokens(query);let air=null,component=null;const free=[];for(const token of tokens){if(["zuluft","zul"].includes(token)){air="zuluft";continue}if(["abluft","abl"].includes(token)){air="abluft";continue}if(["fortluft","fol"].includes(token)){air="fortluft";continue}if(["aussenluft","aul","außenluft"].includes(token)){air="aussenluft";continue}if(["umluft","uml"].includes(token)){air="umluft";continue}if(["entrauchung","rwa"].includes(token)){air="entrauchung";continue}if(["kanal","luftkanal","luftleitung","bsk","brandschutzklappe","vsr","volumenstromregler","schalldaempfer","schalldampfer","gitter","luftgitter","auslass","luftauslass"].includes(token)){component=token;continue}free.push(token)}return {air,component,free,tokens}}
function aeObjectMatches(obj,parsed){const text=aeObjectText(obj);const air=aeAirFromText(text)||aeAirFromColor(obj?.color);if(parsed.air&&air!==parsed.air)return false;if(parsed.component){const hit=aeComponentMatches(text,parsed.component,air);if(hit===false)return false;if(hit===null&&!aeNorm(text).includes(parsed.component))return false}const s=aeNorm(text);return parsed.free.every((token)=>s.includes(token))}
function aeAnalysisMatches(c,parsed){const text=[c?.type,c?.label,c?.ifcType,c?.name,c?.description,c?.objectType,c?.productType,c?.manufacturer,c?.system].filter(Boolean).join(" ");const air=aeAirFromText(text);if(parsed.air&&air!==parsed.air)return false;if(parsed.component){const hit=aeComponentMatches(text,parsed.component,air);if(hit===false)return false;if(hit===null&&!aeNorm(text).includes(parsed.component))return false}const s=aeNorm(text);return parsed.free.every((token)=>s.includes(token))}

function aeTrim(obj){const product=obj?.product||{},productData={};for(const [key,value] of Object.entries(product)){if(value===null||value===undefined||typeof value==="string"||typeof value==="number"||typeof value==="boolean")productData[key]=String(value).slice(0,500)}return {runtimeId:obj?.id,class:obj?.class,name:product.name,objectType:product.objectType,description:product.description,color:obj?.color,product:productData,propertySets:(obj?.properties||[]).slice(0,80).map((group)=>({name:group?.name,props:(group?.properties||[]).slice(0,100).map((p)=>({name:p?.name,value:String(p?.value??"").slice(0,500)}))}))}}
function aeNormalizeGroups(groups){return (groups||[]).map((group)=>{const objects=Array.isArray(group?.objects)?group.objects:[];const ids=objects.length?objects.map((o)=>o?.id).filter((id)=>id!==undefined&&id!==null):Array.from(group?.objectRuntimeIds||[]);return {modelId:group?.modelId,objects,objectRuntimeIds:Array.from(new Set(ids))}}).filter((g)=>g.modelId&&g.objectRuntimeIds.length)}
function aeGroupCount(groups){return groups.reduce((sum,g)=>sum+g.objectRuntimeIds.length,0)}
function aeSubtractHidden(allGroups,hiddenGroups){const hidden=new Map();for(const g of hiddenGroups)hidden.set(g.modelId,new Set(g.objectRuntimeIds));return allGroups.map((g)=>{const blocked=hidden.get(g.modelId)||new Set();return {modelId:g.modelId,objects:(g.objects||[]).filter((o)=>!blocked.has(o?.id)),objectRuntimeIds:g.objectRuntimeIds.filter((id)=>!blocked.has(id))}}).filter((g)=>g.objectRuntimeIds.length)}
async function aeVisibleGroups(){try{const direct=aeNormalizeGroups(await aeApi.viewer.getObjects(undefined,{visible:true}));if(aeGroupCount(direct)>0)return {groups:direct,mode:"visible:true"}}catch{}let all=[],hidden=[];try{all=aeNormalizeGroups(await aeApi.viewer.getObjects())}catch{}try{hidden=aeNormalizeGroups(await aeApi.viewer.getObjects(undefined,{visible:false}))}catch{}return {groups:aeSubtractHidden(all,hidden),mode:"all-minus-hidden"}}

async function aeConnect(){if(aeApi&&aeToken)return;aeApi=await WorkspaceAPI.connect(window.parent,()=>{},30000);const permission=await aeApi.extension.requestPermission("accesstoken");aeToken=aeNormalizeToken(permission);if(!aeToken)throw new Error("Keine Zugriffserlaubnis")}
async function aePost(selection,models,project){const payload={capturedAt:Date.now(),project:project?{id:project.id,name:project.name,location:project.location}:undefined,models:models.map((m)=>({id:m.id,versionId:m.versionId,name:m.name})),selection};const res=await fetch(aePushUrl,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+aeToken},body:JSON.stringify(payload)});if(!res.ok)throw new Error("HTTP "+res.status);return await res.json()}
function aeNum(value,decimals){const n=Number(value);return Number.isFinite(n)?n.toLocaleString("de-DE",{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):"-"}
function aeDim(c){if(c?.shape==="rectangular")return aeNum(c.widthMm,0)+" × "+aeNum(c.heightMm,0)+" mm";if(c?.shape==="round")return "Ø "+aeNum(c.diameterMm,0)+" mm";return "-"}
function aeAirStatus(list){const counts={zuluft:0,abluft:0,aussenluft:0,fortluft:0,umluft:0,entrauchung:0};for(const c of list){const a=aeAirFromText(c?.system||"");if(a&&counts[a]!==undefined)counts[a]++}const codes={zuluft:"ZUL",abluft:"ABL",aussenluft:"AUL",fortluft:"FOL",umluft:"UML",entrauchung:"ER"};const parts=Object.keys(counts).filter((k)=>counts[k]>0).map((k)=>codes[k]+" "+counts[k]);if(aeAirStatus){}if(document.getElementById("airStatus")){document.getElementById("airStatus").textContent=parts.length?parts.join(" · "):"keine Luftart erkannt"}}
function aeAggregate(list){const map=new Map();for(const c of list){const dim=aeDim(c),manufacturer=c.manufacturer||c.productEnrichment?.manufacturer||"-",productType=c.productType||c.productEnrichment?.productSeries||c.objectType||"-",unit=c.quantityUnit||"";const key=[c.type||c.label,dim,manufacturer,productType,unit,c.insulationMm??""].join("||");if(!map.has(key))map.set(key,{label:c.label||c.type||"Bauteil",dimension:dim,manufacturer,productType,unit,quantity:0,known:0,count:0,systems:new Set(),storeys:new Set(),lvKey:c.type||""});const row=map.get(key);row.count++;if(c.quantity!=null&&Number.isFinite(Number(c.quantity))){row.quantity+=Number(c.quantity);row.known++}if(c.system)row.systems.add(c.system);if(c.storey)row.storeys.add(c.storey)}return Array.from(map.values()).sort((a,b)=>String(a.label).localeCompare(String(b.label),"de")||String(a.dimension).localeCompare(String(b.dimension),"de",{numeric:true}))}
function aeCompact(set){const values=Array.from(set||[]);return values.length?values.slice(0,2).join(", ")+(values.length>2?" +"+(values.length-2):""):"-"}
function aeRender(list,criterion,totalCandidates,totalVisible){const rows=aeAggregate(list);aeLastRows=rows;aeLastQuery=criterion;if(aeSummaryCount)aeSummaryCount.textContent="Kriterium: "+list.length+" TGA-Objekte / "+rows.length+" Gruppen";const open=rows.filter((r)=>r.known<r.count).length;if(aeSummaryOpen)aeSummaryOpen.textContent=open+" offene Mengen";if(aeQtyBox){aeQtyBox.textContent="";for(let i=0;i<rows.length;i++){const row=rows[i],div=document.createElement("div");div.className="qty-row";let qty=row.unit?row.unit+" – Menge offen":"Menge offen";if(row.known){qty=aeNum(row.quantity,row.unit==="St."?0:2)+(row.unit?" "+row.unit:"")+(row.known<row.count?" + offen":"")}const main=document.createElement("div");main.className="qty-main";main.textContent=(i+1)+". "+row.label+" | "+row.dimension+" | "+qty;const sub=document.createElement("div");sub.className="qty-sub";sub.textContent="Objekte: "+row.count+" | Fabrikat: "+row.manufacturer+" | Typ: "+row.productType+" | System: "+aeCompact(row.systems)+" | Geschoss: "+aeCompact(row.storeys);const lv=document.createElement("div");lv.className="lv-key";lv.textContent="LV-Key: "+row.lvKey;div.append(main,sub,lv);aeQtyBox.appendChild(div)}}if(aeState)aeState.textContent="Kriterium: "+criterion+" → "+totalCandidates+" Kandidaten aus "+totalVisible+" sichtbaren Objekten";if(aeCopy)aeCopy.disabled=rows.length===0;aeAirStatus(list)}

async function aeFilteredScan(){const criterion=aeCriterion();if(!criterion||aeRunning)return;aeRunning=true;if(aeScanBtn)aeScanBtn.disabled=true;const parsed=aeParseQuery(criterion);try{await aeConnect();aeSetStatus("Kriterium wird im Modell gesucht…","working");const models=(await aeApi.viewer.getModels("loaded"))||[],modelMap=new Map(models.map((m)=>[m.id,m]));let project=null;try{project=await aeApi.project.getCurrentProject()}catch{}const visibility=await aeVisibleGroups(),groups=visibility.groups,totalVisible=aeGroupCount(groups);let checked=0;const candidates=[];
for(const group of groups){let objects=group.objects||[];if(!objects.length&&group.objectRuntimeIds.length){for(let offset=0;offset<group.objectRuntimeIds.length;offset+=100){const ids=group.objectRuntimeIds.slice(offset,offset+100);try{objects=objects.concat((await aeApi.viewer.getObjectProperties(group.modelId,ids))||[])}catch{}checked+=ids.length;if(checked%1000===0)aeSetStatus("Kriterium geprüft: "+checked+" / "+totalVisible,"working")}}else{checked+=objects.length}for(const obj of objects){if(aeObjectMatches(obj,parsed))candidates.push({modelId:group.modelId,modelName:modelMap.get(group.modelId)?.name,obj})}if(checked%1000===0)aeSetStatus("Kriterium geprüft: "+checked+" / "+totalVisible,"working")}
if(!candidates.length){aeRender([],criterion,0,totalVisible);aeSetStatus("0 Treffer aus "+totalVisible+" sichtbar | "+visibility.mode,"warn");return}
aeSetStatus(candidates.length+" Kandidaten – TGA-Analyse startet…","working");const found=[];for(let offset=0;offset<candidates.length;offset+=250){const chunk=candidates.slice(offset,offset+250),byModel=new Map();for(const item of chunk){if(!byModel.has(item.modelId))byModel.set(item.modelId,[]);byModel.get(item.modelId).push(item)}const selection=[];for(const [modelId,items] of byModel){selection.push({modelId,modelName:items[0].modelName,objectRuntimeIds:items.map((i)=>i.obj.id),properties:items.map((i)=>aeTrim(i.obj))})}const data=await aePost(selection,models,project);for(const c of data.tgaAnalysis||[]){if(c&&c.type&&c.type!=="unknown"&&aeAnalysisMatches(c,parsed))found.push(c)}aeSetStatus("Analysiert: "+Math.min(offset+250,candidates.length)+" / "+candidates.length+" Kandidaten","working");aeRender(found,criterion,candidates.length,totalVisible)}aeSetStatus(found.length+" TGA-Treffer aus "+candidates.length+" Kandidaten | "+visibility.mode,"ok")}catch(err){aeSetStatus("Kriterien-Scan Fehler","warn");if(aeQtyBox)aeQtyBox.textContent="Gefilterter Modellscan fehlgeschlagen:\n"+String(err)}finally{aeRunning=false;if(aeScanBtn)aeScanBtn.disabled=false}}

function aeRefreshCriterion(){const criterion=aeCriterion();if(!aeState)return;if(criterion){aeState.textContent="Kriterium gesetzt: "+criterion+" – der nächste Scan wertet nur passende Objekte aus";if(aeScanBtn)aeScanBtn.textContent="Nach Kriterium scannen"}else{aeState.textContent="Kein Kriterium – normaler Sichtbar-Scan";if(aeScanBtn)aeScanBtn.textContent="Sichtbare TGA scannen"}}
aeApply?.addEventListener("click",aeRefreshCriterion);aeInput?.addEventListener("keydown",(event)=>{if(event.key==="Enter"){event.preventDefault();aeRefreshCriterion()}});aeInput?.addEventListener("input",aeRefreshCriterion);
document.addEventListener("click",(event)=>{const target=event.target;if(target&&target.id==="scanBtn"&&aeCriterion()){event.preventDefault();event.stopImmediatePropagation();aeFilteredScan()}},true);

aeCopy?.addEventListener("click",async(event)=>{if(!aeLastRows.length||!aeLastQuery)return;event.preventDefault();event.stopImmediatePropagation();const lines=["Agent Eyes Stückliste – Kriterium: "+aeLastQuery,""];aeLastRows.forEach((row,index)=>{let qty=row.unit?row.unit+" – Menge offen":"Menge offen";if(row.known)qty=aeNum(row.quantity,row.unit==="St."?0:2)+(row.unit?" "+row.unit:"");lines.push((index+1)+". "+row.label+" | "+row.dimension+" | "+qty,"   Objekte: "+row.count+" | System: "+aeCompact(row.systems)+" | Fabrikat: "+row.manufacturer,"   LV-Key: "+row.lvKey,"")});try{await navigator.clipboard.writeText(lines.join("\n"));const old=aeCopy.textContent;aeCopy.textContent="Kriterium kopiert ✓";setTimeout(()=>{aeCopy.textContent=old},1500)}catch{}},true);

aeRefreshCriterion();
</script>`;

  let out = html;
  if (!out.includes("agentEyesFilterStyle")) out = out.replace("</head>", css + "\n</head>");
  if (!out.includes("aeFilterInput")) out = out.replace('<div class="box"><div class="box-title">TGA Analyse', panel + '\n<div class="box"><div class="box-title">TGA Analyse');
  out = out.replace("V3.2 Mengen / Stückliste", "V3.4 Mengen / Stückliste");
  if (!out.includes("agentEyesFilterScript")) out = out.replace("</body>", browserScript + "\n</body>");
  return out;
}
