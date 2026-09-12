export type TgaComponentType =
  | "duct_segment"
  | "duct_fitting"
  | "fire_damper"
  | "volume_flow_controller"
  | "flow_controller_generic"
  | "grille"
  | "disc_valve"
  | "air_terminal"
  | "silencer"
  | "louver_damper"
  | "shutoff_damper"
  | "insulation"
  | "damper_generic"
  | "unknown";

export interface TgaAnalysis {
  type: TgaComponentType;
  label: string;

  ifcType?: string;
  predefinedType?: string;

  guid?: string;
  runtimeId?: number;

  name?: string;
  description?: string;
  objectType?: string;
  tag?: string;
  layer?: string;

  modelName?: string;
  system?: string;
  storey?: string;

  shape?: "rectangular" | "round";

  widthMm?: number;
  heightMm?: number;
  diameterMm?: number;
  lengthMm?: number;
  insulationMm?: number;

  airflowLs?: number;
  airflowM3h?: number;

  areaM2?: number;
  velocityMs?: number;

  pressureLossPa?: number;
  zeta?: number;

  quantityUnit?: "m" | "m²" | "St.";
  quantity?: number;
  quantityNote?: string;

  confidence: "high" | "medium" | "low";
  matchedBy: string[];

  rawProperties: Record<string, unknown>;
}


/* =========================================================
   NORMALISIERUNG
========================================================= */

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
}


function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}


/* =========================================================
   TRIMBLE PROPERTIES FLACH ZIEHEN
========================================================= */

function flattenProperties(
  value: unknown,
  prefix = "",
  out: Record<string, unknown> = {}
): Record<string, unknown> {

  if (value === null || value === undefined) {
    return out;
  }

  if (Array.isArray(value)) {

    value.forEach((item, index) => {
      flattenProperties(
        item,
        prefix ? `${prefix}.${index}` : String(index),
        out
      );
    });

    return out;
  }

  if (typeof value !== "object") {

    if (prefix) {
      out[prefix] = value;
    }

    return out;
  }

  const obj = value as Record<string, unknown>;


  /*
   * Trimble:
   * { name: "Geom-Side 1 (mm)", value: "250" }
   */
  if (
    typeof obj.name === "string" &&
    Object.prototype.hasOwnProperty.call(obj, "value") &&
    isPrimitive(obj.value)
  ) {

    const propertyName = String(obj.name).trim();

    if (propertyName) {

      if (
        !Object.prototype.hasOwnProperty.call(
          out,
          propertyName
        )
      ) {
        out[propertyName] = obj.value;
      }

      if (prefix) {
        out[`${prefix}.${propertyName}`] = obj.value;
      }
    }

    return out;
  }


  /*
   * Trimble Property Group:
   * Pset MEP usw.
   */
  if (
    typeof obj.name === "string" &&
    Array.isArray(obj.props)
  ) {

    const groupName = String(obj.name).trim();

    for (const prop of obj.props) {

      if (
        prop &&
        typeof prop === "object"
      ) {

        const p = prop as Record<string, unknown>;

        if (
          typeof p.name === "string" &&
          Object.prototype.hasOwnProperty.call(
            p,
            "value"
          )
        ) {

          const propertyName = String(p.name).trim();

          if (propertyName) {

            if (
              !Object.prototype.hasOwnProperty.call(
                out,
                propertyName
              )
            ) {
              out[propertyName] = p.value;
            }

            if (groupName) {
              out[
                `${groupName}.${propertyName}`
              ] = p.value;
            }
          }
        }
      }
    }
  }


  for (
    const [key, child]
    of Object.entries(obj)
  ) {

    if (
      key === "props" &&
      Array.isArray(child)
    ) {
      continue;
    }

    const path =
      prefix
        ? `${prefix}.${key}`
        : key;

    if (
      child !== null &&
      typeof child === "object"
    ) {

      flattenProperties(
        child,
        path,
        out
      );

    } else {

      out[path] = child;
    }
  }

  return out;
}


/* =========================================================
   PROPERTY LOOKUP
========================================================= */

