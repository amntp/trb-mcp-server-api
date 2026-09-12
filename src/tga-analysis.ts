export type TgaDomain =
  | "ventilation"
  | "heating"
  | "cooling"
  | "plumbing"
  | "automation"
  | "electrical"
  | "generic_mep"
  | "unknown";

export type TgaComponentType =
  | "duct_segment"
  | "duct_fitting"
  | "fire_damper"
  | "volume_flow_controller"
  | "damper"
  | "air_terminal"
  | "grille"
  | "disc_valve"
  | "silencer"
  | "fan"
  | "filter"
  | "air_handling_unit"
  | "heat_recovery"
  | "coil"
  | "pipe_segment"
  | "pipe_fitting"
  | "valve"
  | "pump"
  | "boiler"
  | "chiller"
  | "heat_pump"
  | "heat_exchanger"
  | "radiator"
  | "tank"
  | "water_heater"
  | "sanitary_terminal"
  | "waste_terminal"
  | "interceptor"
  | "sensor"
  | "actuator"
  | "controller"
  | "meter"
  | "cable_segment"
  | "cable_carrier"
  | "distribution_board"
  | "switching_device"
  | "protective_device"
  | "outlet"
  | "light_fixture"
  | "transformer"
  | "electric_motor"
  | "communications_appliance"
  | "insulation"
  | "flow_controller_generic"
  | "flow_terminal_generic"
  | "flow_moving_device_generic"
  | "flow_treatment_device_generic"
  | "energy_conversion_device_generic"
  | "unknown";

export interface BsddClassMatch {
  name?: string;
  referenceCode?: string;
  uri?: string;
  description?: string;
  dictionaryName?: string;
  dictionaryUri?: string;
  relatedIfcEntityNames?: string[];
  score: number;
}

export interface TgaAnalysis {
  domain: TgaDomain;
  type: TgaComponentType;
  label: string;
  ifcType?: string;
  predefinedType?: string;
  guid?: string;
  runtimeId?: number;
  name?: string;
  description?: string;
  objectType?: string;
  manufacturer?: string;
  productType?: string;
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
  bsddMatches?: BsddClassMatch[];
  etimMatches?: BsddClassMatch[];
  vdi3805Scope?: string;
  bimStatus?: "local-only" | "bsdd-enriched" | "bsdd-unavailable";
  rawProperties: Record<string, unknown>;
}

type Classification = {
  domain: TgaDomain;
  type: TgaComponentType;
  label: string;
  confidence: "high" | "medium" | "low";
  matchedBy: string[];
  bsddTerms: string[];
};

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\/_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

function primitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function flatten(
  value: unknown,
  prefix = "",
  out: Record<string, unknown> = {}
): Record<string, unknown> {
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      flatten(item, prefix ? `${prefix}.${index}` : String(index), out);
    });
    return out;
  }

  if (typeof value !== "object") {
    if (prefix) out[prefix] = value;
    return out;
  }

  const obj = value as Record<string, unknown>;

  if (
    typeof obj.name === "string" &&
    Object.prototype.hasOwnProperty.call(obj, "value") &&
    primitive(obj.value)
  ) {
    const key = obj.name.trim();
    if (key) {
      if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = obj.value;
      if (prefix) out[`${prefix}.${key}`] = obj.value;
    }
    return out;
  }

  if (typeof obj.name === "string" && Array.isArray(obj.props)) {
    const groupName = obj.name.trim();
    for (const item of obj.props) {
      if (!item || typeof item !== "object") continue;
      const prop = item as Record<string, unknown>;
      if (
        typeof prop.name !== "string" ||
        !Object.prototype.hasOwnProperty.call(prop, "value")
      ) {
        continue;
      }
      const key = prop.name.trim();
      if (!key) continue;
      if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = prop.value;
      if (groupName) out[`${groupName}.${key}`] = prop.value;
    }
  }

  for (const [key, child] of Object.entries(obj)) {
    if (key === "props" && Array.isArray(child)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object") flatten(child, path, out);
    else out[path] = child;
  }

  return out;
}

function findValue(flat: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(flat);

  for (const alias of aliases) {
    const wanted = norm(alias);
    const hit = entries.find(([key]) => norm(key) === wanted);
    if (hit) return hit[1];
  }

  for (const alias of aliases) {
    const wanted = norm(alias);
    const hit = entries.find(([key]) => norm(key.split(".").pop()) === wanted);
    if (hit) return hit[1];
  }

  for (const alias of aliases) {
    const wanted = norm(alias);
    const hit = entries.find(([key]) => norm(key).includes(wanted));
    if (hit) return hit[1];
  }

  return undefined;
}

