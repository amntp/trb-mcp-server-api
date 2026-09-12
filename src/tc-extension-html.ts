/**
 * Agent Eyes Trimble Connect extension.
 * V3.2: robust model scan + project-aware air-system recognition.
 */
export function createTcExtensionHtml(): string {
  return String.raw`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Eyes</title>
<style>
body{font-family:"Open Sans",system-ui,sans-serif;margin:0;padding:16px;color:#252a2e;font-size:13px}
h1{font-size:15px;margin:0 0 4px}.sub{color:#6a6e79;margin:0 0 16px}.row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #e0e1e9}.row .label{color:#6a6e79}.ok{color:#006638;font-weight:600}.warn{color:#da212c;font-weight:600}.working{color:#0063a3;font-weight:600}.box{margin-top:14px;padding:10px;border:1px solid #d9e1e8;border-radius:6px;background:#f7f9fb}.box-title{font-weight:700;margin-bottom:8px;font-size:13px}.result{white-space:pre-line;font-size:12px;line-height:1.55;word-break:break-word}.summary-meta{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px;color:#6a6e79;font-size:11px}.qty-row{padding:8px 0;border-top:1px solid #e0e1e9}.qty-row:first-child{border-top:0}.qty-main{font-weight:700;font-size:12px;line-height:1.45}.qty-sub{color:#555d66;font-size:11px;line-height:1.45;margin-top:2px}.lv-key{color:#6a6e79;font-size:10px;line-height:1.35;margin-top:3px;word-break:break-all}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}button{width:100%;padding:8px 12px;border:0;border-radius:4px;background:#0063a3;color:#fff;font-size:13px;cursor:pointer}button.secondary{background:#4d5963}button.scan{grid-column:1/-1;background:#08783e}button:disabled{background:#b7b9c3;cursor:default}.note{margin-top:12px;color:#6a6e79;font-size:12px;line-height:1.5}.air-pill{display:inline-block;border:1px solid #d7dce1;border-radius:10px;padding:2px 6px;margin:2px 3px 2px 0;background:#fff;font-size:10px}
</style>
</head>
<body>
<h1>Agent Eyes</h1>
<p class="sub">TGA-Auswertung, Modellscan, Luftarten, Mengen und LV-Vorbereitung</p>
<div class="row"><span class="label">Verbindung</span><span id="conn">…</span></div>
<div class="row"><span class="label">Autorisierung</span><span id="auth">…</span></div>
<div class="row"><span class="label">Projekt</span><span id="project">–</span></div>
<div class="row"><span class="label">Auswahl</span><span id="selection">0 Objekte</span></div>
<div class="row"><span class="label">Scan</span><span id="scanStatus">bereit</span></div>
<div class="row"><span class="label">Luftarten</span><span id="airStatus">noch nicht gescannt</span></div>
<div class="row"><span class="label">Letzte Synchronisierung</span><span id="sync">noch nie</span></div>
<div class="box"><div class="box-title">TGA Analyse – aktuelle Auswahl</div><div id="tgaBox" class="result">Noch kein Bauteil ausgewertet.</div></div>
<div class="box"><div class="box-title">V3.2 Mengen / Stückliste</div><div class="summary-meta"><span id="summaryCount">0 Objekte</span><span id="summaryOpen">0 offene Mengen</span></div><div id="qtyBox" class="result">Auswahl analysieren oder sichtbare TGA scannen.</div></div>
<div class="actions"><button id="scanBtn" class="scan" disabled>Sichtbare TGA scannen</button><button id="syncBtn" disabled>Auswahl synchronisieren</button><button id="copyBtn" class="secondary" disabled>Stückliste kopieren</button></div>
<p class="note">Der Scanner nimmt zuerst die tatsächlich sichtbaren Objekte. Falls Trimble dafür keine IDs liefert, wird automatisch aus „alle geladenen minus versteckte“ rekonstruiert. Luftarten werden primär aus IFC/MEP-Systemdaten erkannt; Farben dienen zusätzlich als projektspezifisch gelernte bzw. normnahe Zuordnung.</p>
<script type="module">
import * as WorkspaceAPI from "https://esm.sh/trimble-connect-workspace-api@0.3.34";

const els={conn:document.getElementById("conn"),auth:document.getElementById("auth"),project:document.getElementById("project"),selection:document.getElementById("selection"),scanStatus:document.getElementById("scanStatus"),airStatus:document.getElementById("airStatus"),sync:document.getElementById("sync"),tgaBox:document.getElementById("tgaBox"),qtyBox:document.getElementById("qtyBox"),summaryCount:document.getElementById("summaryCount"),summaryOpen:document.getElementById("summaryOpen"),btn:document.getElementById("syncBtn"),scanBtn:document.getElementById("scanBtn"),copyBtn:document.getElementById("copyBtn")};
const PUSH_URL=new URL("/viewer-state",window.location.href).toString();
const PUSH_INTERVAL_MS=5000,SCAN_PROPERTY_BATCH=50,SCAN_SERVER_CHUNK=350,PROPS_MAX_OBJECTS=30,PROPS_MAX_GROUPS=80,PROPS_MAX_PER_GROUP=200;
let api=null,token=null,project=null,dirty=true,pushing=false,scanning=false,lastSummaryText="";

const AIR_TYPES={
  zuluft:{label:"Zuluft",code:"ZUL",canonical:"L_Zuluft"},
  abluft:{label:"Abluft",code:"ABL",canonical:"L_Abluft"},
  aussenluft:{label:"Außenluft",code:"AUL",canonical:"L_Außenluft"},
  fortluft:{label:"Fortluft",code:"FOL",canonical:"L_Fortluft"},
  umluft:{label:"Umluft",code:"UML",canonical:"L_Umluft"},
  entrauchung:{label:"Entrauchung",code:"ER",canonical:"L_Entrauchung"}
};
const learnedAirColors=new Map();

function setText(el,text,cls){if(!el)return;el.textContent=text;el.className=cls||""}
function normalizeToken(value){if(typeof value!=="string")return null;let s=value.trim();if(s.toLowerCase().startsWith("bearer "))s=s.slice(7).trim();return s.split(".").length===3?s:null}
function onEvent(event,data){if(event==="extension.accessToken"){const tok=normalizeToken(data);if(tok){token=tok;setText(els.auth,"erteilt","ok");els.scanBtn.disabled=false;dirty=true}else if(data==="denied")setText(els.auth,"verweigert","warn")}if(event==="viewer.selectionChanged"||event==="viewer.cameraChanged"||event==="viewer.modelLoaded"||event==="viewer.modelStateChanged")dirty=true}
function trimValue(v){if(v===null||v===undefined)return "";const s=typeof v==="object"?JSON.stringify(v):String(v);return s.length>500?s.slice(0,500)+"…":s}
function norm(v){return String(v||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim()}
function airTypeFromText(value){const s=" "+norm(value)+" ";if(/\b(entrauch|smoke extract|smoke exhaust|rauchgas|rauchabzug|rwa)\b/.test(s))return "entrauchung";if(/\b(fortluft|fol|eha|exhaust air)\b/.test(s))return "fortluft";if(/\b(aussenluft|aul|oda|outdoor air|fresh air)\b/.test(s))return "aussenluft";if(/\b(zuluft|zul|sup|supply air)\b/.test(s))return "zuluft";if(/\b(abluft|abl|eta|extract air)\b/.test(s))return "abluft";if(/\b(umluft|uml|rca|recirculat|return air)\b/.test(s))return "umluft";return null}
function canonicalAir(type){return type&&AIR_TYPES[type]?AIR_TYPES[type].canonical:null}
function normalizeColor(value){
  if(value===null||value===undefined)return null;
  if(typeof value==="string"){
    const s=value.trim();const hex=s.match(/#?([0-9a-f]{6})(?:[0-9a-f]{2})?/i);if(hex)return "#"+hex[1].toUpperCase();
    const rgb=s.match(/rgba?\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);if(rgb)return rgbHex(Number(rgb[1]),Number(rgb[2]),Number(rgb[3]));
    const nums=s.match(/^\s*(\d+(?:\.\d+)?)\s*[;, ]\s*(\d+(?:\.\d+)?)\s*[;, ]\s*(\d+(?:\.\d+)?)\s*$/);if(nums)return rgbHex(Number(nums[1]),Number(nums[2]),Number(nums[3]));
  }
  if(Array.isArray(value)&&value.length>=3)return rgbHex(Number(value[0]),Number(value[1]),Number(value[2]));
  if(typeof value==="object"){
    const r=value.r??value.red??value.R,g=value.g??value.green??value.G,b=value.b??value.blue??value.B;if(r!=null&&g!=null&&b!=null)return rgbHex(Number(r),Number(g),Number(b));
  }
  return null;
}
function rgbHex(r,g,b){const vals=[r,g,b].map((n)=>{let x=Number.isFinite(n)?n:0;if(x>=0&&x<=1)x*=255;x=Math.max(0,Math.min(255,Math.round(x)));return x.toString(16).padStart(2,"0")});return "#"+vals.join("").toUpperCase()}
function hexRgb(hex){if(!hex||!/^#[0-9A-F]{6}$/i.test(hex))return null;return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]}
function colorDistance(a,b){const x=hexRgb(a),y=hexRgb(b);if(!x||!y)return Infinity;return Math.sqrt((x[0]-y[0])**2+(x[1]-y[1])**2+(x[2]-y[2])**2)}
function learnAirColor(type,color){if(!type||!color)return;if(!learnedAirColors.has(type))learnedAirColors.set(type,new Map());const m=learnedAirColors.get(type);m.set(color+-�Ƞ��k�w��