function findValue(
  flat: Record<string, unknown>,
  aliases: string[]
): unknown {

  const entries = Object.entries(flat);


  /*
   * Exakter Name zuerst.
   */
  for (const alias of aliases) {

    const wanted = normalizeText(alias);

    const found =
      entries.find(([key]) => {

        const last =
          normalizeText(
            key.split(".").pop()
          );

        return last === wanted;
      });

    if (found) {
      return found[1];
    }
  }


  /*
   * Dann Pfad / Teiltreffer.
   */
  for (const alias of aliases) {

    const wanted = normalizeText(alias);

    const found =
      entries.find(([key]) =>
        normalizeText(key).includes(wanted)
      );

    if (found) {
      return found[1];
    }
  }

  return undefined;
}


function textValue(
  flat: Record<string, unknown>,
  aliases: string[]
): string | undefined {

  const value =
    findValue(flat, aliases);

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const text = String(value).trim();

  return text || undefined;
}


function numberValue(
  value: unknown
): number | undefined {

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return undefined;
  }

  let text = String(value).trim();

  if (!text) {
    return undefined;
  }

  text = text
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.+-]/g, "");

  const n =
    Number.parseFloat(text);

  return Number.isFinite(n)
    ? n
    : undefined;
}


function numberByAliases(
  flat: Record<string, unknown>,
  aliases: string[]
): number | undefined {

  return numberValue(
    findValue(flat, aliases)
  );
}


function searchableText(
  flat: Record<string, unknown>
): string {

  return normalizeText(
    Object.entries(flat)
      .map(
        ([key, value]) =>
          `${key} ${String(value ?? "")}`
      )
      .join(" ")
  );
}


function containsAny(
  text: string,
  words: string[]
): boolean {

  return words.some(
    word =>
      text.includes(
        normalizeText(word)
      )
  );
}


/* =========================================================
   ABMESSUNGEN
========================================================= */

function dimensionText(
  flat: Record<string, unknown>
): string | undefined {

  return textValue(
    flat,
    [
      "ConnectionSize_mm",
      "ConnectionSize",
      "Connection Size",
      "NominalSize",
      "Nominal Size",
      "DuctSize",
      "Duct Size",
      "Size",
      "Dimension",
      "Dimensions",
      "Abmessung",
      "Abmessungen",
      "Anschlussgroesse",
      "Anschlussgröße"
    ]
  );
}


