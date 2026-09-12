/**
 * "Agent Eyes" Trimble Connect extension.
 *
 * Liest Auswahl + IFC-/Produkt-Eigenschaften + Property Sets aus dem Viewer,
 * sendet sie an POST /viewer-state und zeigt die TGA-Auswertung an.
 */

export function createTcExtensionHtml(): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Eyes</title>
<style>
  body { font-family: "Open Sans", system-ui, sans-serif; margin:0; padding:16px; color:#252a2e; font-size:13px; }
  h1 { font-size:15px; margin:0 0 4px; }
  .sub { color:#6a6e79; margin:0 0 16px; }
  .row { display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid #e0e1e9; }
  .row .label { color:#6a6e79; }
  .ok { color:#006638; font-weight:600; }
  .warn { color:#da212c; font-weight:600; }
  button { margin-top:16px; width:100%; padding:8px 12px; border:0; border-radius:4px; background:#0063a3; color:#fff; font-size:13px; cursor:pointer; }
  button:disabled { background:#b7b9c3; cursor:default; }
  .note { margin-top:12px; color:#6a6e79; font-size:12px; line-height:1.5; }
  .tga-box { margin-top:14px; padding:10px; border:1px solid #d9e1e8; border-radius:6px; background:#f7f9fb; }
  .tga-title { font-weight:700; margin-bottom:8px; font-size:13px; }
  .tga-result { white-space:pre-line; font-size:12px; line-height:1.55; word-break:break-word; }
</style>
</head>
<body>
<h1>Agent Eyes</h1>
<p class="sub">TGA-Auswertung direkt aus dem Trimble-3D-Modell</p>

<div class="row"><span class="label">Verbindung</span><span id="conn">…</span></div>
<div class="row"><span class="label">Autorisierung</span><span id="auth">…</span></div>
<div class="row"><span class="label">Projekt</span><span id="project">–</span></div>
<div class="row"><span class="label">Auswahl</span><span id="selection">0 Objekte</span></div>
<div class="row"><span class="label">Letzte Synchronisierung</span><span id="sync">noch nie</span></div>

<div class="tga-box">
  <div class="tga-title">TGA Analyse</div>
  <div id="tgaBox" class="tga-result">Noch kein Bauteil ausgewertet.</div>
</div>

<button id="syncBtn" disabled>Jetzt synchronisieren</button>

<p class="note">
Auswahl, IFC-Eigenschaften, Produktdaten und Property Sets werden an den TGA-Analyseserver übertragen.
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
  btn: document.getElementById("syncBtn"),
};

const PUSH_URL =
  new URL("/viewer-state", window.location.href).toString();

const PUSH_INTERVAL_MS = 5000;

let api = null;
let token = null;
let project = null;
let dirty = true;
let pushing = false;


function setText(el, text, cls) {
  if (!el) return;

  el.textContent = text;
  el.className = cls || "";
}


function normalizeToken(value) {

  if (typeof value !== "string") {
    return null;
  }

  let s =
    value.trim();

  if (
    s.toLowerCase()
      .startsWith("bearer ")
  ) {

    s =
      s.slice(7)
        .trim();
  }

  return s.split(".").length === 3
    ? s
    : null;
}


function onEvent(event, data) {

  if (
    event === "extension.accessToken"
  ) {

    const tok =
      normalizeToken(data);

    if (tok) {

      token = tok;

      setText(
        els.auth,
        "erteilt",
        "ok"
      );

      dirty = true;
    }

    else if (
      data === "denied"
    ) {

      setText(
        els.auth,
        "verweigert",
        "warn"
      );
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

  if (
    v === null ||
    v === undefined
  ) {
    return "";
  }

  const s =
    typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

  return s.length > 500
    ? s.slice(0, 500) + "…"
    : s;
}


function trimObjectProps(obj) {

  const product =
    obj.product || {};

  const productData = {};


  for (
    const [key, value]
    of Object.entries(product)
  ) {

    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {

      productData[key] =
        trimValue(value);
    }
  }


  return {

    runtimeId:
      obj.id,

    class:
      obj.class,

    name:
      product.name,

    objectType:
      product.objectType,

    description:
      product.description,

    product:
      productData,

    propertySets:
      (obj.properties || [])
        .slice(
          0,
          PROPS_MAX_GROUPS
        )
        .map(
          (group) => ({

            name:
              group.name,

            props:
              (group.properties || [])
                .slice(
                  0,
                  PROPS_MAX_PER_GROUP
                )
                .map(
                  (p) => ({

                    name:
                      p.name,

                    value:
                      trimValue(
                        p.value
                      )
                  })
                )
          })
        )
  };
}


/* =========================================================
   VIEWER CAPTURE
========================================================= */

async function capture() {

  const state = {
    capturedAt:
      Date.now()
  };


  try {

    state.camera =
      await api.viewer
        .getCamera();

  } catch {}


  try {

    const models =
      await api.viewer
        .getModels(
          "loaded"
        );


    state.models =
      (models || [])
        .map(
          (m) => ({

            id:
              m.id,

            versionId:
              m.versionId,

            name:
              m.name
          })
        );

  } catch {}


  try {

    const selection =
      await api.viewer
        .getSelection();


    const entries = [];

    let count = 0;

    let propsBudget =
      PROPS_MAX_OBJECTS;


    for (
      const sel
      of selection || []
    ) {

      const runtimeIds =
        (
          sel.objectRuntimeIds ||
          []
        )
          .slice(
            0,
            500
          );


      count +=
        runtimeIds.length;


      const entry = {

        modelId:
          sel.modelId,

        objectRuntimeIds:
          runtimeIds
      };


      try {

        entry.externalIds =
          await api.viewer
            .convertToObjectIds(
              sel.modelId,
              runtimeIds
            );

      } catch {}


      if (
        propsBudget > 0 &&
        runtimeIds.length > 0
      ) {

        const propIds =
          runtimeIds.slice(
            0,
            propsBudget
          );


        try {

          const rawProps =
            await api.viewer
              .getObjectProperties(
                sel.modelId,
                propIds
              );


          entry.properties =
            (rawProps || [])
              .map(
                (obj, i) => {

                  const trimmed =
                    trimObjectProps(
                      obj
                    );


                  if (
                    entry.externalIds &&
                    entry.externalIds[i]
                  ) {

                    trimmed.externalId =
                      entry.externalIds[i];
                  }


                  return trimmed;
                }
              );


          propsBudget -=
            propIds.length;

        }

        catch (err) {

          console.warn(
            "getObjectProperties failed",
            err
          );
        }
      }


      const model =
        (state.models || [])
          .find(
            (m) =>
              m.id ===
              sel.modelId
          );


      if (model) {

        entry.modelName =
          model.name;
      }


      entries.push(
        entry
      );
    }


    state.selection =
      entries;


    setText(
      els.selection,
      count +
        " Objekt" +
        (
          count === 1
            ? ""
            : "e"
        )
    );

  }

  catch (err) {

    console.warn(
      "Selection capture failed",
      err
    );
  }


  try {

    state.snapshot =
      await api.viewer
        .getSnapshot();

  } catch {}


  if (project) {

    state.project = {

      id:
        project.id,

      name:
        project.name,

      location:
        project.location
    };
  }


  return state;
}


/* =========================================================
   TGA DISPLAY
========================================================= */

function formatNumber(
  value,
  decimals
) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number)
  ) {

    return "-";
  }


  return number
    .toLocaleString(
      "de-DE",
      {

        minimumFractionDigits:
          decimals,

        maximumFractionDigits:
          decimals
      }
    );
}


function renderTgaAnalysis(
  list
) {

  if (
    !list ||
    list.length === 0
  ) {

    els.tgaBox.textContent =
      "Kein Bauteil ausgewählt.";

    return;
  }


  const c =
    list[0];


  let dimension =
    "-";


  if (
    c.shape ===
      "rectangular"
  ) {

    dimension =

      (
        c.widthMm != null
          ? formatNumber(
              c.widthMm,
              0
            )
          : "?"
      )

      +

      " × "

      +

      (
        c.heightMm != null
          ? formatNumber(
              c.heightMm,
              0
            )
          : "?"
      )

      +

      " mm";
  }


  else if (
    c.shape ===
      "round"
  ) {

    dimension =

      "Ø "

      +

      (
        c.diameterMm != null
          ? formatNumber(
              c.diameterMm,
              0
            )
          : "?"
      )

      +

      " mm";
  }


  const flow =

    c.airflowM3h != null

      ? formatNumber(
          c.airflowM3h,
          0
        ) +
        " m³/h"

      : "-";


  const velocity =

    c.velocityMs != null

      ? formatNumber(
          c.velocityMs,
          2
        ) +
        " m/s"

      : "-";


  const length =

    c.lengthMm != null

      ? formatNumber(
          c.lengthMm /
          1000,
          2
        ) +
        " m"

      : "-";


  const insulation =

    c.insulationMm != null

      ? formatNumber(
          c.insulationMm,
          0
        ) +
        " mm"

      : "-";


  const pressureLoss =

    c.pressureLossPa != null

      ? formatNumber(
          c.pressureLossPa,
          1
        ) +
        " Pa"

      : "-";


  const zeta =

    c.zeta != null

      ? formatNumber(
          c.zeta,
          2
        )

      : "-";


  let quantity =
    "-";


  if (
    c.quantity != null
  ) {

    const decimals =
      c.quantityUnit ===
        "St."
        ? 0
        : 2;


    quantity =

      formatNumber(
        c.quantity,
        decimals
      )

      +

      " "

      +

      (
        c.quantityUnit ||
        ""
      );
  }


  else if (
    c.quantityUnit
  ) {

    quantity =
      c.quantityUnit;
  }


  const lines = [

    "Typ: " +
      (
        c.label ||
        "-"
      ),

    "IFC: " +
      (
        c.ifcType ||
        "-"
      ),

    "Produkt: " +
      (
        c.name ||
        "-"
      ),

    "Produkt-Typ: " +
      (
        c.productType ||
        c.objectType ||
        "-"
      ),

    "Fabrikat: " +
      (
        c.manufacturer ||
        "-"
      ),

    "Beschreibung: " +
      (
        c.description ||
        "-"
      ),

    "Layer: " +
      (
        c.layer ||
        "-"
      ),

    "Dimension: " +
      dimension,

    "System: " +
      (
        c.system ||
        "-"
      ),

    "Geschoss: " +
      (
        c.storey ||
        "-"
      ),

    "Länge: " +
      length,

    "Dämmung: " +
      insulation,

    "Volumenstrom: " +
      flow,

    "Geschwindigkeit: " +
      velocity,

    "Druckverlust: " +
      pressureLoss,

    "ζ: " +
      zeta,

    "Menge: " +
      quantity
  ];


  if (
    c.guid
  ) {

    lines.push(
      "IFC GUID: " +
      c.guid
    );
  }


  if (
    c.quantityNote
  ) {

    lines.push(
      "Hinweis: " +
      c.quantityNote
    );
  }


  if (
    c.matchedBy &&
    c.matchedBy.length
  ) {

    lines.push(
      "Erkennung: " +
      c.matchedBy
        .join(", ")
    );
  }


  if (
    list.length > 1
  ) {

    lines.push(
      "",
      "Ausgewählte Bauteile: " +
      list.length
    );
  }


  els.tgaBox.textContent =
    lines.join("\\n");
}


/* =========================================================
   PUSH TO SERVER
========================================================= */

async function push(
  force
) {

  if (
    !api ||
    !token ||
    pushing
  ) {

    return;
  }


  if (
    !dirty &&
    !force
  ) {

    return;
  }


  pushing = true;


  try {

    const state =
      await capture();


    const res =
      await fetch(
        PUSH_URL,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json",

            Authorization:
              "Bearer " +
              token
          },

          body:
            JSON.stringify(
              state
            )
        }
      );


    if (
      !res.ok
    ) {

      let detail =
        "";


      try {

        detail =
          (
            await res.json()
          ).error ||
          "";

      } catch {}


      throw new Error(
        "HTTP "
        +
        res.status
        +
        (
          detail
            ? " - " +
              detail
            : ""
        )
      );
    }


    const data =
      await res.json();


    renderTgaAnalysis(
      data.tgaAnalysis ||
      []
    );


    dirty =
      false;


    setText(
      els.sync,
      new Date()
        .toLocaleTimeString(
          "de-DE"
        ),
      "ok"
    );

  }


  catch (err) {

    setText(
      els.sync,
      "Fehler",
      "warn"
    );


    els.tgaBox.textContent =
      "TGA-Auswertung fehlgeschlagen:\\n"
      +
      String(err);
  }


  finally {

    pushing =
      false;
  }
}


/* =========================================================
   INITIALISIERUNG
========================================================= */

async function init() {

  try {

    api =
      await WorkspaceAPI.connect(
        window.parent,
        onEvent,
        30000
      );


    setText(
      els.conn,
      "verbunden",
      "ok"
    );

  }


  catch {

    setText(
      els.conn,
      "Fehler",
      "warn"
    );

    return;
  }


  try {

    project =
      await api.project
        .getCurrentProject();


    setText(
      els.project,
      project?.name ||
      project?.id ||
      "–"
    );

  } catch {}


  try {

    const result =
      await api.extension
        .requestPermission(
          "accesstoken"
        );


    const tok =
      normalizeToken(
        result
      );


    if (tok) {

      token =
        tok;


      setText(
        els.auth,
        "erteilt",
        "ok"
      );
    }


    else if (
      result ===
      "denied"
    ) {

      setText(
        els.auth,
        "verweigert",
        "warn"
      );
    }


    else {

      setText(
        els.auth,
        "warte…"
      );
    }

  }


  catch {

    setText(
      els.auth,
      "Fehler",
      "warn"
    );
  }


  els.btn.disabled =
    false;


  els.btn.addEventListener(
    "click",
    () =>
      push(true)
  );


  setInterval(
    () =>
      push(false),
    PUSH_INTERVAL_MS
  );


  setInterval(
    () => {
      dirty = true;
    },
    30000
  );
}


init();

</script>
</body>
</html>`;
}
