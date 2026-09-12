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

  name?:
    string;

  referenceCode?:
    string;

  uri?:
    string;

  description?:
    string;

  dictionaryName?:
    string;

  dictionaryUri?:
    string;

  relatedIfcEntityNames?:
    string[];

  score:
    number;
}


export interface TgaAnalysis {

  domain:
    TgaDomain;

  type:
    TgaComponentType;

  label:
    string;

  ifcType?:
    string;

  predefinedType?:
    string;

  guid?:
    string;

  runtimeId?:
    number;

  name?:
    string;

  description?:
    string;

  objectType?:
    string;

  manufacturer?:
    string;

  productType?:
    string;

  tag?:
    string;

  layer?:
    string;

  modelName?:
    string;

  system?:
    string;

  storey?:
    string;

  shape?:
    "rectangular" |
    "round";

  widthMm?:
    number;

  heightMm?:
    number;

  diameterMm?:
    number;

  lengthMm?:
    number;

  insulationMm?:
    number;

  airflowLs?:
    number;

  airflowM3h?:
    number;

  areaM2?:
    number;

  velocityMs?:
    number;

  pressureLossPa?:
    number;

  zeta?:
    number;

  quantityUnit?:
    "m" |
    "m²" |
    "St.";

  quantity?:
    number;

  quantityNote?:
    string;

  confidence:
    "high" |
    "medium" |
    "low";

  matchedBy:
    string[];

  bsddMatches?:
    BsddClassMatch[];

  etimMatches?:
    BsddClassMatch[];

  vdi3805Scope?:
    string;

  bimStatus?:
    "local-only" |
    "bsdd-enriched" |
    "bsdd-unavailable";

  rawProperties:
    Record<string, unknown>;
}


type Rule = {

  domain:
    TgaDomain;

  type:
    TgaComponentType;

  label:
    string;

  ifc?:
    string[];

  predefined?:
    string[];

  layer?:
    string[];

  terms?:
    string[];

  bsdd?:
    string[];
};


/* =========================================================
   NORMALISIERUNG
========================================================= */

function norm(
  value: unknown
): string {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /ä/g,
      "ae"
    )
    .replace(
      /ö/g,
      "oe"
    )
    .replace(
      /ü/g,
      "ue"
    )
    .replace(
      /ß/g,
      "ss"
    )
    .replace(
      /[\/_\-]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    );
}


function primitive(
  value: unknown
): boolean {

  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}


/* =========================================================
   TRIMBLE PROPERTY FLATTENING
========================================================= */

