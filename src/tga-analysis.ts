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
  name?: string;
  tag?: string;
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

function flatten(
  value: unknown,
  prefix = "",
  out: Record<string, unknown> = {}
): Record<string, unknown> {
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      flatten(item, prefix ? `${prefix}.${index}` : String(index), out)
    );
    return out;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (
        child !== null &&
        typeof child === "object"
      ) {
        flatten(child, path, out);
      } else {
        out[path] = child;
      }
    }
    return out;
  }

  if (prefix) out[prefix] = value;
  return out;
}

function normaliseText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function searchableText(flat: Record<string, unknown>): string {
  return Object.entries(flat)
    .map(([key, value]) => `${key} ${String(value ?? "")}`)
    .join(" ")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function findValue(
  flat: Record<string, unknown>,
  aliases: string[]
): unknown {
  const entries = Object.entries(flat);

  for (const alias of aliases) {
    const a = normaliseText(alias);

    const exact = entries.find(([key]) => {
      const last = normaliseText(key.split(".").pop());
      return last === a;
    });

    if (exact) return exact[1];
  }

  for (const alias of aliases) {
    const a = normaliseText(alias);

    const partial = entries.find(([key]) =>
      normaliseText(key).includes(a)
    );

    if (partial) return partial[1];
  }

  return undefined;
}

function textValue(
  flat: Record<string, unknown>,
  aliases: string[]
): string | undefined {
  const value = findValue(flat, aliases);
  if (value === undefined || value === null) return undefined;

  const text = String(value).trim();
  return text || undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return undefined;

  let text = String(value).trim();
  if (!text) return undefined;

  text = text
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.+-]/g, "");

  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : undefined;
}

function numberByAliases(
  flat: Record<string, unknown>,
  aliases: string[]
): number | undefined {
  return numberValue(findValue(flat, aliases));
}

function containsAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(normaliseText(word)));
}

function extractDimensionText(
  flat: Record<string, unknown>
): string | undefined {
  return textValue(flat, [
    "ConnectionSize_mm",
    "ConnectionSize",
    "NominalSize",
    "Dimension",
    "Dimensions",
    "Size",
    "Abmessung",
    "Anschlussgroesse",
    "Anschlussgröße"
  ]);
}