function txt(flat: Record<string, unknown>, aliases: string[]): string | undefined {
  const value = findValue(flat, aliases);
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === undefined || value === null) return undefined;

  const text = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.+-]/g, "");

  if (!text) return undefined;
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : undefined;
}

function num(flat: Record<string, unknown>, aliases: string[]): number | undefined {
  return numeric(findValue(flat, aliases));
}

function hasAny(haystack: string, terms: string[]): boolean {
  const normalized = norm(haystack);
  return terms.some((term) => normalized.includes(norm(term)));
}

function fieldText(flat: Record<string, unknown>): string {
  return [
    txt(flat, ["Product Name", "product.name", "name"]),
    txt(flat, ["Product Description", "product.description", "description"]),
    txt(flat, ["Product Object Type", "product.objectType", "objectType"]),
    txt(flat, ["Product Type", "Type Name", "Typ"]),
    txt(flat, ["Layer", "Presentation Layer", "PresentationLayer"]),
    txt(flat, ["Tech-Medium", "System", "SystemName", "DistributionSystem"]),
    txt(flat, ["Fabrikat", "Manufacturer", "Hersteller"]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function makeClass(
  domain: TgaDomain,
  type: TgaComponentType,
  label: string,
  reason: string,
  bsddTerms: string[],
  confidence: "high" | "medium" | "low" = "high"
): Classification {
  return {
    domain,
    type,
    label,
    confidence,
    matchedBy: [reason],
    bsddTerms,
  };
}

function classify(flat: Record<string, unknown>): Classification {
  const ifc = norm(
    txt(flat, ["class", "Common Type", "CommonType", "IfcType", "EntityType"])
  );
  const predefined = norm(txt(flat, ["PredefinedType", "Predefined Type"]));
  const layer = norm(txt(flat, ["Layer", "Presentation Layer", "PresentationLayer"]));
  const product = norm(fieldText(flat));
  const system = norm(
    txt(flat, ["Tech-Medium", "System", "SystemName", "DistributionSystem", "Anlage"])
  );

  if (
    hasAny(layer, ["L_BSK", "BSK", "Brandschutz"]) ||
    hasAny(product, [
      "Brandschutzklappe",
      "Brandklappe",
      "Fire Damper",
      "FK2-EU",
      "FK-EU",
      "FKRS-EU",
      "FK90",
      "FR90",
    ]) ||
    predefined.includes("firedamper") ||
    predefined.includes("firesmokedamper")
  ) {
    return makeClass(
      "ventilation",
      "fire_damper",
      "Brandschutzklappe (BSK)",
      layer.includes("bsk") ? "Layer" : "Produkt-/Property-Daten",
      ["fire damper", "brandschutzklappe"]
    );
  }

  if (
    hasAny(layer, ["L_VSR", "VSR", "Volumenstromregler"]) ||
    hasAny(product, [
      "Volumenstromregler",
      "Volumenstrombegrenzer",
      "Luftmengenregler",
      "Volume Flow Controller",
      "VARYCONTROL",
      "VAV",
      "CAV",
      "TVR",
      "TVJ",
      "TVZ",
      "TVE",
      "VFC",
    ])
  ) {
    return makeClass(
      "ventilation",
      "volume_flow_controller",
      "Volumenstromregler (VSR)",
      layer.includes("vsr") ? "Layer" : "Produkt-/Property-Daten",
      ["volume flow controller", "air volume controller"]
    );
  }

  if (
    ifc.includes("ductsilencer") ||
    hasAny(layer, ["schalldaempfer", "silencer"]) ||
    hasAny(product, [
      "Schalldämpfer",
      "Schalldaempfer",
      "Kulissenschalldämpfer",
      "Rohrschalldämpfer",
      "Silencer",
      "Sound Attenuator",
    ])
  ) {
    return makeClass(
      "ventilation",
      "silencer",
      "Schalldämpfer",
      "Produkt-/Property-Daten",
      ["duct silencer", "sound attenuator"]
    );
  }

  if (
    ifc.includes("airterminal") ||
    hasAny(product, ["Lüftungsgitter", "Luftgitter", "Wetterschutzgitter", "Air Grille", "Grille"])
  ) {
    if (hasAny(product, ["Tellerventil", "Disc Valve"])) {
      return makeClass(
        "ventilation",
        "disc_valve",
        "Tellerventil",
        "Produkt-/Property-Daten",
        ["disc valve"]
      );
    }

    if (hasAny(product, ["Gitter", "Grille"])) {
      return makeClass(
        "ventilation",
        "grille",
        "Lüftungsgitter",
        "Produkt-/Property-Daten",
        ["air grille"]
      );
    }

    return makeClass(
      "ventilation",
      "air_terminal",
      "Luftauslass",
      ifc.includes("airterminal") ? "IFC-Klasse" : "Produkt-/Property-Daten",
      ["air terminal", "diffuser"]
    );
  }

  if (ifc.includes("fan") || hasAny(product, ["Ventilator", "Fan"])) {
    return makeClass("ventilation", "fan", "Ventilator", "IFC-/Produktdaten", ["fan"]);
  }

  if (hasAny(product, ["Luftfilter", "Filterstufe", "HEPA", "Bag Filter"])) {
    return makeClass("ventilation", "filter", "Luftfilter", "Produkt-/Property-Daten", ["air filter"]);
  }

  if (hasAny(product, ["RLT Gerät", "RLT-Gerät", "Luftbehandlungsgerät", "Air Handling Unit", "AHU"])) {
    return makeClass(
      "ventilation",
      "air_handling_unit",
      "RLT-Gerät / Luftbehandlungsgerät",
      "Produkt-/Property-Daten",
      ["air handling unit"]
    );
  }

  if (hasAny(product, ["Wärmerückgewinnung", "WRG", "Rotationswärmetauscher", "Heat Recovery"])) {
    return makeClass(
      "ventilation",
      "heat_recovery",
      "Wärmerückgewinnung",
      "Produkt-/Property-Daten",
      ["heat recovery unit"]
    );
  }

  if (hasAny(product, ["Heizregister", "Kühlregister", "Cooling Coil", "Heating Coil"])) {
    return makeClass(
      "ventilation",
      "coil",
      "Heiz-/Kühlregister",
      "Produkt-/Property-Daten",
      ["air heating coil", "air cooling coil"]
    );
  }

  if (
    ifc.includes("valve") ||
    hasAny(product, [
      "Kugelhahn",
      "Regelventil",
      "Absperrventil",
      "Rückschlagventil",
      "Schieber",
      "Valve",
      "Ventil",
    ])
  ) {
    return makeClass(
      "generic_mep",
      "valve",
      "Armatur / Ventil",
      "Produkt-/Property-Daten",
      ["valve"]
    );
  }

  if (ifc.includes("pump") || hasAny(product, ["Pumpe", "Pump", "Umwälzpumpe", "Zirkulationspumpe"])) {
    return makeClass("generic_mep", "pump", "Pumpe", "IFC-/Produktdaten", ["pump"]);
  }

  if (hasAny(product, ["Wärmepumpe", "Heat Pump"]) || predefined.includes("heatpump")) {
    return makeClass("cooling", "heat_pump", "Wärmepumpe", "Produkt-/Property-Daten", ["heat pump"]);
  }

  if (hasAny(product, ["Kältemaschine", "Chiller", "Kaltwassersatz"]) || predefined.includes("chiller")) {
    return makeClass("cooling", "chiller", "Kältemaschine / Chiller", "Produkt-/Property-Daten", ["chiller"]);
  }

  if (hasAny(product, ["Heizkessel", "Boiler", "Wärmeerzeuger"]) || predefined.includes("boiler")) {
    return makeClass("heating", "boiler", "Heizkessel / Wärmeerzeuger", "Produkt-/Property-Daten", ["boiler"]);
  }

  if (ifc.includes("heatexchanger") || hasAny(product, ["Wärmetauscher", "Heat Exchanger"])) {
    return makeClass(
      "generic_mep",
      "heat_exchanger",
      "Wärmetauscher",
      "IFC-/Produktdaten",
      ["heat exchanger"]
    );
  }

  if (ifc.includes("tank") || hasAny(product, ["Pufferspeicher", "Ausdehnungsgefäß", "Speicher", "Tank", "Behälter"])) {
    return makeClass(
      "generic_mep",
      "tank",
      "Behälter / Speicher",
      "IFC-/Produktdaten",
      ["tank", "storage vessel"]
    );
  }

  if (ifc.includes("sensor") || hasAny(product, ["Sensor", "Fühler"])) {
    return makeClass("automation", "sensor", "Sensor / Messfühler", "IFC-/Produktdaten", ["sensor"]);
  }

  if (ifc.includes("actuator") || hasAny(product, ["Stellantrieb", "Aktor", "Actuator"])) {
    return makeClass("automation", "actuator", "Stellantrieb / Aktor", "IFC-/Produktdaten", ["actuator"]);
  }

  if (ifc.includes("controller") && !ifc.includes("flowcontroller")) {
    return makeClass("automation", "controller", "Regler / Controller", "IFC-Klasse", ["controller"]);
  }

  if (ifc.includes("flowmeter") || hasAny(product, ["Wärmemengenzähler", "Wasserzähler", "Flow Meter"])) {
    return makeClass("automation", "meter", "Messgerät / Zähler", "IFC-/Produktdaten", ["flow meter", "meter"]);
  }

  if (ifc.includes("electricdistributionboard") || hasAny(product, ["Unterverteilung", "Hauptverteilung", "Schaltschrank"])) {
    return makeClass("electrical", "distribution_board", "Elektroverteilung", "IFC-/Produktdaten", ["distribution board"]);
  }

  if (ifc.includes("cablecarrier") || hasAny(product, ["Kabeltrasse", "Kabelrinne", "Kabelleiter", "Cable Tray"])) {
    return makeClass("electrical", "cable_carrier", "Kabeltrasse / Kabeltragsystem", "IFC-/Produktdaten", ["cable tray"]);
  }

  if (ifc.includes("cablesegment")) {
    return makeClass("electrical", "cable_segment", "Kabel / Leitung", "IFC-Klasse", ["cable segment"]);
  }

  if (ifc.includes("lightfixture")) {
    return makeClass("electrical", "light_fixture", "Leuchte", "IFC-Klasse", ["light fixture", "luminaire"]);
  }

  if (ifc.includes("ductfitting") || hasAny(product, ["Kanalformteil", "Duct Fitting"])) {
    return makeClass("ventilation", "duct_fitting", "Lüftungsformteil", "IFC-/Produktdaten", ["duct fitting"]);
  }

  if (ifc.includes("pipefitting") || hasAny(product, ["Rohrformteil", "Pipe Fitting"])) {
    return makeClass("generic_mep", "pipe_fitting", "Rohrformteil", "IFC-/Produktdaten", ["pipe fitting"]);
  }

  const airMedium = hasAny(system, [
    "Zuluft",
    "Abluft",
    "Fortluft",
    "Außenluft",
    "Aussenluft",
    "Umluft",
    "L_Zuluft",
    "L_Abluft",
    "L_Fortluft",
    "L_Außenluft",
  ]);

  const ductCues =
    ifc.includes("ductsegment") ||
    hasAny(product, [
      "Luftleitung",
      "Lüftungskanal",
      "Luftkanal",
      "Rechteckkanal",
      "Lüftungsrohr",
      "Wickelfalzrohr",
      "Spirorohr",
      "Duct Segment",
      "Air Duct",
    ]) ||
    airMedium;

  if (ductCues) {
    return makeClass(
      "ventilation",
      "duct_segment",
      "Lüftungskanal / Lüftungsrohr",
      ifc.includes("ductsegment") ? "IFC-Klasse" : "Produkt-/Systemdaten",
      ["duct segment", "air duct"]
    );
  }

  const pipeCues =
    ifc.includes("pipesegment") ||
    hasAny(product, [
      "Stahlrohr",
      "Rohrleitung",
      "Kupferrohr",
      "Kunststoffrohr",
      "Mehrschichtverbundrohr",
      "Pipe Segment",
      "DIN 2448",
      "DIN EN 10255",
    ]);

  if (pipeCues) {
    return makeClass(
      "generic_mep",
      "pipe_segment",
      "Rohrleitung",
      ifc.includes("pipesegment") ? "IFC-Klasse" : "Produkt-/Property-Daten",
      ["pipe segment"]
    );
  }

  if (ifc.includes("flowsegment")) {
    if (airMedium) {
      return makeClass(
        "ventilation",
        "duct_segment",
        "Lüftungskanal / Lüftungsrohr",
        "IFCFLOWSEGMENT + Luftsystem",
        ["duct segment", "air duct"],
        "medium"
      );
    }

    if (hasAny(product, ["Rohr", "Pipe", "DIN 2448", "DIN EN 10255"])) {
      return makeClass(
        "generic_mep",
        "pipe_segment",
        "Rohrleitung",
        "IFCFLOWSEGMENT + Produktdaten",
        ["pipe segment"],
        "medium"
      );
    }
  }

  const explicitInsulationObject =
    ifc.includes("covering") ||
    hasAny(layer, ["L_Daemmung", "L_Dämmung", "L_Isolierung"]) ||
    hasAny(product, [
      "Dämmmatte",
      "Dämmplatte",
      "Rohrdämmung",
      "Kanaldämmung",
      "Isolierung",
      "Insulation",
      "Armaflex",
      "Kaiflex",
      "K-Flex",
    ]);

  if (explicitInsulationObject) {
    return makeClass(
      "generic_mep",
      "insulation",
      "Dämmung / Isolierung",
      ifc.includes("covering") ? "IFC-Klasse" : "Produkt-/Layer-Daten",
      ["insulation"]
    );
  }

  if (ifc.includes("flowcontroller")) {
    return makeClass(
      "generic_mep",
      "flow_controller_generic",
      "Strömungs-/Regelbauteil",
      "IFCFlowController",
      [],
      "low"
    );
  }

  if (ifc.includes("flowterminal")) {
    return makeClass(
      "generic_mep",
      "flow_terminal_generic",
      "TGA-Endgerät",
      "IfcFlowTerminal",
      [],
      "low"
    );
  }

  if (ifc.includes("flowmovingdevice")) {
    return makeClass(
      "generic_mep",
      "flow_moving_device_generic",
      "Förder-/Strömungsmaschine",
      "IfcFlowMovingDevice",
      [],
      "low"
    );
  }

  if (ifc.includes("flowtreatmentdevice")) {
    return makeClass(
      "generic_mep",
      "flow_treatment_device_generic",
      "TGA-Behandlungsbauteil",
      "IfcFlowTreatmentDevice",
      [],
      "low"
    );
  }

  if (ifc.includes("energyconversiondevice")) {
    return makeClass(
      "generic_mep",
      "energy_conversion_device_generic",
      "Energieumwandlungsgerät",
      "IfcEnergyConversionDevice",
      [],
      "low"
    );
  }

  return makeClass("unknown", "unknown", "Nicht eindeutig erkannt", "Keine eindeutige Klassifizierung", [], "low");
}

type Dimensions = {
  shape?: "rectangular" | "round";
  widthMm?: number;
  heightMm?: number;
  diameterMm?: number;
  inferredLengthMm?: number;
};

function parseDimensionString(value: string | undefined): Partial<Dimensions> {
  if (!value) return {};

  const normalized = value.replace(/,/g, ".").replace(/×/g, "x");

  const round = normalized.match(/(?:ø|⌀|dn\s*)\s*(\d+(?:\.\d+)?)/i);
  if (round) {
    return {
      shape: "round",
      diameterMm: Number(round[1]),
    };
  }

  const triple = normalized.match(/(?:^|[^\d])(\d{2,5}(?:\.\d+)?)\s*x\s*(\d{2,5}(?:\.\d+)?)\s*x\s*(\d{2,5}(?:\.\d+)?)(?:[^\d]|$)/i);
  if (triple) {
    return {
      shape: "rectangular",
      widthMm: Number(triple[1]),
      heightMm: Number(triple[2]),
      inferredLengthMm: Number(triple[3]),
    };
  }

  const rectangle = normalized.match(/(?:^|[^\d])(\d{2,5}(?:\.\d+)?)\s*x\s*(\d{2,5}(?:\.\d+)?)(?:[^\d]|$)/i);
  if (rectangle) {
    return {
      shape: "rectangular",
      widthMm: Number(rectangle[1]),
      heightMm: Number(rectangle[2]),
    };
  }

  return {};
}

function dimensions(flat: Record<string, unknown>): Dimensions {
  let widthMm = num(flat, [
    "Geom-Side 1 (mm)",
    "Geom-Side 1",
    "Width_mm",
    "Width",
    "Breite",
    "Duct Width",
  ]);

  let heightMm = num(flat, [
    "Geom-Side 2 (mm)",
    "Geom-Side 2",
    "Height_mm",
    "Height",
    "Höhe",
    "Hoehe",
    "Duct Height",
  ]);

  let diameterMm = num(flat, [
    "Geom-Diameter (mm)",
    "Geom-Diameter",
    "Diameter_mm",
    "Diameter",
    "Durchmesser",
    "Nominal Diameter",
    "DN",
  ]);

  let inferredLengthMm: number | undefined;

  const candidates = [
    txt(flat, ["ConnectionSize_mm", "ConnectionSize", "Connection Size"]),
    txt(flat, ["NominalSize", "Nominal Size", "DuctSize", "Duct Size"]),
    txt(flat, ["Dimension", "Dimensions", "Abmessung", "Abmessungen", "Size"]),
    txt(flat, ["Product Description", "product.description", "Description"]),
    txt(flat, ["Product Type", "Type Name", "Typ"]),
    txt(flat, ["Product Name", "product.name", "Name"]),
  ];

  for (const candidate of candidates) {
    const parsed = parseDimensionString(candidate);
    if (diameterMm === undefined && parsed.diameterMm !== undefined) diameterMm = parsed.diameterMm;
    if (widthMm === undefined && parsed.widthMm !== undefined) widthMm = parsed.widthMm;
    if (heightMm === undefined && parsed.heightMm !== undefined) heightMm = parsed.heightMm;
    if (inferredLengthMm === undefined && parsed.inferredLengthMm !== undefined) {
      inferredLengthMm = parsed.inferredLengthMm;
    }
  }

  if (widthMm !== undefined && heightMm !== undefined) {
    return {
      shape: "rectangular",
      widthMm,
      heightMm,
      inferredLengthMm,
    };
  }

  if (diameterMm !== undefined) {
    return {
      shape: "round",
      diameterMm,
      inferredLengthMm,
    };
  }

  return {
    widthMm,
    heightMm,
    diameterMm,
    inferredLengthMm,
  };
}

function vdiScope(domain: TgaDomain): string | undefined {
  const map: Partial<Record<TgaDomain, string>> = {
    ventilation: "VDI 3805 – Raumlufttechnik",
    heating: "VDI 3805 – Heiztechnik",
    cooling: "VDI 3805 – Kälte-/Wärmepumpentechnik",
    plumbing: "VDI 3805 – Sanitärtechnik",
    automation: "VDI 3805 – Gebäudeautomation",
    electrical: "VDI 3805 – Elektrotechnik",
  };

  return map[domain];
}

function analyzeLocal(input: unknown): { analysis: TgaAnalysis; bsddTerms: string[] } {
  const flat = flatten(input);
  const classification = classify(flat);
  const dimension = dimensions(flat);

  const ifcType = txt(flat, ["class", "Common Type", "CommonType", "IfcType", "EntityType"]);
  const predefinedType = txt(flat, ["PredefinedType", "Predefined Type"]);
  const guid = txt(flat, ["GUID (IFC)", "GUID IFC", "externalId", "GlobalId", "IfcGuid", "GUID"]);
  const runtimeId = num(flat, ["runtimeId", "RuntimeId"]);
  const name = txt(flat, ["Product Name", "product.name", "ProductName", "name"]);
  const description = txt(flat, ["Product Description", "product.description", "description"]);
  const objectType = txt(flat, ["Product Object Type", "product.objectType", "ObjectType"]);
  const manufacturer = txt(flat, [
    "Fabrikat",
    "Manufacturer",
    "Hersteller",
    "Manufacturer Name",
    "Product Manufacturer",
    "ManufacturerName",
  ]);
  const productType = txt(flat, ["Product Type", "Type Name", "Typ", "Type"]);
  const tag = txt(flat, ["Tag", "Kennzeichen", "Bauteilkennzeichen"]);
  const layer = txt(flat, ["Layer", "Presentation Layer", "PresentationLayer"]);
  const modelName = txt(flat, ["modelName", "ModelName", "File Name"]);
  const system = txt(flat, [
    "Tech-Medium",
    "Tech Medium",
    "System",
    "SystemName",
    "System Name",
    "DistributionSystem",
    "SystemClassification",
    "Anlage",
    "Anlagenkennzeichen",
    "MagiCADSystem",
  ]);
  const storey = txt(flat, [
    "Storey",
    "BuildingStorey",
    "Building Storey",
    "Geschoss",
    "Etage",
    "Floor",
    "Level",
    "ReferenceLevel",
    "Reference Level",
  ]);

  const directLengthMm =
    num(flat, [
      "Geom-Length (mm)",
      "Geom-Length",
      "Length_mm",
      "Length mm",
      "Laenge_mm",
      "Länge_mm",
      "DuctLength_mm",
      "PipeLength_mm",
    ]) ?? num(flat, ["Length", "Laenge", "Länge"]);

  const lengthMm = directLengthMm ?? dimension.inferredLengthMm;

  const insulationMm = num(flat, [
    "Insulation_thickness_mm",
    "InsulationThickness",
    "Insulation Thickness",
    "Insulation_mm",
    "Daemmstaerke",
    "Dämmstärke",
    "Daemmung_mm",
    "Dämmung_mm",
  ]);

  let airflowLs = num(flat, [
    "qv_SizingFlow_ls",
    "SizingFlow_ls",
    "AirFlow_ls",
    "Flow_l_s",
    "Volumenstrom_l_s",
    "Volumenstrom_ls",
    "Volume Flow l/s",
    "Calc-Volume flow (l/s)",
  ]);

  let airflowM3h = num(flat, [
    "qv_SizingFlow_m3h",
    "SizingFlow_m3h",
    "AirFlow_m3h",
    "Flow_m3h",
    "Volumenstrom_m3h",
    "Volume Flow m3/h",
    "Calc-Volume flow (m3/h)",
  ]);

  if (airflowLs !== undefined && airflowM3h === undefined) airflowM3h = airflowLs * 3.6;
  if (airflowM3h !== undefined && airflowLs === undefined) airflowLs = airflowM3h / 3.6;

  const pressureLossPa = num(flat, [
    "Calc-Pressure loss (Pa)",
    "Calc-Pressure Loss (Pa)",
    "Pressure loss (Pa)",
    "Pressure Loss",
    "Druckverlust",
    "Druckverlust (Pa)",
  ]);

  const zeta = num(flat, ["Calc-Zeta", "Zeta", "ζ"]);

  let areaM2: number | undefined;
  if (
    dimension.shape === "rectangular" &&
    dimension.widthMm !== undefined &&
    dimension.heightMm !== undefined
  ) {
    areaM2 = (dimension.widthMm / 1000) * (dimension.heightMm / 1000);
  } else if (dimension.shape === "round" && dimension.diameterMm !== undefined) {
    const diameterM = dimension.diameterMm / 1000;
    areaM2 = (Math.PI * diameterM * diameterM) / 4;
  }

  const velocityMs =
    areaM2 !== undefined && areaM2 > 0 && airflowLs !== undefined
      ? airflowLs / 1000 / areaM2
      : undefined;

  let quantityUnit: "m" | "m²" | "St." | undefined;
  let quantity: number | undefined;
  let quantityNote: string | undefined;

  if (classification.type === "duct_segment") {
    if (
      dimension.shape === "rectangular" &&
      lengthMm !== undefined &&
      dimension.widthMm !== undefined &&
      dimension.heightMm !== undefined
    ) {
      quantityUnit = "m²";
      quantity =
        2 *
        (dimension.widthMm / 1000 + dimension.heightMm / 1000) *
        (lengthMm / 1000);
      quantityNote = "Rechteckkanal: äußere Oberfläche 2 × (B + H) × L.";
    } else if (dimension.shape === "round" && lengthMm !== undefined) {
      quantityUnit = "m";
      quantity = lengthMm / 1000;
      quantityNote = "Rundrohr: Abrechnung nach Länge.";
    }
  } else if (classification.type === "pipe_segment" || classification.type === "cable_segment") {
    quantityUnit = "m";
    if (lengthMm !== undefined) quantity = lengthMm / 1000;
    quantityNote = "Linienbauteil: Abrechnung nach Länge.";
  } else if (classification.type === "duct_fitting") {
    if (dimension.shape === "round") {
      quantityUnit = "St.";
      quantity = 1;
      quantityNote = "Rund-Rohrformteil: Stück.";
    } else {
      quantityUnit = "m²";
      quantityNote = "Rechteck-Kanalformteil: äußere Oberfläche; exakte Menge benötigt Formteilgeometrie.";
    }
  } else if (classification.type === "insulation") {
    quantityUnit = "m²";
    quantityNote = "Dämmung/Isolierung: Fläche abhängig von Host-Geometrie.";
  } else if (classification.type !== "unknown") {
    quantityUnit = "St.";
    quantity = 1;
    quantityNote = "Bauteil: Stück.";
  }

  const fallbackTerms = [productType, name, description]
    .filter((value): value is string => Boolean(value && value.trim()))
    .slice(0, 2);

  const bsddTerms = Array.from(new Set([...classification.bsddTerms, ...fallbackTerms])).slice(0, 2);

  return {
    bsddTerms,
    analysis: {
      domain: classification.domain,
      type: classification.type,
      label: classification.label,
      ifcType,
      predefinedType,
      guid,
      runtimeId,
      name,
      description,
      objectType,
      manufacturer,
      productType,
      tag,
      layer,
      modelName,
      system,
      storey,
      shape: dimension.shape,
      widthMm: dimension.widthMm,
      heightMm: dimension.heightMm,
      diameterMm: dimension.diameterMm,
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
      confidence: classification.confidence,
      matchedBy: classification.matchedBy,
      vdi3805Scope: vdiScope(classification.domain),
      bimStatus: "local-only",
      rawProperties: flat,
    },
  };
}

const BSDD_API = "https://api.bsdd.buildingsmart.org";
const bsddCache = new Map<
  string,
  {
    expires: number;
    value: BsddClassMatch[];
  }
>();

function bsddScore(item: BsddClassMatch, analysis: TgaAnalysis, query: string): number {
  let score = 0;
  const q = norm(query);
  const itemName = norm(item.name);
  const itemDescription = norm(item.description);
  const dictionary = norm(`${item.dictionaryName ?? ""} ${item.dictionaryUri ?? ""}`);

  if (itemName === q) score += 50;
  else if (itemName.includes(q) || (itemName && q.includes(itemName))) score += 30;
  if (itemDescription.includes(q)) score += 10;
  if (dictionary.includes("etim")) score += 25;
  if (dictionary.includes("ifc") || dictionary.includes("buildingsmart")) score += 10;

  const localIfc = norm(analysis.ifcType);
  if (
    localIfc &&
    item.relatedIfcEntityNames?.some((ifc: string) => norm(ifc) === localIfc)
  ) {
    score += 35;
  }

  return score;
}

async function searchBsdd(query: string, analysis: TgaAnalysis): Promise<BsddClassMatch[]> {
  const cacheKey = `${query}|${analysis.ifcType ?? ""}`;
  const cached = bsddCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const url = new URL("/api/Class/Search/v1", BSDD_API);
  url.searchParams.set("SearchText", query);
  url.searchParams.set("Limit", "20");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-User-Agent": "AgentEyes/2.1",
      },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`bSDD HTTP ${response.status}`);

    const payload: unknown = await response.json();
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const rawClasses: unknown[] = Array.isArray(record.classes) ? record.classes : [];
    const items: BsddClassMatch[] = [];

    for (const raw of rawClasses) {
      if (!raw || typeof raw !== "object") continue;
      const value = raw as Record<string, unknown>;

      const relatedIfcEntityNames = Array.isArray(value.relatedIfcEntityNames)
        ? value.relatedIfcEntityNames.filter(
            (ifc: unknown): ifc is string => typeof ifc === "string"
          )
        : undefined;

      const item: BsddClassMatch = {
        name: typeof value.name === "string" ? value.name : undefined,
        referenceCode: typeof value.referenceCode === "string" ? value.referenceCode : undefined,
        uri: typeof value.uri === "string" ? value.uri : undefined,
        description: typeof value.description === "string" ? value.description : undefined,
        dictionaryName: typeof value.dictionaryName === "string" ? value.dictionaryName : undefined,
        dictionaryUri: typeof value.dictionaryUri === "string" ? value.dictionaryUri : undefined,
        relatedIfcEntityNames,
        score: 0,
      };

      item.score = bsddScore(item, analysis, query);
      items.push(item);
    }

    items.sort((a: BsddClassMatch, b: BsddClassMatch) => b.score - a.score);
    const result = items.slice(0, 8);

    bsddCache.set(cacheKey, {
      expires: Date.now() + 6 * 60 * 60 * 1000,
      value: result,
    });

    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function enrich(local: { analysis: TgaAnalysis; bsddTerms: string[] }): Promise<TgaAnalysis> {
  if (!local.bsddTerms.length) return local.analysis;

  try {
    const searches = await Promise.allSettled(
      local.bsddTerms.map((term) => searchBsdd(term, local.analysis))
    );

    const combined = searches.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );

    const unique = Array.from(
      new Map(
        combined
          .filter((item) => item.uri)
          .map((item) => [item.uri as string, item])
      ).values()
    )
      .sort((a: BsddClassMatch, b: BsddClassMatch) => b.score - a.score)
      .slice(0, 6);

    const etim = unique
      .filter((item) =>
        norm(`${item.dictionaryName ?? ""} ${item.dictionaryUri ?? ""}`).includes("etim")
      )
      .slice(0, 3);

    return {
      ...local.analysis,
      bsddMatches: unique,
      etimMatches: etim,
      bimStatus: unique.length ? "bsdd-enriched" : "local-only",
    };
  } catch {
    return {
      ...local.analysis,
      bimStatus: "bsdd-unavailable",
    };
  }
}

export async function analyzeTgaSelection(selection: unknown[]): Promise<TgaAnalysis[]> {
  const locals: { analysis: TgaAnalysis; bsddTerms: string[] }[] = [];

  for (const entryValue of selection || []) {
    if (entryValue && typeof entryValue === "object") {
      const entry = entryValue as Record<string, unknown>;
      const properties = Array.isArray(entry.properties) ? entry.properties : [];

      if (properties.length > 0) {
        for (const objectProperties of properties) {
          const merged = {
            modelId: entry.modelId,
            modelName: entry.modelName,
            ...(objectProperties && typeof objectProperties === "object"
              ? (objectProperties as Record<string, unknown>)
              : {}),
          };

          locals.push(analyzeLocal(merged));
        }
        continue;
      }
    }

    locals.push(analyzeLocal(entryValue));
  }

  const head = locals.slice(0, 6);
  const tail = locals.slice(6).map((item) => item.analysis);

  return [...(await Promise.all(head.map(enrich))), ...tail];
}
