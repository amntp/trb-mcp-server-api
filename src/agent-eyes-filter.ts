/**
 * UI-only quantity filter for Agent Eyes.
 * Keeps the proven scanner untouched and filters the rendered quantity groups.
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
  <label class="ae-filter-label" for="aeFilterInput">Auswahlkriterien</label>
  <div class="ae-filter-row">
    <input id="aeFilterInput" type="text" autocomplete="off" placeholder="z. B. nur Zuluft Kanal">
    <button id="aeFilterApply" type="button">Anwenden</button>
  </div>
  <div id="aeFilterState" class="ae-filter-state">Kein Filter – alle erkannten TGA-Bauteile</div>
  <div class="ae-filter-help">Beispiele: „Zuluft Kanal“, „Abluft BSK“, „Fortluft Schalldämpfer“, „nur VSR“, „Entrauchung Kanal“. Wörter wie „nur“, „in“, „zeige mir“ werden ignoriert.</div>
</div>`;

  const browserScript = String.raw`
<script type="module" id="agentEyesFilterScript">
const aeInput=document.getElementById("aeFilterInput");
const aeApply=document.getElementById("aeFilterApply");
const aeState=document.getElementById("aeFilterState");
const aeQtyBox=document.getElementById("qtyBox");
const aeCopy=document.getElementById("copyBtn");
let aeScheduled=false;

function aeNorm(value){return String(value||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim()}
const aeIgnore=new Set(["nur","in","im","der","die","das","den","dem","und","oder","von","fuer","für","mit","alle","anzeigen","zeige","zeig","mir","bitte"]);
function aeTokens(){return aeNorm(aeInput?.value).split(" ").filter((word)=>word.length>1&&!aeIgnore.has(word))}
function aeMatches(row,tokens){if(!tokens.length)return true;const text=aeNorm(row.textContent);return tokens.every((token)=>text.includes(token))}
function aeObjectCount(row){const match=String(row.textContent||"").match(/Objekte:\s*(\d+)/i);return match?Number(match[1]):0}
function aeApplyFilter(){
  if(!aeQtyBox||!aeState)return;
  const tokens=aeTokens(),rows=Array.from(aeQtyBox.querySelectorAll(".qty-row"));
  let groups=0,objects=0;
  for(const row of rows){const show=aeMatches(row,tokens);row.style.display=show?"":"none";if(show){groups++;objects+=aeObjectCount(row)}}
  if(!tokens.length){aeState.textContent="Kein Filter – alle erkannten TGA-Bauteile";return}
  aeState.textContent="Filter: "+aeInput.value.trim()+" → "+objects+" Objekte / "+groups+" Gruppen";
}
function aeSchedule(){if(aeScheduled)return;aeScheduled=true;queueMicrotask(()=>{aeScheduled=false;aeApplyFilter()})}

aeApply?.addEventListener("click",aeApplyFilter);
aeInput?.addEventListener("keydown",(event)=>{if(event.key==="Enter"){event.preventDefault();aeApplyFilter()}});
aeInput?.addEventListener("input",()=>{if(!aeInput.value.trim())aeApplyFilter()});
if(aeQtyBox)new MutationObserver(aeSchedule).observe(aeQtyBox,{childList:true,subtree:true,characterData:true});

aeCopy?.addEventListener("click",async(event)=>{
  const tokens=aeTokens();if(!tokens.length)return;
  event.preventDefault();event.stopImmediatePropagation();
  const visible=Array.from(aeQtyBox?.querySelectorAll(".qty-row")||[]).filter((row)=>row.style.display!=="none");
  const lines=["Agent Eyes Stückliste – Filter: "+aeInput.value.trim(),""];
  visible.forEach((row,index)=>{const main=row.querySelector(".qty-main")?.textContent||"";const sub=row.querySelector(".qty-sub")?.textContent||"";const lv=row.querySelector(".lv-key")?.textContent||"";lines.push(String(index+1)+". "+main.replace(/^\d+\.\s*/,""),"   "+sub,"   "+lv,"")});
  try{await navigator.clipboard.writeText(lines.join("\n"));const old=aeCopy.textContent;aeCopy.textContent="Filter kopiert ✓";setTimeout(()=>{aeCopy.textContent=old},1500)}catch{aeCopy.textContent="Kopieren fehlgeschlagen"}
},true);

aeApplyFilter();
</script>`;

  let out = html;
  if (!out.includes("agentEyesFilterStyle")) out = out.replace("</head>", css + "\n</head>");
  if (!out.includes("aeFilterInput")) out = out.replace('<div class="box"><div class="box-title">TGA Analyse', panel + '\n<div class="box"><div class="box-title">TGA Analyse');
  out = out.replace("V3.2 Mengen / Stückliste", "V3.3 Mengen / Stückliste");
  if (!out.includes("agentEyesFilterScript")) out = out.replace("</body>", browserScript + "\n</body>");
  return out;
}