function parseDimensions(
  flat: Record<string, unknown>
): {
  shape?: "rectangular" | "round";
  widthMm?: number;
  heightMm?: number;
  diameterMm?: number;
} {
  let widthMm = numberByAliases(flat, [
    "Width_mm",
    "Width",
    "Breite",
    "b_mm"
  ]);

  let heightMm = numberByAliases(flat, [
    "Height_mm",
    "Height",
    "Hoehe",
    "Höhe",
    "h_mm"
  ]);

  let diameterMm = numberByAliases(flat, [
    "Diameter_mm",
    "Diameter",
    "Durchmesser",
    "NominalDiameter",
    "DN"
  ]);

  const dimension = extractDimensionText(flat);

  if (dimension) {
    const s = dimension
      .replace(",", ".")
      .replace(/×/g, "x")
      .replace(/\//g, "x")
      .trim();

    const roundMatch = s.match(
      /(?:ø|⌀|dn\s*)\s*(\d+(?:\.\d+)?)/i
    );

    if (roundMatch && diameterMm === undefined) {
      diameterMm = Number(roundMatch[1]);
    }

    const rectMatch = s.match(
      /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/i
    );

    if (rectMatch) {
      if (widthMm === undefined) widthMm = Number(rectMatch[1]);
      if (heightMm === undefined) heightMm = Number(rectMatch[2]);
    }

    if (
      !roundMatch &&
      diameterMm === undefined &&
      /^\s*\d+(?:\.\d+)?\s*$/.test(s)
    ) {
      const n = Number(s);
      if (n > 0 && n <= 2000) diameterMm = n;
    }
  }

  if (widthMm && heightMm) {
    return {
      shape: "rectangular",
      widthMm,
      heightMm
    };
  }

  if (diameterMm) {
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

function classify(
  flat: Record<string, unknown>
): {
  type: TgaComponentType;
  label: string;
  confidence: "high" | "medium" | "low";
  matchedBy: string[];
} {
  const text = searchableText(flat);

  const ifcType =
    normaliseText(
      textValue(flat, [
        "ifcType",
        "IfcType",
        "entityType",
        "type"
      ])
    );

  const predefined =
    normaliseText(
      textValue(flat, [
        "PredefinedType",
        "predefinedType"
      ])
    );

  const matchedBy: string[] = [];

  const hit = (
    type: TgaComponentType,
    label: string,
    reason: string,
    confidence: "high" | "medium" | "low" = "high"
  ) => {
    matchedBy.push(reason);
    return { type, label, confidence, matchedBy };
  };

  // Brandschutzklappe
  if (
    containsAny(text, [
      "brandschutzklappe",
      "bsk",
      "fire damper",
      "firedamper",
      "firesmokedamper"
    ]) ||
    predefined.includes("firedamper") ||
    predefined.includes("firesmokedamper")
  ) {
    return hit(
      "fire_damper",
      "Brandschutzklappe (BSK)",
      "BSK / FireDamper erkannt"
    );
  }

  // Volumenstromregler
  if (
    containsAny(text, [
      "volumenstromregler",
      "volumenstrombegrenzer",
      "vsr",
      "vav",
      "constant air volume",
      "variable air volume",
      "controldamper",
      "balancingdamper"
    ])
  ) {
    return hit(
      "volume_flow_controller",
      "Volumenstromregler (VSR)",
      "VSR / Volumenstromregler erkannt"
    );
  }

  // Schalldämpfer
  if (
    ifcType.includes("ifcductsilencer") ||
    containsAny(text, [
      "schalldaempfer",
      "schalldämpfer",
      "silencer",
      "sound attenuator"
    ])
  ) {
    return hit(
      "silencer",
      "Schalldämpfer",
      "IfcDuctSilencer / Schalldämpfer erkannt"
    );
  }

  // Isolierung
  if (
    ifcType.includes("ifccovering") ||
    containsAny(text, [
      "isolierung",
      "daemmung",
      "dämmung",
      "insulation",
      "duct insulation"
    ])
  ) {
    return hit(
      "insulation",
      "Lüftungsdämmung / Isolierung",
      "IfcCovering / Dämmung erkannt",
      ifcType.includes("ifccovering") ? "high" : "medium"
    );
  }

  // Tellerventil
  if (
    containsAny(text, [
      "tellerventil",
      "disc valve",
      "discvalve"
    ])
  ) {
    return hit(
      "disc_valve",
      "Tellerventil",
      "Tellerventil erkannt"
    );
  }

  // Gitter
  if (
    containsAny(text, [
      "lueftungsgitter",
      "lüftungsgitter",
      "luftgitter",
      "grille",
      "grill"
    ])
  ) {
    return hit(
      "grille",
      "Lüftungsgitter",
      "Gitter erkannt"
    );
  }

  // Jalousieklappe
  if (
    containsAny(text, [
      "jalousieklappe",
      "louvre damper",
      "louver damper",
      "jalousie"
    ])
  ) {
    return hit(
      "louver_damper",
      "Jalousieklappe",
      "Jalousieklappe erkannt"
    );
  }

  // Absperrklappe
  if (
    containsAny(text, [
      "absperrklappe",
      "shutoff damper",
      "shut-off damper",
      "shut off damper"
    ])
  ) {
    return hit(
      "shutoff_damper",
      "Absperrklappe",
      "Absperrklappe erkannt"
    );
  }

  // Sonstige Klappe
  if (
    ifcType.includes("ifcdamper") ||
    containsAny(text, ["damper", "klappe"])
  ) {
    return hit(
      "damper_generic",
      "Lüftungsklappe",
      "IfcDamper / Klappe erkannt",
      "medium"
    );
  }

  // Luftauslass
  if (
    ifcType.includes("ifcairterminal") ||
    containsAny(text, [
      "luftauslass",
      "auslass",
      "air terminal",
      "airterminal",
      "diffuser",
      "drallauslass",
      "schlitzauslass"
    ])
  ) {
    return hit(
      "air_terminal",
      "Luftauslass",
      "IfcAirTerminal / Luftauslass erkannt",
      ifcType.includes("ifcairterminal") ? "high" : "medium"
    );
  }

  // Kanalformteil
  if (
    ifcType.includes("ifcductfitting") ||
    containsAny(text, [
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
      "junction"
    ])
  ) {
    return hit(
      "duct_fitting",
      "Lüftungsformteil",
      "IfcDuctFitting / Formteil erkannt",
      ifcType.includes("ifcductfitting") ? "high" : "medium"
    );
  }

  // Kanal / Rohr
  if (
    ifcType.includes("ifcductsegment") ||
    containsAny(text, [
      "duct segment",
      "kanal",
      "luftkanal",
      "lueftungskanal",
      "lüftungskanal",
      "lueftungsrohr",
      "lüftungsrohr",
      "wickelfalz",
      "spiral duct"
    ])
  ) {
    return hit(
      "duct_segment",
      "Lüftungskanal / Lüftungsrohr",
      "IfcDuctSegment / Kanal erkannt",
      ifcType.includes("ifcductsegment") ? "high" : "medium"
    );
  }

  return {
    type: "unknown",
    label: "Nicht eindeutig erkannt",
    confidence: "low",
    matchedBy: []
  };
}

export function analyzeTgaObject(input: unknown): TgaAnalysis {
  const flat = flatten(input);
  const classification = classify(flat);
  const dimensions = parseDimensions(flat);

  const ifcType = textValue(flat, [
    "ifcType",
    "IfcType",
    "entityType"
  ]);

  const predefinedType = textValue(flat, [
    "PredefinedType",
    "predefinedType"
  ]);

  const guid = textValue(flat, [
    "globalId",
    "GlobalId",
    "guid",
    "GUID",
    "objectId"
  ]);

  const name = textValue(flat, [
    "Name",
    "name",
    "ObjectName"
  ]);

  const tag = textValue(flat, [
    "Tag",
    "tag"
  ]);

  const system = textValue(flat, [
    "System",
    "system",
    "SystemName",
    "DistributionSystem",
    "Anlagenkennzeichen"
  ]);

  const storey = textValue(flat, [
    "Storey",
    "storey",
    "BuildingStorey",
    "Geschoss",
    "Floor"
  ]);

  const lengthMm = numberByAliases(flat, [
    "Length_mm",
    "Length",
    "Laenge_mm",
    "Länge_mm",
    "Laenge",
    "Länge"
  ]);

  const insulationMm = numberByAliases(flat, [
    "Insulation_thickness_mm",
    "InsulationThickness",
    "Daemmstaerke",
    "Dämmstärke",
    "Daemmung_mm",
    "Dämmung_mm"
  ]);

  let airflowLs = numberByAliases(flat, [
    "qv_SizingFlow_ls",
    "AirFlow_ls",
    "Airflow_l_s",
    "Flow_l_s",
    "Volumenstrom_l_s"
  ]);

  let airflowM3h = numberByAliases(flat, [
    "AirFlow_m3h",
    "Airflow_m3_h",
    "Flow_m3h",
    "Volumenstrom_m3h",
    "Volumenstrom_m3_h"
  ]);

  if (airflowLs !== undefined && airflowM3h === undefined) {
    airflowM3h = airflowLs * 3.6;
  }

  if (airflowM3h !== undefined && airflowLs === undefined) {
    airflowLs = airflowM3h / 3.6;
  }

  let areaM2: number | undefined;

  if (
    dimensions.shape === "rectangular" &&
    dimensions.widthMm &&
    dimensions.heightMm
  ) {
    areaM2 =
      (dimensions.widthMm / 1000) *
      (dimensions.heightMm / 1000);
  }

  if (
    dimensions.shape === "round" &&
    dimensions.diameterMm
  ) {
    const d = dimensions.diameterMm / 1000;
    areaM2 = Math.PI * d * d / 4;
  }

  let velocityMs: number | undefined;

  if (
    areaM2 &&
    areaM2 > 0 &&
    airflowLs !== undefined
  ) {
    velocityMs = (airflowLs / 1000) / areaM2;
  }

  let quantityUnit: "m" | "m²" | "St." | undefined;
  let quantity: number | undefined;
  let quantityNote: string | undefined;

  switch (classification.type) {
    case "duct_segment":
      if (
        dimensions.shape === "rectangular" &&
        lengthMm &&
        dimensions.widthMm &&
        dimensions.heightMm
      ) {
        quantityUnit = "m²";
        quantity =
          2 *
          (
            dimensions.widthMm / 1000 +
            dimensions.heightMm / 1000
          ) *
          (lengthMm / 1000);

        quantityNote =
          "Rechteckkanal: äußere Oberfläche 2 × (B + H) × L.";
      } else if (
        dimensions.shape === "round" &&
        lengthMm
      ) {
        quantityUnit = "m";
        quantity = lengthMm / 1000;
        quantityNote = "Rundrohr: Abrechnung nach Länge.";
      }
      break;

    case "duct_fitting":
      if (dimensions.shape === "round") {
        quantityUnit = "St.";
        quantity = 1;
        quantityNote =
          "Rund-Rohrformteil: Stück. Genaue LV-Zuordnung folgt.";
      } else {
        quantityUnit = "m²";
        quantityNote =
          "Rechteck-Kanalformteil: m² nach äußerer Oberfläche. Exakte Menge benötigt Formteilgeometrie.";
      }
      break;

    case "insulation":
      quantityUnit = "m²";
      quantityNote =
        "Dämmung/Isolierung: m²; exakte Fläche abhängig vom gedämmten Bauteil.";
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
      quantityUnit = "St.";
      quantity = 1;
      quantityNote = "Bauteil: Stück.";
      break;
  }

  return {
    type: classification.type,
    label: classification.label,
    ifcType,
    predefinedType,
    guid,
    name,
    tag,
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

    confidence: classification.confidence,
    matchedBy: classification.matchedBy,
    rawProperties: flat
  };
}

export function analyzeTgaSelection(
  selection: unknown[]
): TgaAnalysis[] {
  return selection.map(analyzeTgaObject);
}