function flatten(
  value: unknown,
  prefix = "",
  out:
    Record<
      string,
      unknown
    > = {}
): Record<string, unknown> {

  if (
    value === null ||
    value === undefined
  ) {

    return out;
  }


  if (
    Array.isArray(
      value
    )
  ) {

    value.forEach(
      (
        item,
        index
      ) => {

        flatten(
          item,

          prefix
            ? `${prefix}.${index}`
            : String(
                index
              ),

          out
        );
      }
    );


    return out;
  }


  if (
    typeof value !==
    "object"
  ) {

    if (prefix) {

      out[prefix] =
        value;
    }

    return out;
  }


  const obj =
    value as
      Record<
        string,
        unknown
      >;


  /*
   * Trimble:
   *
   * {
   *   name: "Layer",
   *   value: "L_BSK"
   * }
   */
  if (
    typeof obj.name ===
      "string" &&

    Object.prototype
      .hasOwnProperty
      .call(
        obj,
        "value"
      ) &&

    primitive(
      obj.value
    )
  ) {

    const key =
      obj.name.trim();


    if (key) {

      if (
        !Object.prototype
          .hasOwnProperty
          .call(
            out,
            key
          )
      ) {

        out[key] =
          obj.value;
      }


      if (prefix) {

        out[
          `${prefix}.${key}`
        ] =
          obj.value;
      }
    }


    return out;
  }


  /*
   * Property Sets:
   * Product
   * Pset MEP
   * Presentation Layers
   * Calculated Geometry Values
   * usw.
   */
  if (
    typeof obj.name ===
      "string" &&

    Array.isArray(
      obj.props
    )
  ) {

    const group =
      obj.name.trim();


    for (
      const item
      of obj.props
    ) {

      if (
        !item ||
        typeof item !==
          "object"
      ) {

        continue;
      }


      const prop =
        item as
          Record<
            string,
            unknown
          >;


      if (
        typeof prop.name !==
          "string" ||

        !Object.prototype
          .hasOwnProperty
          .call(
            prop,
            "value"
          )
      ) {

        continue;
      }


      const key =
        prop.name.trim();


      if (!key) {

        continue;
      }


      if (
        !Object.prototype
          .hasOwnProperty
          .call(
            out,
            key
          )
      ) {

        out[key] =
          prop.value;
      }


      if (group) {

        out[
          `${group}.${key}`
        ] =
          prop.value;
      }
    }
  }


  for (
    const [
      key,
      child
    ]
    of Object.entries(
      obj
    )
  ) {

    if (
      key === "props" &&
      Array.isArray(
        child
      )
    ) {

      continue;
    }


    const path =
      prefix
        ? `${prefix}.${key}`
        : key;


    if (
      child !== null &&
      typeof child ===
        "object"
    ) {

      flatten(
        child,
        path,
        out
      );
    }

    else {

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
  flat:
    Record<
      string,
      unknown
    >,

  aliases:
    string[]
): unknown {

  const entries =
    Object.entries(
      flat
    );


  /*
   * Exakte Property zuerst.
   */
  for (
    const alias
    of aliases
  ) {

    const wanted =
      norm(
        alias
      );


    const hit =
      entries.find(
        ([key]) =>
          norm(
            key
              .split(".")
              .pop()
          )
          ===
          wanted
      );


    if (hit) {

      return hit[1];
    }
  }


  /*
   * Danach Property-Pfad.
   */
  for (
    const alias
    of aliases
  ) {

    const wanted =
      norm(
        alias
      );


    const hit =
      entries.find(
        ([key]) =>
          norm(
            key
          )
            .includes(
              wanted
            )
      );


    if (hit) {

      return hit[1];
    }
  }


  return undefined;
}


function txt(
  flat:
    Record<
      string,
      unknown
    >,

  aliases:
    string[]
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
    String(
      value
    ).trim();


  return text ||
    undefined;
}


function numeric(
  value: unknown
): number | undefined {

  if (
    typeof value ===
      "number" &&

    Number.isFinite(
      value
    )
  ) {

    return value;
  }


  if (
    value === undefined ||
    value === null
  ) {

    return undefined;
  }


  const text =
    String(
      value
    )
      .trim()
      .replace(
        /\s/g,
        ""
      )
      .replace(
        ",",
        "."
      )
      .replace(
        /[^\d.+-]/g,
        ""
      );


  if (!text) {

    return undefined;
  }


  const number =
    Number.parseFloat(
      text
    );


  return Number.isFinite(
    number
  )
    ? number
    : undefined;
}


function num(
  flat:
    Record<
      string,
      unknown
    >,

  aliases:
    string[]
): number | undefined {

  return numeric(
    findValue(
      flat,
      aliases
    )
  );
}


function blob(
  flat:
    Record<
      string,
      unknown
    >
): string {

  return norm(

    Object.entries(
      flat
    )
      .map(
        (
          [
            key,
            value
          ]
        ) =>
          `${key} ${String(
            value ??
            ""
          )}`
      )
      .join(
        " "
      )
  );
}


function any(
  haystack:
    string,

  needles?:
    string[]
): boolean {

  return Boolean(
    needles
      ?.some(
        (
          item
        ) =>
          haystack
            .includes(
              norm(
                item
              )
            )
      )
  );
}


/* =========================================================
   ZENTRALE TGA / BIM BIBLIOTHEK
========================================================= */

const RULES:
  Rule[] = [

  /* -------------------------------------------------------
     LÜFTUNG / RLT
  ------------------------------------------------------- */

  {
    domain:
      "ventilation",

    type:
      "fire_damper",

    label:
      "Brandschutzklappe (BSK)",

    predefined:
      [
        "FIREDAMPER",
        "FIRESMOKEDAMPER"
      ],

    layer:
      [
        "L_BSK",
        "BSK"
      ],

    terms:
      [
        "Brandschutzklappe",
        "Brandklappe",
        "Fire Damper",
        "FK2-EU",
        "FK-EU",
        "FKRS-EU",
        "FK90",
        "FR90"
      ],

    bsdd:
      [
        "fire damper",
        "brandschutzklappe"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "volume_flow_controller",

    label:
      "Volumenstromregler (VSR)",

    layer:
      [
        "L_VSR",
        "VSR"
      ],

    terms:
      [
        "Volumenstromregler",
        "Volumenstrombegrenzer",
        "Luftmengenregler",
        "VARYCONTROL",
        "VAV",
        "CAV",
        "TVR",
        "TVJ",
        "TVZ",
        "TVE",
        "VFC"
      ],

    bsdd:
      [
        "volume flow controller",
        "air volume controller"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "silencer",

    label:
      "Schalldämpfer",

    ifc:
      [
        "IFCDUCTSILENCER"
      ],

    terms:
      [
        "Schalldämpfer",
        "Schalldaempfer",
        "Duct Silencer",
        "Silencer",
        "Sound Attenuator"
      ],

    bsdd:
      [
        "duct silencer",
        "sound attenuator"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "filter",

    label:
      "Luftfilter",

    predefined:
      [
        "FILTER"
      ],

    terms:
      [
        "Luftfilter",
        "Filterstufe",
        "Pocket Filter",
        "Bag Filter",
        "HEPA"
      ],

    bsdd:
      [
        "air filter"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "fan",

    label:
      "Ventilator",

    ifc:
      [
        "IFCFAN"
      ],

    terms:
      [
        "Ventilator",
        "Fan",
        "Radialventilator",
        "Axialventilator",
        "Dachventilator",
        "Entrauchungsventilator"
      ],

    bsdd:
      [
        "fan"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "heat_recovery",

    label:
      "Wärmerückgewinnung",

    terms:
      [
        "Wärmerückgewinnung",
        "Waermerueckgewinnung",
        "WRG",
        "Rotationswärmetauscher",
        "Heat Recovery"
      ],

    bsdd:
      [
        "heat recovery unit"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "coil",

    label:
      "Heiz-/Kühlregister",

    terms:
      [
        "Heizregister",
        "Kühlregister",
        "Kuehlregister",
        "Cooling Coil",
        "Heating Coil"
      ],

    bsdd:
      [
        "air heating coil",
        "air cooling coil"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "air_handling_unit",

    label:
      "RLT-Gerät / Luftbehandlungsgerät",

    predefined:
      [
        "AIRHANDLER"
      ],

    terms:
      [
        "RLT Gerät",
        "RLT-Gerät",
        "Luftbehandlungsgerät",
        "Air Handling Unit",
        "AHU"
      ],

    bsdd:
      [
        "air handling unit"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "grille",

    label:
      "Lüftungsgitter",

    terms:
      [
        "Lüftungsgitter",
        "Lueftungsgitter",
        "Luftgitter",
        "Wetterschutzgitter",
        "Air Grille",
        "Grille"
      ],

    bsdd:
      [
        "air grille"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "disc_valve",

    label:
      "Tellerventil",

    terms:
      [
        "Tellerventil",
        "Disc Valve"
      ],

    bsdd:
      [
        "disc valve"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "air_terminal",

    label:
      "Luftauslass",

    ifc:
      [
        "IFCAIRTERMINAL"
      ],

    terms:
      [
        "Luftauslass",
        "Drallauslass",
        "Schlitzauslass",
        "Quellauslass",
        "Diffuser",
        "Air Terminal"
      ],

    bsdd:
      [
        "air terminal",
        "diffuser"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "damper",

    label:
      "Lüftungsklappe",

    ifc:
      [
        "IFCDAMPER"
      ],

    terms:
      [
        "Jalousieklappe",
        "Absperrklappe",
        "Drosselklappe",
        "Damper",
        "Klappe"
      ],

    bsdd:
      [
        "air damper"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "duct_fitting",

    label:
      "Lüftungsformteil",

    ifc:
      [
        "IFCDUCTFITTING"
      ],

    terms:
      [
        "Kanalformteil",
        "Duct Fitting",
        "Bogen",
        "Abzweig",
        "T-Stück",
        "Übergang",
        "Reduktion",
        "Bundkragen",
        "Stutzen"
      ],

    bsdd:
      [
        "duct fitting"
      ]
  },


  {
    domain:
      "ventilation",

    type:
      "duct_segment",

    label:
      "Lüftungskanal / Lüftungsrohr",

    ifc:
      [
        "IFCDUCTSEGMENT"
      ],

    terms:
      [
        "Lüftungskanal",
        "Luftkanal",
        "Rechteckkanal",
        "Lüftungsrohr",
        "Wickelfalzrohr",
        "Spirorohr"
      ],

    bsdd:
      [
        "duct segment",
        "air duct"
      ]
  },


  /* -------------------------------------------------------
     HEIZUNG / KÄLTE / HYDRAULIK
  ------------------------------------------------------- */

  {
    domain:
      "cooling",

    type:
      "heat_pump",

    label:
      "Wärmepumpe",

    predefined:
      [
        "HEATPUMP"
      ],

    terms:
      [
        "Wärmepumpe",
        "Waermepumpe",
        "Heat Pump"
      ],

    bsdd:
      [
        "heat pump"
      ]
  },


  {
    domain:
      "cooling",

    type:
      "chiller",

    label:
      "Kältemaschine / Chiller",

    predefined:
      [
        "CHILLER"
      ],

    terms:
      [
        "Kältemaschine",
        "Kaeltemaschine",
        "Chiller",
        "Kaltwassersatz"
      ],

    bsdd:
      [
        "chiller"
      ]
  },


  {
    domain:
      "heating",

    type:
      "boiler",

    label:
      "Heizkessel / Wärmeerzeuger",

    predefined:
      [
        "BOILER"
      ],

    terms:
      [
        "Heizkessel",
        "Boiler",
        "Wärmeerzeuger"
      ],

    bsdd:
      [
        "boiler"
      ]
  },


  {
    domain:
      "generic_mep",

    type:
      "heat_exchanger",

    label:
      "Wärmetauscher",

    ifc:
      [
        "IFCHEATEXCHANGER"
      ],

    terms:
      [
        "Wärmetauscher",
        "Waermetauscher",
        "Heat Exchanger"
      ],

    bsdd:
      [
        "heat exchanger"
      ]
  },


  {
    domain:
      "heating",

    type:
      "radiator",

    label:
      "Heizkörper / Wärmeabgabegerät",

    terms:
      [
        "Heizkörper",
        "Radiator",
        "Konvektor",
        "Deckenstrahlplatte"
      ],

    bsdd:
      [
        "radiator"
      ]
  },


  {
    domain:
      "generic_mep",

    type:
      "pump",

    label:
      "Pumpe",

    ifc:
      [
        "IFCPUMP"
      ],

    terms:
      [
        "Pumpe",
        "Pump",
        "Umwälzpumpe",
        "Zirkulationspumpe"
      ],

    bsdd:
      [
        "pump"
      ]
  },


  {
    domain:
      "generic_mep",

    type:
      "valve",

    label:
      "Armatur / Ventil",

    ifc:
      [
        "IFCVALVE"
      ],

    terms:
      [
        "Ventil",
        "Valve",
        "Absperrventil",
        "Regelventil",
        "Kugelhahn",
        "Schieber",
        "Rückschlagventil"
      ],

    bsdd:
      [
        "valve"
      ]
  },


  {
    domain:
      "generic_mep",

    type:
      "tank",

    label:
      "Behälter / Speicher",

    ifc:
      [
        "IFCTANK"
      ],

    terms:
      [
        "Pufferspeicher",
        "Speicher",
        "Tank",
        "Behälter",
        "Ausdehnungsgefäß"
      ],

    bsdd:
      [
        "tank",
        "storage vessel"
      ]
  },


  {
    domain:
      "generic_mep",

    type:
      "pipe_fitting",

    label:
      "Rohrformteil",

    ifc:
      [
        "IFCPIPEFITTING"
      ],

    terms:
      [
        "Rohrformteil",
        "Pipe Fitting",
        "Rohrbogen",
        "Rohrabzweig"
      ],

    bsdd:
      [
        "pipe fitting"
      ]
  },


  {
    domain:
      "generic_mep",

    type:
      "pipe_segment",

    label:
      "Rohrleitung",

    ifc:
      [
        "IFCPIPESEGMENT"
      ],

    terms:
      [
        "Rohrleitung",
        "Pipe Segment"
      ],

    bsdd:
      [
        "pipe segment"
      ]
  },


  /* -------------------------------------------------------
     SANITÄR
  ------------------------------------------------------- */

  {
    domain:
      "plumbing",

    type:
      "water_heater",

    label:
      "Trinkwassererwärmer",

    terms:
      [
        "Trinkwassererwärmer",
        "Warmwasserbereiter",
        "Water Heater",
        "Durchlauferhitzer"
      ],

    bsdd:
      [
        "water heater"
      ]
  },


  {
    domain:
      "plumbing",

    type:
      "sanitary_terminal",

    label:
      "Sanitärobjekt",

    ifc:
      [
        "IFCSANITARYTERMINAL"
      ],

    terms:
      [
        "Waschtisch",
        "Urinal",
        "Dusche",
        "Badewanne",
        "Spüle",
        "Sanitary Terminal"
      ],

    bsdd:
      [
        "sanitary terminal",
        "sanitary appliance"
      ]
  },


  {
    domain:
      "plumbing",

    type:
      "waste_terminal",

    label:
      "Entwässerungsablauf",

    ifc:
      [
        "IFCWASTETERMINAL"
      ],

    terms:
      [
        "Bodenablauf",
        "Dachablauf",
        "Gully",
        "Waste Terminal"
      ],

    bsdd:
      [
        "waste terminal",
        "floor drain"
      ]
  },


  {
    domain:
      "plumbing",

    type:
      "interceptor",

    label:
      "Abscheider",

    ifc:
      [
        "IFCINTERCEPTOR"
      ],

    terms:
      [
        "Fettabscheider",
        "Ölabscheider",
        "Interceptor"
      ],

    bsdd:
      [
        "interceptor",
        "separator"
      ]
  },


  /* -------------------------------------------------------
     MSR / GEBÄUDEAUTOMATION
  ------------------------------------------------------- */

  {
    domain:
      "automation",

    type:
      "sensor",

    label:
      "Sensor / Messfühler",

    ifc:
      [
        "IFCSENSOR"
      ],

    terms:
      [
        "Sensor",
        "Fühler",
        "Temperaturfühler",
        "Druckfühler",
        "Feuchtefühler",
        "CO2 Sensor"
      ],

    bsdd:
      [
        "sensor"
      ]
  },


  {
    domain:
      "automation",

    type:
      "actuator",

    label:
      "Stellantrieb / Aktor",

    ifc:
      [
        "IFCACTUATOR"
      ],

    terms:
      [
        "Stellantrieb",
        "Aktor",
        "Actuator",
        "Klappenantrieb",
        "Ventilantrieb"
      ],

    bsdd:
      [
        "actuator"
      ]
  },


  {
    domain:
      "automation",

    type:
      "controller",

    label:
      "Regler / Controller",

    ifc:
      [
        "IFCCONTROLLER"
      ],

    terms:
      [
        "Regler",
        "Controller",
        "DDC",
        "Automationsstation"
      ],

    bsdd:
      [
        "controller"
      ]
  },


  {
    domain:
      "automation",

    type:
      "meter",

    label:
      "Messgerät / Zähler",

    ifc:
      [
        "IFCFLOWMETER"
      ],

    terms:
      [
        "Zähler",
        "Meter",
        "Wärmemengenzähler",
        "Wasserzähler"
      ],

    bsdd:
      [
        "flow meter",
        "meter"
      ]
  },


  /* -------------------------------------------------------
     ELEKTRO
  ------------------------------------------------------- */

  {
    domain:
      "electrical",

    type:
      "distribution_board",

    label:
      "Elektroverteilung",

    ifc:
      [
        "IFCELECTRICDISTRIBUTIONBOARD"
      ],

    terms:
      [
        "Unterverteilung",
        "Hauptverteilung",
        "Schaltschrank",
        "Distribution Board"
      ],

    bsdd:
      [
        "distribution board"
      ]
  },


  {
    domain:
      "electrical",

    type:
      "protective_device",

    label:
      "Schutzgerät",

    ifc:
      [
        "IFCPROTECTIVEDEVICE"
      ],

    terms:
      [
        "Leitungsschutzschalter",
        "FI-Schalter",
        "RCD",
        "Protective Device"
      ],

    bsdd:
      [
        "protective device"
      ]
  },


  {
    domain:
      "electrical",

    type:
      "switching_device",

    label:
      "Schaltgerät",

    ifc:
      [
        "IFCSWITCHINGDEVICE"
      ],

    terms:
      [
        "Schalter",
        "Schütz",
        "Switching Device"
      ],

    bsdd:
      [
        "switching device"
      ]
  },


  {
    domain:
      "electrical",

    type:
      "outlet",

    label:
      "Steckdose / Anschluss",

    ifc:
      [
        "IFCOUTLET"
      ],

    terms:
      [
        "Steckdose",
        "Outlet"
      ],

    bsdd:
      [
        "electrical outlet"
      ]
  },


  {
    domain:
      "electrical",

    type:
      "light_fixture",

    label:
      "Leuchte",

    ifc:
      [
        "IFCLIGHTFIXTURE"
      ],

    terms:
      [
        "Leuchte",
        "Light Fixture",
        "Luminaire"
      ],

    bsdd:
      [
        "light fixture",
        "luminaire"
      ]
  },


  {
    domain:
      "electrical",

    type:
      "transformer",

    label:
      "Transformator",

    ifc:
      [
        "IFCTRANSFORMER"
      ],

    terms:
      [
        "Transformator",
        "Transformer"
      ],

    bsdd:
      [
        "transformer"
      ]
  },


  {
    domain:
      "electrical",

    type:
      "electric_motor",

    label:
      "Elektromotor",

    ifc:
      [
        "IFCELECTRICMOTOR"
      ],

    terms:
      [
        "Elektromotor",
        "Electric Motor"
      ],

    bsdd:
      [
        "electric motor"
      ]
  },


  {
    domain:
      "electrical",

    type:
      "communications_appliance",

    label:
      "Kommunikationsgerät",

    ifc:
      [
        "IFCCOMMUNICATIONSAPPLIANCE"
      ],

    terms:
      [
        "Kommunikationsgerät",
        "Communications Appliance"
      ],

    bsdd:
      [
        "communications appliance"
      ]
  },


  {
    domain:
      "electrical",

    type:
      "cable_carrier",

    label:
      "Kabeltrasse / Kabeltragsystem",

    ifc:
      [
        "IFCCABLECARRIERSEGMENT",
        "IFCCABLECARRIERFITTING"
      ],

    terms:
      [
        "Kabeltrasse",
        "Kabelrinne",
        "Kabelleiter",
        "Cable Carrier",
        "Cable Tray"
      ],

    bsdd:
      [
        "cable tray",
        "cable carrier"
      ]
  },


  {
    domain:
      "electrical",

    type:
      "cable_segment",

    label:
      "Kabel / Leitung",

    ifc:
      [
        "IFCCABLESEGMENT"
      ],

    terms:
      [
        "Kabel",
        "Cable Segment"
      ],

    bsdd:
      [
        "cable segment"
      ]
  },


  /* -------------------------------------------------------
     DÄMMUNG
  ------------------------------------------------------- */

  {
    domain:
      "generic_mep",

    type:
      "insulation",

    label:
      "Dämmung / Isolierung",

    ifc:
      [
        "IFCCOVERING"
      ],

    terms:
      [
        "Dämmung",
        "Daemmung",
        "Isolierung",
        "Insulation",
        "Armaflex",
        "Kaiflex",
        "K-Flex"
      ],

    bsdd:
      [
        "insulation"
      ]
  }
];


/* =========================================================
   KLASSIFIZIERUNG
========================================================= */

function classify(
  flat:
    Record<
      string,
      unknown
    >
): {

  domain:
    TgaDomain;

  type:
    TgaComponentType;

  label:
    string;

  confidence:
    "high" |
    "medium" |
    "low";

  matchedBy:
    string[];

  bsdd:
    string[];

} {

  const ifc =
    norm(
      txt(
        flat,
        [
          "class",
          "Common Type",
          "CommonType",
          "IfcType",
          "EntityType"
        ]
      )
    );


  const predefined =
    norm(
      txt(
        flat,
        [
          "PredefinedType",
          "Predefined Type"
        ]
      )
    );


  const layer =
    norm(
      txt(
        flat,
        [
          "Layer",
          "Presentation Layer",
          "PresentationLayer"
        ]
      )
    );


  const everything =
    blob(
      flat
    );


  for (
    const rule
    of RULES
  ) {

    const hitIfc =
      any(
        ifc,
        rule.ifc
      );


    const hitPredefined =
      any(
        predefined,
        rule.predefined
      );


    const hitLayer =
      any(
        layer,
        rule.layer
      );


    const hitTerms =
      any(
        everything,
        rule.terms
      );


    if (
      hitIfc ||
      hitPredefined ||
      hitLayer ||
      hitTerms
    ) {

      const matchedBy:
        string[] = [];


      if (
        hitIfc
      ) {

        matchedBy.push(
          "IFC-Klasse"
        );
      }


      if (
        hitPredefined
      ) {

        matchedBy.push(
          "PredefinedType"
        );
      }


      if (
        hitLayer
      ) {

        matchedBy.push(
          "Layer"
        );
      }


      if (
        hitTerms
      ) {

        matchedBy.push(
          "Produkt-/Property-Daten"
        );
      }


      return {

        domain:
          rule.domain,

        type:
          rule.type,

        label:
          rule.label,

        confidence:
          (
            hitIfc ||
            hitPredefined ||
            hitLayer
          )
            ? "high"
            : "medium",

        matchedBy,

        bsdd:
          rule.bsdd ||
          []
      };
    }
  }


  /*
   * Generische IFC-Fallbacks
   */

  if (
    ifc.includes(
      "flowcontroller"
    )
  ) {

    return {

      domain:
        "generic_mep",

      type:
        "flow_controller_generic",

      label:
        "Strömungs-/Regelbauteil",

      confidence:
        "low",

      matchedBy:
        [
          "IFCFlowController"
        ],

      bsdd:
        []
    };
  }


  if (
    ifc.includes(
      "flowterminal"
    )
  ) {

    return {

      domain:
        "generic_mep",

      type:
        "flow_terminal_generic",

      label:
        "TGA-Endgerät",

      confidence:
        "low",

      matchedBy:
        [
          "IfcFlowTerminal"
        ],

      bsdd:
        []
    };
  }


  if (
    ifc.includes(
      "flowmovingdevice"
    )
  ) {

    return {

      domain:
        "generic_mep",

      type:
        "flow_moving_device_generic",

      label:
        "Förder-/Strömungsmaschine",

      confidence:
        "low",

      matchedBy:
        [
          "IfcFlowMovingDevice"
        ],

      bsdd:
        []
    };
  }


  if (
    ifc.includes(
      "flowtreatmentdevice"
    )
  ) {

    return {

      domain:
        "generic_mep",

      type:
        "flow_treatment_device_generic",

      label:
        "TGA-Behandlungsbauteil",

      confidence:
        "low",

      matchedBy:
        [
          "IfcFlowTreatmentDevice"
        ],

      bsdd:
        []
    };
  }


  if (
    ifc.includes(
      "energyconversiondevice"
    )
  ) {

    return {

      domain:
        "generic_mep",

      type:
        "energy_conversion_device_generic",

      label:
        "Energieumwandlungsgerät",

      confidence:
        "low",

      matchedBy:
        [
          "IfcEnergyConversionDevice"
        ],

      bsdd:
        []
    };
  }


  return {

    domain:
      "unknown",

    type:
      "unknown",

    label:
      "Nicht eindeutig erkannt",

    confidence:
      "low",

    matchedBy:
      [],

    bsdd:
      []
  };
}


/* =========================================================
   ABMESSUNGEN
========================================================= */

function dimensions(
  flat:
    Record<
      string,
      unknown
    >
) {

  let widthMm =
    num(
      flat,
      [
        "Geom-Side 1 (mm)",
        "Geom-Side 1",
        "Width_mm",
        "Width",
        "Breite",
        "Duct Width"
      ]
    );


  let heightMm =
    num(
      flat,
      [
        "Geom-Side 2 (mm)",
        "Geom-Side 2",
        "Height_mm",
        "Height",
        "Höhe",
        "Hoehe",
        "Duct Height"
      ]
    );


  let diameterMm =
    num(
      flat,
      [
        "Geom-Diameter (mm)",
        "Geom-Diameter",
        "Diameter_mm",
        "Diameter",
        "Durchmesser",
        "Nominal Diameter",
        "DN"
      ]
    );


  const raw =
    txt(
      flat,
      [
        "ConnectionSize_mm",
        "ConnectionSize",
        "Connection Size",
        "NominalSize",
        "Nominal Size",
        "DuctSize",
        "Duct Size",
        "Dimension",
        "Dimensions",
        "Abmessung",
        "Abmessungen",
        "Size"
      ]
    );


  if (raw) {

    const text =
      raw
        .replace(
          ",",
          "."
        )
        .replace(
          /×/g,
          "x"
        )
        .replace(
          /\//g,
          "x"
        );


    const round =
      text.match(
        /(?:ø|⌀|dn\s*)\s*(\d+(?:\.\d+)?)/i
      );


    if (
      round &&
      diameterMm ===
        undefined
    ) {

      diameterMm =
        Number(
          round[1]
        );
    }


    const rectangle =
      text.match(
        /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i
      );


    if (
      rectangle
    ) {

      if (
        widthMm ===
          undefined
      ) {

        widthMm =
          Number(
            rectangle[1]
          );
      }


      if (
        heightMm ===
          undefined
      ) {

        heightMm =
          Number(
            rectangle[2]
          );
      }
    }
  }


  if (
    widthMm !==
      undefined &&

    heightMm !==
      undefined
  ) {

    return {

      shape:
        "rectangular" as const,

      widthMm,

      heightMm
    };
  }


  if (
    diameterMm !==
      undefined
  ) {

    return {

      shape:
        "round" as const,

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
   VDI 3805 BEREICH
========================================================= */

function vdiScope(
  domain:
    TgaDomain
): string | undefined {

  const map:
    Partial<
      Record<
        TgaDomain,
        string
      >
    > = {

    ventilation:
      "VDI 3805 – Raumlufttechnik",

    heating:
      "VDI 3805 – Heiztechnik",

    cooling:
      "VDI 3805 – Kälte-/Wärmepumpentechnik",

    plumbing:
      "VDI 3805 – Sanitärtechnik",

    automation:
      "VDI 3805 – Gebäudeautomation",

    electrical:
      "VDI 3805 – Elektrotechnik"
  };


  return map[
    domain
  ];
}


/* =========================================================
   LOKALE ANALYSE
========================================================= */

function analyzeLocal(
  input:
    unknown
): {

  analysis:
    TgaAnalysis;

  bsddTerms:
    string[];

} {

  const flat =
    flatten(
      input
    );


  const classification =
    classify(
      flat
    );


  const dimension =
    dimensions(
      flat
    );


  const ifcType =
    txt(
      flat,
      [
        "class",
        "Common Type",
        "CommonType",
        "IfcType",
        "EntityType"
      ]
    );


  const predefinedType =
    txt(
      flat,
      [
        "PredefinedType",
        "Predefined Type"
      ]
    );


  const guid =
    txt(
      flat,
      [
        "GUID (IFC)",
        "GUID IFC",
        "externalId",
        "GlobalId",
        "IfcGuid",
        "GUID"
      ]
    );


  const runtimeId =
    num(
      flat,
      [
        "runtimeId",
        "RuntimeId"
      ]
    );


  const name =
    txt(
      flat,
      [
        "Product Name",
        "ProductName",
        "Name"
      ]
    );


  const description =
    txt(
      flat,
      [
        "Product Description",
        "Description"
      ]
    );


  const objectType =
    txt(
      flat,
      [
        "Product Object Type",
        "ObjectType"
      ]
    );


  const manufacturer =
    txt(
      flat,
      [
        "Fabrikat",
        "Manufacturer",
        "Hersteller",
        "Manufacturer Name",
        "Product Manufacturer"
      ]
    );


  const productType =
    txt(
      flat,
      [
        "Product Type",
        "Type Name",
        "Typ",
        "Type"
      ]
    );


  const tag =
    txt(
      flat,
      [
        "Tag",
        "Kennzeichen",
        "Bauteilkennzeichen"
      ]
    );


  const layer =
    txt(
      flat,
      [
        "Layer",
        "Presentation Layer",
        "PresentationLayer"
      ]
    );


  const modelName =
    txt(
      flat,
      [
        "modelName",
        "ModelName",
        "File Name"
      ]
    );


  const system =
    txt(
      flat,
      [
        "Tech-Medium",
        "Tech Medium",
        "System",
        "SystemName",
        "System Name",
        "DistributionSystem",
        "SystemClassification",
        "Anlage",
        "Anlagenkennzeichen",
        "MagiCADSystem"
      ]
    );


  const storey =
    txt(
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

    num(
      flat,
      [
        "Geom-Length (mm)",
        "Geom-Length",
        "Length_mm",
        "Length mm",
        "Laenge_mm",
        "Länge_mm",
        "DuctLength_mm",
        "PipeLength_mm"
      ]
    )

    ??

    num(
      flat,
      [
        "Length",
        "Laenge",
        "Länge"
      ]
    );


  const insulationMm =
    num(
      flat,
      [
        "Insulation_thickness_mm",
        "InsulationThickness",
        "Insulation Thickness",
        "Insulation_mm",
        "Daemmstaerke",
        "Dämmstärke",
        "Daemmung_mm",
        "Dämmung_mm"
      ]
    );


  let airflowLs =
    num(
      flat,
      [
        "qv_SizingFlow_ls",
        "SizingFlow_ls",
        "AirFlow_ls",
        "Flow_l_s",
        "Volumenstrom_l_s",
        "Volumenstrom_ls",
        "Volume Flow l/s",
        "Calc-Volume flow (l/s)"
      ]
    );


  let airflowM3h =
    num(
      flat,
      [
        "qv_SizingFlow_m3h",
        "SizingFlow_m3h",
        "AirFlow_m3h",
        "Flow_m3h",
        "Volumenstrom_m3h",
        "Volume Flow m3/h",
        "Calc-Volume flow (m3/h)"
      ]
    );


  if (
    airflowLs !==
      undefined &&

    airflowM3h ===
      undefined
  ) {

    airflowM3h =
      airflowLs *
      3.6;
  }


  if (
    airflowM3h !==
      undefined &&

    airflowLs ===
      undefined
  ) {

    airflowLs =
      airflowM3h /
      3.6;
  }


  const pressureLossPa =
    num(
      flat,
      [
        "Calc-Pressure loss (Pa)",
        "Pressure loss (Pa)",
        "Pressure Loss",
        "Druckverlust",
        "Druckverlust (Pa)"
      ]
    );


  const zeta =
    num(
      flat,
      [
        "Calc-Zeta",
        "Zeta",
        "ζ"
      ]
    );


  let areaM2:
    number |
    undefined;


  if (
    dimension.shape ===
      "rectangular" &&

    dimension.widthMm !==
      undefined &&

    dimension.heightMm !==
      undefined
  ) {

    areaM2 =

      (
        dimension.widthMm /
        1000
      )

      *

      (
        dimension.heightMm /
        1000
      );
  }


  if (
    dimension.shape ===
      "round" &&

    dimension.diameterMm !==
      undefined
  ) {

    const diameter =
      dimension.diameterMm /
      1000;


    areaM2 =

      Math.PI
      *
      diameter
      *
      diameter
      /
      4;
  }


  const velocityMs =

    areaM2 &&
    airflowLs !==
      undefined

      ? (
          airflowLs /
          1000
        )
        /
        areaM2

      : undefined;


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


  if (
    classification.type ===
      "duct_segment"
  ) {

    if (
      dimension.shape ===
        "rectangular" &&

      lengthMm !==
        undefined &&

      dimension.widthMm !==
        undefined &&

      dimension.heightMm !==
        undefined
    ) {

      quantityUnit =
        "m²";


      quantity =

        2

        *

        (
          dimension.widthMm /
          1000

          +

          dimension.heightMm /
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
      dimension.shape ===
        "round" &&

      lengthMm !==
        undefined
    ) {

      quantityUnit =
        "m";


      quantity =
        lengthMm /
        1000;


      quantityNote =
        "Rundrohr: Abrechnung nach Länge.";
    }
  }


  else if (
    classification.type ===
      "pipe_segment" ||

    classification.type ===
      "cable_segment"
  ) {

    if (
      lengthMm !==
        undefined
    ) {

      quantityUnit =
        "m";


      quantity =
        lengthMm /
        1000;


      quantityNote =
        "Linienbauteil: Länge.";
    }
  }


  else if (
    classification.type ===
      "duct_fitting"
  ) {

    if (
      dimension.shape ===
        "round"
    ) {

      quantityUnit =
        "St.";


      quantity =
        1;


      quantityNote =
        "Rund-Rohrformteil: Stück.";
    }

    else {

      quantityUnit =
        "m²";


      quantityNote =
        "Rechteck-Kanalformteil: äußere Oberfläche; exakte Menge benötigt Formteilgeometrie.";
    }
  }


  else if (
    classification.type ===
      "insulation"
  ) {

    quantityUnit =
      "m²";


    quantityNote =
      "Dämmung/Isolierung: Fläche abhängig von Host-Geometrie.";
  }


  else if (
    classification.type !==
      "unknown"
  ) {

    quantityUnit =
      "St.";


    quantity =
      1;


    quantityNote =
      "Bauteil: Stück.";
  }


  const fallbackTerms =

    [
      productType,
      name,
      description,
      manufacturer
    ]
      .filter(
        (
          value
        ):
          value is string =>
            Boolean(
              value &&
              value.trim()
            )
      )
      .slice(
        0,
        2
      );


  const bsddTerms =

    Array.from(
      new Set(
        [
          ...classification.bsdd,
          ...fallbackTerms
        ]
      )
    )
      .slice(
        0,
        2
      );


  return {

    bsddTerms,

    analysis: {

      domain:
        classification.domain,

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

      manufacturer,

      productType,

      tag,

      layer,

      modelName,

      system,

      storey,

      ...dimension,

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

      vdi3805Scope:
        vdiScope(
          classification.domain
        ),

      bimStatus:
        "local-only",

      rawProperties:
        flat
    }
  };
}


/* =========================================================
   bSDD / ETIM LIVE ENRICHMENT
========================================================= */

const BSDD_API =
  "https://api.bsdd.buildingsmart.org";


const bsddCache =
  new Map<
    string,
    {
      expires:
        number;

      value:
        BsddClassMatch[];
    }
  >();


function bsddScore(
  item:
    BsddClassMatch,

  analysis:
    TgaAnalysis,

  query:
    string
): number {

  let score =
    0;


  const normalizedQuery =
    norm(
      query
    );


  const normalizedName =
    norm(
      item.name
    );


  const normalizedDescription =
    norm(
      item.description
    );


  const dictionary =
    norm(
      `${item.dictionaryName ?? ""} ${item.dictionaryUri ?? ""}`
    );


  if (
    normalizedName ===
    normalizedQuery
  ) {

    score +=
      50;
  }

  else if (
    normalizedName
      .includes(
        normalizedQuery
      ) ||

    normalizedQuery
      .includes(
        normalizedName
      )
  ) {

    score +=
      30;
  }


  if (
    normalizedDescription
      .includes(
        normalizedQuery
      )
  ) {

    score +=
      10;
  }


  if (
    dictionary.includes(
      "etim"
    )
  ) {

    score +=
      25;
  }


  if (
    dictionary.includes(
      "ifc"
    ) ||

    dictionary.includes(
      "buildingsmart"
    )
  ) {

    score +=
      10;
  }


  const localIfc =
    norm(
      analysis.ifcType
    );


  if (
    localIfc &&

    item
      .relatedIfcEntityNames
      ?.some(
        (
          ifc
        ) =>
          norm(
            ifc
          ) ===
          localIfc
      )
  ) {

    score +=
      35;
  }


  return score;
}


async function searchBsdd(
  query:
    string,

  analysis:
    TgaAnalysis
): Promise<BsddClassMatch[]> {

  const cacheKey =
    `${query}|${analysis.ifcType ?? ""}`;


  const cached =
    bsddCache.get(
      cacheKey
    );


  if (
    cached &&
    cached.expires >
      Date.now()
  ) {

    return cached.value;
  }


  const url =
    new URL(
      "/api/Class/Search/v1",
      BSDD_API
    );


  url.searchParams.set(
    "SearchText",
    query
  );


  url.searchParams.set(
    "Limit",
    "20"
  );


  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      3500
    );


  try {

    const response =
      await fetch(
        url,
        {

          headers: {

            Accept:
              "application/json",

            "X-User-Agent":
              "AgentEyes/2.0"
          },

          signal:
            controller.signal
        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        `bSDD HTTP ${response.status}`
      );
    }


    const payload =
      await response.json()
      as
        Record<
          string,
          unknown
        >;


    const classes =
      Array.isArray(
        payload.classes
      )
        ? payload.classes
        : [];


    const items =

      classes

        .filter(
          (
            value
          ):
            value is
              Record<
                string,
                unknown
              > =>
                Boolean(
                  value &&
                  typeof value ===
                    "object"
                )
        )

        .map(
          (
            value
          ) => {

            const item:
              BsddClassMatch = {

              name:
                typeof value.name ===
                  "string"
                  ? value.name
                  : undefined,

              referenceCode:
                typeof value.referenceCode ===
                  "string"
                  ? value.referenceCode
                  : undefined,

              uri:
                typeof value.uri ===
                  "string"
                  ? value.uri
                  : undefined,

              description:
                typeof value.description ===
                  "string"
                  ? value.description
                  : undefined,

              dictionaryName:
                typeof value.dictionaryName ===
                  "string"
                  ? value.dictionaryName
                  : undefined,

              dictionaryUri:
                typeof value.dictionaryUri ===
                  "string"
                  ? value.dictionaryUri
                  : undefined,

              relatedIfcEntityNames:
                Array.isArray(
                  value.relatedIfcEntityNames
                )
                  ? value
                      .relatedIfcEntityNames
                      .filter(
                        (
                          ifc
                        ):
                          ifc is string =>
                            typeof ifc ===
                              "string"
                      )
                  : undefined,

              score:
                0
            };


            item.score =
              bsddScore(
                item,
                analysis,
                query
              );


            return item;
          }
        )

        .sort(
          (
            a,
            b
          ) =>
            b.score -
            a.score
        )

        .slice(
          0,
          8
        );


    bsddCache.set(
      cacheKey,
      {

        expires:
          Date.now()
          +
          6
          *
          60
          *
          60
          *
          1000,

        value:
          items
      }
    );


    return items;
  }

  finally {

    clearTimeout(
      timer
    );
  }
}


/* =========================================================
   bSDD KANN GENERISCHE IFC OBJEKTE HOCHSTUFEN
========================================================= */

function upgradeFromBsdd(
  analysis:
    TgaAnalysis,

  matches:
    BsddClassMatch[]
): TgaAnalysis {

  if (
    analysis.confidence !==
      "low" ||

    !matches.length
  ) {

    return analysis;
  }


  const classificationText =
    norm(

      matches
        .slice(
          0,
          3
        )
        .map(
          (
            item
          ) =>
            `${item.name ?? ""} ${item.description ?? ""}`
        )
        .join(
          " "
        )
    );


  const rule =
    RULES.find(
      (
        candidate
      ) =>

        (
          candidate.bsdd ||
          []
        )
          .some(
            (
              term
            ) =>
              classificationText
                .includes(
                  norm(
                    term
                  )
                )
          )
    );


  if (!rule) {

    return analysis;
  }


  return {

    ...analysis,

    domain:
      rule.domain,

    type:
      rule.type,

    label:
      rule.label,

    confidence:
      "medium",

    matchedBy:
      [
        ...analysis.matchedBy,
        "bSDD/ETIM"
      ],

    vdi3805Scope:
      vdiScope(
        rule.domain
      )
  };
}


/* =========================================================
   ENRICHMENT EINES BAUTEILS
========================================================= */

async function enrich(
  local: {

    analysis:
      TgaAnalysis;

    bsddTerms:
      string[];
  }
): Promise<TgaAnalysis> {

  const analysis =
    local.analysis;


  if (
    !local.bsddTerms.length
  ) {

    return analysis;
  }


  try {

    const searches =
      await Promise.allSettled(

        local.bsddTerms
          .map(
            (
              term
            ) =>
              searchBsdd(
                term,
                analysis
              )
          )
      );


    const allMatches =

      searches
        .flatMap(
          (
            result
          ) =>
            result.status ===
              "fulfilled"
              ? result.value
              : []
        )
        .sort(
          (
            a,
            b
          ) =>
            b.score -
            a.score
        );


    const unique =

      Array.from(

        new Map(

          allMatches
            .filter(
              (
                item
              ) =>
                item.uri
            )
            .map(
              (
                item
              ) =>
                [
                  item.uri!,
                  item
                ]
            )
        )
        .values()
      )

      .slice(
        0,
        6
      );


    const etim =

      unique
        .filter(
          (
            item
          ) =>
            norm(
              `${item.dictionaryName ?? ""} ${item.dictionaryUri ?? ""}`
            )
              .includes(
                "etim"
              )
        )
        .slice(
          0,
          3
        );


    const upgraded =
      upgradeFromBsdd(

        analysis,

        etim.length
          ? etim
          : unique
      );


    return {

      ...upgraded,

      bsddMatches:
        unique,

      etimMatches:
        etim,

      bimStatus:
        unique.length
          ? "bsdd-enriched"
          : "local-only"
    };
  }

  catch {

    return {

      ...analysis,

      bimStatus:
        "bsdd-unavailable"
    };
  }
}


/* =========================================================
   AUSWAHL ANALYSIEREN
========================================================= */

export async function analyzeTgaSelection(
  selection:
    unknown[]
): Promise<TgaAnalysis[]> {

  const locals:
    {
      analysis:
        TgaAnalysis;

      bsddTerms:
        string[];
    }[] = [];


  for (
    const entryValue
    of selection ||
    []
  ) {

    if (
      entryValue &&
      typeof entryValue ===
        "object"
    ) {

      const entry =
        entryValue as
          Record<
            string,
            unknown
          >;


      const properties =
        Array.isArray(
          entry.properties
        )
          ? entry.properties
          : [];


      if (
        properties.length
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


          locals.push(
            analyzeLocal(
              merged
            )
          );
        }


        continue;
      }
    }


    locals.push(
      analyzeLocal(
        entryValue
      )
    );
  }


  /*
   * Live-bSDD nur für die ersten 6 ausgewählten Objekte.
   * Dadurch wird eine große Mehrfachauswahl nicht mit
   * Dutzenden API-Aufrufen blockiert.
   *
   * Alle weiteren Objekte werden trotzdem lokal analysiert.
   */
  const head =
    locals.slice(
      0,
      6
    );


  const tail =
    locals
      .slice(
        6
      )
      .map(
        (
          item
        ) =>
          item.analysis
      );


  return [

    ...(
      await Promise.all(
        head.map(
          enrich
        )
      )
    ),

    ...tail
  ];
}
