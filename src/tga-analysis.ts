export type TgaComponentType =
  | "duct_segment"
  | "duct_fitting"
  | "fire_damper"
  | "volume_flow_controller"
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
  tag?: string;

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

  quantityUnit?: "m" | "m²" | "St.";
  quantity?: number;
  quantityNote?: string;

  confidence: "high" | "medium" | "low";
  matchedBy: string[];

  rawProperties: Record<string, unknown>;
}


/* =========================================================
   PROPERTY NORMALISATION
========================================================= */

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
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


/**
 * Converts Trimble object properties into a searchable flat dictionary.
 *
 * Important:
 *
 * Trimble often supplies properties like:
 *
 * {
 *   name: "ConnectionSize_mm",
 *   value: "500/300"
 * }
 *
 * This function creates:
 *
 * ConnectionSize_mm = "500/300"
 *
 * instead of only:
 *
 * propertySets.0.props.0.name
 * propertySets.0.props.0.value
 */
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
        prefix
          ? `${prefix}.${index}`
          : String(index),
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


  const obj =
    value as Record<string, unknown>;


  /*
   * Standard Trimble property pair:
   *
   * { name: "...", value: "..." }
   */
  if (
    typeof obj.name === "string" &&
    Object.prototype.hasOwnProperty.call(obj, "value") &&
    isPrimitive(obj.value)
  ) {

    const propertyName =
      String(obj.name).trim();

    if (propertyName) {

      /*
       * Plain property name.
       *
       * First occurrence wins because several property sets
       * can contain fields with the same name.
       */
      if (
        !Object.prototype.hasOwnProperty.call(
          out,
          propertyName
        )
      ) {
        out[propertyName] =
          obj.value;
      }


      /*
       * Also retain its full hierarchical path.
       */
      if (prefix) {

        out[
          `${prefix}.${propertyName}`
        ] = obj.value;
      }
    }

    return out;
  }


  /*
   * Property group:
   *
   * {
   *   name: "MagiCAD",
   *   props: [...]
   * }
   */
  if (
    typeof obj.name === "string" &&
    Array.isArray(obj.props)
  ) {

    const groupName =
      String(obj.name).trim();

    for (const prop of obj.props) {

      if (
        prop &&
        typeof prop === "object"
      ) {

        const p =
          prop as Record<string, unknown>;

        if (
          typeof p.name === "string" &&
          Object.prototype.hasOwnProperty.call(
            p,
            "value"
          )
        ) {

          const propertyName =
            String(p.name).trim();

          if (propertyName) {

            if (
              !Object.prototype.hasOwnProperty.call(
                out,
                propertyName
              )
            ) {
              out[propertyName] =
                p.value;
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


  /*
   * Continue recursively through the remaining object.
   */
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

      out[path] =
        child;
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

  const entries =
    Object.entries(flat);


  /*
   * Exact property-name match first.
   */
  for (const alias of aliases) {

    const wanted =
      normalizeText(alias);


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
   * Then full-path partial match.
   */
  for (const alias of aliases) {

    const wanted =
      normalizeText(alias);


    const found =
      entries.find(([key]) =>
        normalizeText(key)
          .includes(wanted)
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
    findValue(
      flat,
      aliases
    );


  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }


  const text =
    String(value).trim();


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


  let text =
    String(value).trim();


  if (!text) {
    return undefined;
  }


  text =
    text
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
    findValue(
      flat,
      aliases
    )
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
    (word) =>
      text.includes(
        normalizeText(word)
      )
  );
}


/* =========================================================
   DIMENSIONS
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

  let widthMm =
    numberByAliases(
      flat,
      [
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

    let text =
      raw
        .replace(",", ".")
        .replace(/×/g, "x")
        .replace(/\//g, "x")
        .trim();


    /*
     * Round:
     * Ø200
     * ø200
     * DN200
     */
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


    /*
     * Rectangular:
     * 500x300
     * 500/300
     * 500 × 300
     */
    const rectangularMatch =
      text.match(
        /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/i
      );


    if (rectangularMatch) {

      if (
        widthMm === undefined
      ) {

        widthMm =
          Number(
            rectangularMatch[1]
          );
      }


      if (
        heightMm === undefined
      ) {

        heightMm =
          Number(
            rectangularMatch[2]
          );
      }
    }


    /*
     * Plain value such as:
     *
     * 200
     *
     * usually represents a round connection.
     */
    if (
      !roundMatch &&
      !rectangularMatch &&
      diameterMm === undefined &&
      /^\s*\d+(?:\.\d+)?\s*$/
        .test(text)
    ) {

      const n =
        Number(text);


      if (
        n > 0 &&
        n <= 3000
      ) {

        diameterMm =
          n;
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
   TGA CLASSIFICATION
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


  const hit = (
    type: TgaComponentType,
    label: string,
    reason: string,
    confidence:
      "high" |
      "medium" |
      "low" = "high"
  ) => {

    return {
      type,
      label,
      confidence,
      matchedBy: [reason]
    };
  };


  /* Brandschutzklappe */

  if (
    containsAny(
      text,
      [
        "brandschutzklappe",
        "brandklappe",
        "fire damper",
        "firedamper",
        "firesmokedamper",
        "bsk"
      ]
    ) ||
    predefined.includes(
      "firedamper"
    ) ||
    predefined.includes(
      "firesmokedamper"
    )
  ) {

    return hit(
      "fire_damper",
      "Brandschutzklappe (BSK)",
      "BSK / FireDamper erkannt"
    );
  }


  /* Volumenstromregler */

  if (
    containsAny(
      text,
      [
        "volumenstromregler",
        "volumenstrombegrenzer",
        "constant air volume",
        "variable air volume",
        "controldamper",
        "balancingdamper",
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


  /* Schalldämpfer */

  if (
    ifcType.includes(
      "ifcductsilencer"
    ) ||
    containsAny(
      text,
      [
        "schalldaempfer",
        "schalldämpfer",
        "ductsilencer",
        "silencer",
        "sound attenuator",
        "attenuator"
      ]
    )
  ) {

    return hit(
      "silencer",
      "Schalldämpfer",
      "IfcDuctSilencer / Schalldämpfer erkannt"
    );
  }


  /* Tellerventil */

  if (
    containsAny(
      text,
      [
        "tellerventil",
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


  /* Gitter */

  if (
    containsAny(
      text,
      [
        "lueftungsgitter",
        "lüftungsgitter",
        "luftgitter",
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


  /* Jalousieklappe */

  if (
    containsAny(
      text,
      [
        "jalousieklappe",
        "louvre damper",
        "louver damper",
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


  /* Absperrklappe */

  if (
    containsAny(
      text,
      [
        "absperrklappe",
        "shutoff damper",
        "shut-off damper",
        "shut off damper"
      ]
    )
  ) {

    return hit(
      "shutoff_damper",
      "Absperrklappe",
      "Absperrklappe erkannt"
    );
  }


  /* Isolierung */

  if (
    ifcType.includes(
      "ifccovering"
    ) ||
    containsAny(
      text,
      [
        "isolierung",
        "daemmung",
        "dämmung",
        "insulation",
        "duct insulation"
      ]
    )
  ) {

    return hit(
      "insulation",
      "Lüftungsdämmung / Isolierung",
      "IfcCovering / Dämmung erkannt",
      ifcType.includes(
        "ifccovering"
      )
        ? "high"
        : "medium"
    );
  }


  /* sonstige Klappe */

  if (
    ifcType.includes(
      "ifcdamper"
    ) ||
    containsAny(
      text,
      [
        "damper",
        "klappe"
      ]
    )
  ) {

    return hit(
      "damper_generic",
      "Lüftungsklappe",
      "IfcDamper / Klappe erkannt",
      "medium"
    );
  }


  /* Luftauslass */

  if (
    ifcType.includes(
      "ifcairterminal"
    ) ||
    containsAny(
      text,
      [
        "luftauslass",
        "auslass",
        "air terminal",
        "airterminal",
        "diffuser",
        "drallauslass",
        "schlitzauslass"
      ]
    )
  ) {

    return hit(
      "air_terminal",
      "Luftauslass",
      "IfcAirTerminal / Luftauslass erkannt",
      ifcType.includes(
        "ifcairterminal"
      )
        ? "high"
        : "medium"
    );
  }


  /* Kanalformteil */

  if (
    ifcType.includes(
      "ifcductfitting"
    ) ||
    containsAny(
      text,
      [
        "duct fitting",
        "kanalformteil",
        "formteil",
        "bogen",
        "abzweig",
        "t-stueck",
        "t-stück",
        "uebergang",
        "übergang",
        "reduction",
        "transition",
        "bend",
        "junction",
        "elbow"
      ]
    )
  ) {

    return hit(
      "duct_fitting",
      "Lüftungsformteil",
      "IfcDuctFitting / Formteil erkannt",
      ifcType.includes(
        "ifcductfitting"
      )
        ? "high"
        : "medium"
    );
  }


  /* Kanal */

  if (
    ifcType.includes(
      "ifcductsegment"
    ) ||
    containsAny(
      text,
      [
        "duct segment",
        "kanal",
        "luftkanal",
        "lueftungskanal",
        "lüftungskanal",
        "lueftungsrohr",
        "lüftungsrohr",
        "wickelfalz",
        "spiral duct"
      ]
    )
  ) {

    return hit(
      "duct_segment",
      "Lüftungskanal / Lüftungsrohr",
      "IfcDuctSegment / Kanal erkannt",
      ifcType.includes(
        "ifcductsegment"
      )
        ? "high"
        : "medium"
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
        "name",
        "Name",
        "ObjectName",
        "ProductName"
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


  const modelName =
    textValue(
      flat,
      [
        "modelName",
        "ModelName"
      ]
    );


  const system =
    textValue(
      flat,
      [
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
        "storey",
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
        "DesignFlow_ls"
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
        "DesignFlow_m3h"
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


  let areaM2:
    number |
    undefined;


  if (
    dimensions.shape ===
      "rectangular" &&
    dimensions.widthMm !==
      undefined &&
    dimensions.heightMm !==
      undefined
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
    dimensions.diameterMm !==
      undefined
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
        dimensions.shape ===
          "rectangular" &&
        lengthMm !== undefined &&
        dimensions.widthMm !==
          undefined &&
        dimensions.heightMm !==
          undefined
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
        dimensions.shape ===
          "round" &&
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
        dimensions.shape ===
          "round"
      ) {

        quantityUnit =
          "St.";


        quantity =
          1;


        quantityNote =
          "Rund-Rohrformteil: Stück; genaue LV-Zuordnung nach Formteilart und Nennweite.";
      }


      else {

        quantityUnit =
          "m²";


        quantityNote =
          "Rechteck-Kanalformteil: Abrechnung nach äußerer Oberfläche; exakte Menge benötigt Formteilgeometrie.";
      }

      break;


    case "insulation":

      quantityUnit =
        "m²";


      quantityNote =
        "Dämmung/Isolierung: m²; genaue Fläche abhängig von Abmessung und Länge des gedämmten Bauteils.";

      break;


    case "fire_damper":
    case "volume_flow_controller":
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

    tag,

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

/**
 * A ViewerSelectionEntry can contain several selected IFC objects:
 *
 * {
 *   modelId,
 *   objectRuntimeIds: [...],
 *   properties: [
 *     { runtimeId, class, name, propertySets... },
 *     ...
 *   ]
 * }
 *
 * Analyse every actual object individually.
 */
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
      typeof entryValue ===
        "object"
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


      /*
       * Normal path:
       * one analysis per selected IFC object.
       */
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
              typeof objectProperties ===
                "object"
                ? objectProperties as
                    Record<
                      string,
                      unknown
                    >
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


    /*
     * Fallback if an entry does not contain detailed
     * getObjectProperties data.
     */
    result.push(
      analyzeTgaObject(
        entryValue
      )
    );
  }


  return result;
}