function parseDimensions(
  flat: Record<string, unknown>
): {
  shape?: "rectangular" | "round";
  widthMm?: number;
  heightMm?: number;
  diameterMm?: number;
} {

  /*
   * Trimble Nova:
   * Geom-Side 1 / Geom-Side 2
   */
  let widthMm =
    numberByAliases(
      flat,
      [
        "Geom-Side 1 (mm)",
        "Geom-Side 1",
        "Width_mm",
        "Width",
        "Breite",
        "DuctWidth",
        "Duct Width",
        "b_mm"
      ]
    );


  let heightMm =
    numberByAliases(
      flat,
      [
        "Geom-Side 2 (mm)",
        "Geom-Side 2",
        "Height_mm",
        "Height",
        "Hoehe",
        "Höhe",
        "DuctHeight",
        "Duct Height",
        "h_mm"
      ]
    );


  let diameterMm =
    numberByAliases(
      flat,
      [
        "Geom-Diameter (mm)",
        "Geom-Diameter",
        "Diameter_mm",
        "Diameter",
        "Durchmesser",
        "NominalDiameter",
        "Nominal Diameter",
        "DN"
      ]
    );


  const raw =
    dimensionText(flat);


  if (raw) {

    const text =
      raw
        .replace(",", ".")
        .replace(/×/g, "x")
        .replace(/\//g, "x")
        .trim();


    const roundMatch =
      text.match(
        /(?:ø|⌀|dn\s*)\s*(\d+(?:\.\d+)?)/i
      );


    if (
      roundMatch &&
      diameterMm === undefined
    ) {
      diameterMm =
        Number(roundMatch[1]);
    }


    const rectangularMatch =
      text.match(
        /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/i
      );


    if (rectangularMatch) {

      if (widthMm === undefined) {
        widthMm =
          Number(rectangularMatch[1]);
      }

      if (heightMm === undefined) {
        heightMm =
          Number(rectangularMatch[2]);
      }
    }


    /*
     * Einzelwert = meistens Rundrohr.
     */
    if (
      !roundMatch &&
      !rectangularMatch &&
      diameterMm === undefined &&
      /^\s*\d+(?:\.\d+)?\s*$/.test(text)
    ) {

      const n = Number(text);

      if (
        n > 0 &&
        n <= 3000
      ) {
        diameterMm = n;
      }
    }
  }


  if (
    widthMm !== undefined &&
    heightMm !== undefined
  ) {

    return {
      shape: "rectangular",
      widthMm,
      heightMm
    };
  }


  if (
    diameterMm !== undefined
  ) {

    return {
      shape: "round",
      diameterMm
    };
  }


  return {
    widthMm,
    heightMm,
    diameterMm
  };
}


/* =========================================================
   TGA BAUTEILKLASSIFIZIERUNG
========================================================= */

function classify(
  flat: Record<string, unknown>
): {
  type: TgaComponentType;
  label: string;
  confidence: "high" | "medium" | "low";
  matchedBy: string[];
} {

  const text =
    searchableText(flat);


  const ifcType =
    normalizeText(
      textValue(
        flat,
        [
          "class",
          "Common Type",
          "CommonType",
          "ifcType",
          "IfcType",
          "entityType",
          "EntityType"
        ]
      )
    );


  const predefined =
    normalizeText(
      textValue(
        flat,
        [
          "PredefinedType",
          "predefinedType"
        ]
      )
    );


  const nameText =
    normalizeText(
      [
        textValue(flat, [
          "Product Name",
          "ProductName",
          "Name",
          "name"
        ]),
        textValue(flat, [
          "Product Description",
          "Description",
          "description"
        ]),
        textValue(flat, [
          "Product Object Type",
          "ObjectType",
          "objectType"
        ]),
        textValue(flat, [
          "Layer",
          "Presentation Layer",
          "PresentationLayer"
        ])
      ]
        .filter(Boolean)
        .join(" ")
    );


  const allText =
    `${text} ${nameText}`;


  const hit = (
    type: TgaComponentType,
    label: string,
    reason: string,
    confidence:
      "high" |
      "medium" |
      "low" = "high"
  ) => ({
    type,
    label,
    confidence,
    matchedBy: [reason]
  });


  /* =====================================================
     BSK / BRANDSCHUTZKLAPPE
  ===================================================== */

  if (
    containsAny(
      allText,
      [
        "brandschutzklappe",
        "brandschutz klappe",
        "brandklappe",
        "fire damper",
        "fire smoke damper",
        "firedamper",
        "firesmokedamper",
        "bsk",
        "fk90",
        "fr90",
        "f90 klappe",
        "e90 klappe"
      ]
    ) ||
    predefined.includes("firedamper") ||
    predefined.includes("firesmokedamper")
  ) {

    return hit(
      "fire_damper",
      "Brandschutzklappe (BSK)",
      "Brandschutzklappe / FireDamper erkannt"
    );
  }


  /* =====================================================
     VSR / VOLUMENSTROMREGLER
  ===================================================== */

  if (
    containsAny(
      allText,
      [
        "volumenstromregler",
        "volumenstrom regler",
        "volumenstrombegrenzer",
        "volumenstrom begrenzer",
        "luftmengenregler",
        "luftmengen regler",
        "volume flow controller",
        "air volume controller",
        "constant air volume",
        "variable air volume",
        "control damper",
        "balancing damper",
        "regulierklappe",
        "regelklappe",
        "vsr",
        "vav",
        "cav"
      ]
    )
  ) {

    return hit(
      "volume_flow_controller",
      "Volumenstromregler (VSR)",
      "Volumenstromregler erkannt"
    );
  }


  /* =====================================================
     SCHALLDÄMPFER
  ===================================================== */

  if (
    ifcType.includes("ductsilencer") ||
    containsAny(
      allText,
      [
        "schalldaempfer",
        "schalldämpfer",
        "kulissenschalldaempfer",
        "kulissenschalldämpfer",
        "rohrschalldaempfer",
        "rohrschalldämpfer",
        "duct silencer",
        "silencer",
        "sound attenuator",
        "attenuator"
      ]
    )
  ) {

    return hit(
      "silencer",
      "Schalldämpfer",
      "Schalldämpfer erkannt"
    );
  }


  /* =====================================================
     TELLERVENTIL
  ===================================================== */

  if (
    containsAny(
      allText,
      [
        "tellerventil",
        "tellerventile",
        "disc valve",
        "discvalve"
      ]
    )
  ) {

    return hit(
      "disc_valve",
      "Tellerventil",
      "Tellerventil erkannt"
    );
  }


  /* =====================================================
     GITTER
  ===================================================== */

  if (
    containsAny(
      allText,
      [
        "lueftungsgitter",
        "lüftungsgitter",
        "luftgitter",
        "schutzgitter",
        "wetterschutzgitter",
        "wsg",
        "air grille",
        "grille"
      ]
    )
  ) {

    return hit(
      "grille",
      "Lüftungsgitter",
      "Lüftungsgitter erkannt"
    );
  }


  /* =====================================================
     JALOUSIEKLAPPE
  ===================================================== */

  if (
    containsAny(
      allText,
      [
        "jalousieklappe",
        "jalousie klappe",
        "louvre damper",
        "louver damper",
        "louver",
        "jalousie"
      ]
    )
  ) {

    return hit(
      "louver_damper",
      "Jalousieklappe",
      "Jalousieklappe erkannt"
    );
  }


  /* =====================================================
     ABSPERRKLAPPE
  ===================================================== */

  if (
    containsAny(
      allText,
      [
        "absperrklappe",
        "absperr klappe",
        "shutoff damper",
        "shut off damper",
        "shut-off damper",
        "drosselklappe"
      ]
    )
  ) {

    return hit(
      "shutoff_damper",
      "Absperrklappe",
      "Absperrklappe erkannt"
    );
  }


  /* =====================================================
     ISOLIERUNG
  ===================================================== */

  if (
    ifcType.includes("covering") ||
    containsAny(
      allText,
      [
        "isolierung",
        "daemmung",
        "dämmung",
        "waermedaemmung",
        "wärmedämmung",
        "kaeltedaemmung",
        "kältedämmung",
        "insulation",
        "duct insulation",
        "armaflex",
        "kaiflex",
        "k flex"
      ]
    )
  ) {

    return hit(
      "insulation",
      "Lüftungsdämmung / Isolierung",
      "Dämmung erkannt",
      ifcType.includes("covering")
        ? "high"
        : "medium"
    );
  }


  /* =====================================================
     LUFTAUSLASS
  ===================================================== */

  if (
    ifcType.includes("airterminal") ||
    containsAny(
      allText,
      [
        "luftauslass",
        "luft auslass",
        "auslass",
        "drallauslass",
        "schlitzauslass",
        "deckenauslass",
        "bodenauslass",
        "quellauslass",
        "air terminal",
        "airterminal",
        "diffuser"
      ]
    )
  ) {

    return hit(
      "air_terminal",
      "Luftauslass",
      "Luftauslass erkannt",
      ifcType.includes("airterminal")
        ? "high"
        : "medium"
    );
  }


  /* =====================================================
     KANALFORMTEIL
  ===================================================== */

  if (
    ifcType.includes("ductfitting") ||
    containsAny(
      allText,
      [
        "duct fitting",
        "kanalformteil",
        "formteil",
        "bogen",
        "rohrbogen",
        "kanalbogen",
        "abzweig",
        "t stueck",
        "t stück",
        "t piece",
        "uebergang",
        "übergang",
        "reduktion",
        "reduction",
        "transition",
        "bend",
        "junction",
        "elbow",
        "hosenstueck",
        "hosenstück",
        "bundkragen",
        "stutzen"
      ]
    )
  ) {

    return hit(
      "duct_fitting",
      "Lüftungsformteil",
      "Kanal-/Rohrformteil erkannt",
      ifcType.includes("ductfitting")
        ? "high"
        : "medium"
    );
  }


  /* =====================================================
     KANAL / ROHR
  ===================================================== */

  if (
    ifcType.includes("ductsegment") ||
    containsAny(
      allText,
      [
        "duct segment",
        "luftkanal",
        "lueftungskanal",
        "lüftungskanal",
        "rechteckkanal",
        "rechteck kanal",
        "lueftungsrohr",
        "lüftungsrohr",
        "wickelfalz",
        "wickelfalzrohr",
        "spiral duct",
        "spirorohr"
      ]
    )
  ) {

    return hit(
      "duct_segment",
      "Lüftungskanal / Lüftungsrohr",
      "Lüftungskanal / Rohr erkannt",
      ifcType.includes("ductsegment")
        ? "high"
        : "medium"
    );
  }


  /* =====================================================
     SONSTIGE KLAPPE
  ===================================================== */

  if (
    containsAny(
      allText,
      [
        "klappe",
        "damper"
      ]
    )
  ) {

    return hit(
      "damper_generic",
      "Lüftungsklappe",
      "Allgemeine Lüftungsklappe erkannt",
      "medium"
    );
  }


  /* =====================================================
     IFCFLOWCONTROLLER FALLBACK

     Nova exportiert BSK/VSR/andere Regler häufig nur
     als IFCFLOWCONTROLLER.

     Wenn kein Name zur eindeutigen Zuordnung vorhanden ist,
     zeigen wir wenigstens korrekt:
     "Luftstrom-Regelbauteil"
  ===================================================== */

  if (
    ifcType.includes("flowcontroller")
  ) {

    return hit(
      "flow_controller_generic",
      "Luftstrom-Regelbauteil",
      "IFCFLOWCONTROLLER erkannt; Untertyp nicht eindeutig",
      "low"
    );
  }


  return {
    type: "unknown",
    label: "Nicht eindeutig erkannt",
    confidence: "low",
    matchedBy: []
  };
}


/* =========================================================
   OBJECT ANALYSIS
========================================================= */

export function analyzeTgaObject(
  input: unknown
): TgaAnalysis {

  const flat =
    flattenProperties(input);


  const classification =
    classify(flat);


  const dimensions =
    parseDimensions(flat);


  const ifcType =
    textValue(
      flat,
      [
        "class",
        "Common Type",
        "CommonType",
        "ifcType",
        "IfcType",
        "EntityType",
        "entityType"
      ]
    );


  const predefinedType =
    textValue(
      flat,
      [
        "PredefinedType",
        "predefinedType"
      ]
    );


  const guid =
    textValue(
      flat,
      [
        "GUID (IFC)",
        "GUID IFC",
        "externalId",
        "GlobalId",
        "globalId",
        "GUID",
        "guid",
        "IfcGuid",
        "ObjectId",
        "objectId"
      ]
    );


  const runtimeId =
    numberByAliases(
      flat,
      [
        "runtimeId",
        "RuntimeId"
      ]
    );


  const name =
    textValue(
      flat,
      [
        "Product Name",
        "ProductName",
        "Name",
        "name",
        "ObjectName"
      ]
    );


  const description =
    textValue(
      flat,
      [
        "Product Description",
        "Description",
        "description"
      ]
    );


  const objectType =
    textValue(
      flat,
      [
        "Product Object Type",
        "ObjectType",
        "objectType"
      ]
    );


  const tag =
    textValue(
      flat,
      [
        "Tag",
        "tag",
        "Kennzeichen",
        "Bauteilkennzeichen"
      ]
    );


  const layer =
    textValue(
      flat,
      [
        "Layer",
        "Presentation Layer",
        "PresentationLayer"
      ]
    );


  const modelName =
    textValue(
      flat,
      [
        "modelName",
        "ModelName",
        "File Name"
      ]
    );


  const system =
    textValue(
      flat,
      [
        "Tech-Medium",
        "Tech Medium",
        "System",
        "SystemName",
        "System Name",
        "system",
        "DistributionSystem",
        "SystemClassification",
        "System Classification",
        "Systemtyp",
        "System Type",
        "Anlage",
        "Anlagenkennzeichen",
        "MagiCADSystem",
        "MagiCAD System"
      ]
    );


  const storey =
    textValue(
      flat,
      [
        "Storey",
        "BuildingStorey",
        "Building Storey",
        "Geschoss",
        "Etage",
        "Floor",
        "Level",
        "ReferenceLevel",
        "Reference Level"
      ]
    );


  const lengthMm =
    numberByAliases(
      flat,
      [
        "Geom-Length (mm)",
        "Geom-Length",
        "Length_mm",
        "Length mm",
        "Laenge_mm",
        "Länge_mm",
        "DuctLength_mm",
        "Duct Length mm"
      ]
    )
    ??
    numberByAliases(
      flat,
      [
        "Length",
        "Laenge",
        "Länge"
      ]
    );


  const insulationMm =
    numberByAliases(
      flat,
      [
        "Insulation_thickness_mm",
        "InsulationThickness",
        "Insulation Thickness",
        "Insulation_mm",
        "Daemmstaerke",
        "Dämmstärke",
        "Daemmung_mm",
        "Dämmung_mm",
        "Dämmstoffdicke"
      ]
    );


  let airflowLs =
    numberByAliases(
      flat,
      [
        "qv_SizingFlow_ls",
        "SizingFlow_ls",
        "AirFlow_ls",
        "Airflow_l_s",
        "Flow_l_s",
        "Volumenstrom_l_s",
        "Volumenstrom_ls",
        "DesignFlow_ls",
        "VolumeFlow_ls",
        "Volume Flow l/s",
        "Calc-Volume flow (l/s)",
        "Calc-Air flow (l/s)"
      ]
    );


  let airflowM3h =
    numberByAliases(
      flat,
      [
        "qv_SizingFlow_m3h",
        "SizingFlow_m3h",
        "AirFlow_m3h",
        "Airflow_m3_h",
        "Flow_m3h",
        "Volumenstrom_m3h",
        "Volumenstrom_m3_h",
        "DesignFlow_m3h",
        "VolumeFlow_m3h",
        "Volume Flow m3/h",
        "Calc-Volume flow (m3/h)",
        "Calc-Air flow (m3/h)"
      ]
    );


  if (
    airflowLs !== undefined &&
    airflowM3h === undefined
  ) {

    airflowM3h =
      airflowLs * 3.6;
  }


  if (
    airflowM3h !== undefined &&
    airflowLs === undefined
  ) {

    airflowLs =
      airflowM3h / 3.6;
  }


  const pressureLossPa =
    numberByAliases(
      flat,
      [
        "Calc-Pressure loss (Pa)",
        "Calc-Pressure Loss (Pa)",
        "Pressure loss (Pa)",
        "Pressure Loss (Pa)",
        "PressureLoss",
        "Pressure Loss",
        "Druckverlust",
        "Druckverlust (Pa)"
      ]
    );


  const zeta =
    numberByAliases(
      flat,
      [
        "Calc-Zeta",
        "Zeta",
        "ζ",
        "Zeta Value"
      ]
    );


  let areaM2:
    number |
    undefined;


  if (
    dimensions.shape === "rectangular" &&
    dimensions.widthMm !== undefined &&
    dimensions.heightMm !== undefined
  ) {

    areaM2 =
      (
        dimensions.widthMm /
        1000
      )
      *
      (
        dimensions.heightMm /
        1000
      );
  }


  if (
    dimensions.shape === "round" &&
    dimensions.diameterMm !== undefined
  ) {

    const diameterM =
      dimensions.diameterMm /
      1000;


    areaM2 =
      Math.PI
      *
      diameterM
      *
      diameterM
      /
      4;
  }


  let velocityMs:
    number |
    undefined;


  if (
    areaM2 !== undefined &&
    areaM2 > 0 &&
    airflowLs !== undefined
  ) {

    velocityMs =
      (
        airflowLs /
        1000
      )
      /
      areaM2;
  }


  let quantityUnit:
    "m" |
    "m²" |
    "St." |
    undefined;


  let quantity:
    number |
    undefined;


  let quantityNote:
    string |
    undefined;


  switch (
    classification.type
  ) {


    case "duct_segment":

      if (
        dimensions.shape === "rectangular" &&
        lengthMm !== undefined &&
        dimensions.widthMm !== undefined &&
        dimensions.heightMm !== undefined
      ) {

        quantityUnit =
          "m²";


        quantity =
          2
          *
          (
            dimensions.widthMm /
            1000
            +
            dimensions.heightMm /
            1000
          )
          *
          (
            lengthMm /
            1000
          );


        quantityNote =
          "Rechteckkanal: äußere Oberfläche 2 × (B + H) × L.";
      }


      else if (
        dimensions.shape === "round" &&
        lengthMm !== undefined
      ) {

        quantityUnit =
          "m";


        quantity =
          lengthMm /
          1000;


        quantityNote =
          "Rundrohr: Abrechnung nach Länge.";
      }

      break;


    case "duct_fitting":

      if (
        dimensions.shape === "round"
      ) {

        quantityUnit =
          "St.";

        quantity =
          1;

        quantityNote =
          "Rund-Rohrformteil: Stück; LV-Zuordnung nach Formteilart und Nennweite.";
      }


      else {

        quantityUnit =
          "m²";

        quantityNote =
          "Rechteck-Kanalformteil: Abrechnung nach äußerer Oberfläche.";
      }

      break;


    case "insulation":

      quantityUnit =
        "m²";

      quantityNote =
        "Dämmung / Isolierung: Abrechnung in m².";

      break;


    case "fire_damper":
    case "volume_flow_controller":
    case "flow_controller_generic":
    case "grille":
    case "disc_valve":
    case "air_terminal":
    case "silencer":
    case "louver_damper":
    case "shutoff_damper":
    case "damper_generic":

      quantityUnit =
        "St.";

      quantity =
        1;

      quantityNote =
        "Bauteil: Stück.";

      break;
  }


  return {

    type:
      classification.type,

    label:
      classification.label,

    ifcType,

    predefinedType,

    guid,

    runtimeId,

    name,

    description,

    objectType,

    tag,

    layer,

    modelName,

    system,

    storey,

    ...dimensions,

    lengthMm,

    insulationMm,

    airflowLs,

    airflowM3h,

    areaM2,

    velocityMs,

    pressureLossPa,

    zeta,

    quantityUnit,

    quantity,

    quantityNote,

    confidence:
      classification.confidence,

    matchedBy:
      classification.matchedBy,

    rawProperties:
      flat
  };
}


/* =========================================================
   SELECTION ANALYSIS
========================================================= */

export function analyzeTgaSelection(
  selection: unknown[]
): TgaAnalysis[] {

  const result:
    TgaAnalysis[] = [];


  for (
    const entryValue
    of selection || []
  ) {

    if (
      entryValue &&
      typeof entryValue === "object"
    ) {

      const entry =
        entryValue as
        Record<string, unknown>;


      const properties =
        Array.isArray(
          entry.properties
        )
          ? entry.properties
          : [];


      if (
        properties.length > 0
      ) {

        for (
          const objectProperties
          of properties
        ) {

          const merged = {

            modelId:
              entry.modelId,

            modelName:
              entry.modelName,

            ...(
              objectProperties &&
              typeof objectProperties === "object"
                ? objectProperties as
                    Record<string, unknown>
                : {}
            )
          };


          result.push(
            analyzeTgaObject(
              merged
            )
          );
        }


        continue;
      }
    }


    result.push(
      analyzeTgaObject(
        entryValue
      )
    );
  }


  return result;
}
