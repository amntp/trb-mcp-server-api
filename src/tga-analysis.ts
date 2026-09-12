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

  rawProperties:
    Record<string, unknown>;
}


/* =========================================================
   NORMALISIERUNG
========================================================= */

function n(
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
      /[_\-\/]+/g,
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
   PROPERTY FLATTENING
========================================================= */

function flatten(
  value: unknown,
  prefix = "",
  out: Record<string, unknown> = {}
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
            ? \`\${prefix}.\${index}\`
            : String(index),
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
      String(
        obj.name
      ).trim();


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
          \`\${prefix}.\${key}\`
        ] =
          obj.value;
      }
    }


    return out;
  }


  if (
    typeof obj.name ===
      "string" &&
    Array.isArray(
      obj.props
    )
  ) {

    const groupName =
      String(
        obj.name
      ).trim();


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
        String(
          prop.name
        ).trim();


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


      if (
        groupName
      ) {

        out[
          \`\${groupName}.\${key}\`
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
        ? \`\${prefix}.\${key}\`
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

function find(
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


  for (
    const alias
    of aliases
  ) {

    const wanted =
      n(alias);


    const result =
      entries.find(
        ([key]) =>
          n(
            key
              .split(".")
              .pop()
          ) ===
          wanted
      );


    if (result) {

      return result[1];
    }
  }


  for (
    const alias
    of aliases
  ) {

    const wanted =
      n(alias);


    const result =
      entries.find(
        ([key]) =>
          n(key)
            .includes(
              wanted
            )
      );


    if (result) {

      return result[1];
    }
  }


  return undefined;
}


function text(
  flat:
    Record<
      string,
      unknown
    >,
  aliases:
    string[]
): string | undefined {

  const value =
    find(
      flat,
      aliases
    );


  if (
    value === undefined ||
    value === null
  ) {

    return undefined;
  }


  const s =
    String(
      value
    ).trim();


  return s ||
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


  const s =
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


  if (!s) {

    return undefined;
  }


  const v =
    Number.parseFloat(
      s
    );


  return Number.isFinite(
    v
  )
    ? v
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
    find(
      flat,
      aliases
    )
  );
}


function allText(
  flat:
    Record<
      string,
      unknown
    >
): string {

  return n(
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
          \`\${key} \${String(
            value ??
            ""
          )}\`
      )
      .join(" ")
  );
}


function has(
  value: string,
  terms: string[]
): boolean {

  return terms.some(
    (
      term
    ) =>
      value.includes(
        n(term)
      )
  );
}


/* =========================================================
   DIMENSIONS
========================================================= */

function parseDimensions(
  flat:
    Record<
      string,
      unknown
    >
): {

  shape?:
    "rectangular" |
    "round";

  widthMm?:
    number;

  heightMm?:
    number;

  diameterMm?:
    number;

} {

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
    text(
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

    const size =
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
      size.match(
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


    const rect =
      size.match(
        /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i
      );


    if (rect) {

      if (
        widthMm ===
          undefined
      ) {

        widthMm =
          Number(
            rect[1]
          );
      }


      if (
        heightMm ===
          undefined
      ) {

        heightMm =
          Number(
            rect[2]
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
        "rectangular",

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
        "round",

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
   CLASSIFICATION
========================================================= */

function classify(
  flat:
    Record<
      string,
      unknown
    >
) {

  const ifcType =
    n(
      text(
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
    n(
      text(
        flat,
        [
          "PredefinedType"
        ]
      )
    );


  const layer =
    n(
      text(
        flat,
        [
          "Layer",
          "Presentation Layer",
          "PresentationLayer"
        ]
      )
    );


  const name =
    n(
      text(
        flat,
        [
          "Product Name",
          "ProductName",
          "Name"
        ]
      )
    );


  const description =
    n(
      text(
        flat,
        [
          "Product Description",
          "Description"
        ]
      )
    );


  const objectType =
    n(
      text(
        flat,
        [
          "Product Object Type",
          "ObjectType"
        ]
      )
    );


  const manufacturer =
    n(
      text(
        flat,
        [
          "Fabrikat",
          "Manufacturer",
          "Hersteller",
          "Manufacturer Name",
          "Product Manufacturer"
        ]
      )
    );


  const everything =
    [
      allText(
        flat
      ),
      layer,
      name,
      description,
      objectType,
      manufacturer
    ]
      .join(
        " "
      );


  const result =
    (
      type:
        TgaComponentType,

      label:
        string,

      reason:
        string,

      confidence:
        "high" |
        "medium" |
        "low" =
          "high"
    ) => ({

      type,

      label,

      confidence,

      matchedBy:
        [
          reason
        ]
    });


  /* =====================================================
     BSK
  ===================================================== */

  if (
    has(
      layer,
      [
        "L_BSK",
        "BSK",
        "Brandschutz"
      ]
    )
    ||
    has(
      everything,
      [
        "Brandschutzklappe",
        "Brandschutz Klappe",
        "Brandklappe",
        "Fire Damper",
        "Fire Smoke Damper",
        "Firedamper",
        "FK2-EU",
        "FK2 EU",
        "FK-EU",
        "FKRS-EU",
        "FKRS EU",
        "FK90",
        "FR90"
      ]
    )
    ||
    predefined.includes(
      "firedamper"
    )
  ) {

    return result(
      "fire_damper",
      "Brandschutzklappe (BSK)",
      layer.includes(
        "bsk"
      )
        ? "Layer als BSK erkannt"
        : "Produktdaten als Brandschutzklappe erkannt",
      "high"
    );
  }


  /* =====================================================
     VSR
  ===================================================== */

  if (
    has(
      layer,
      [
        "L_VSR",
        "VSR",
        "Volumenstromregler"
      ]
    )
    ||
    has(
      everything,
      [
        "Volumenstromregler",
        "Volumenstrom Regler",
        "Volumenstrombegrenzer",
        "Luftmengenregler",
        "Volume Flow Controller",
        "Air Volume Controller",
        "VARYCONTROL",
        "VAV",
        "CAV",
        "TVR",
        "TVJ",
        "TVZ",
        "TVE",
        "VFC"
      ]
    )
  ) {

    return result(
      "volume_flow_controller",
      "Volumenstromregler (VSR)",
      layer.includes(
        "vsr"
      )
        ? "Layer als VSR erkannt"
        : "Produktdaten als VSR erkannt",
      "high"
    );
  }


  /* =====================================================
     SCHALLDÄMPFER
  ===================================================== */

  if (
    has(
      layer,
      [
        "L_Schalldaempfer",
        "Schalldaempfer",
        "Silencer"
      ]
    )
    ||
    has(
      everything,
      [
        "Schalldämpfer",
        "Schalldaempfer",
        "Kulissenschalldämpfer",
        "Kulissenschalldaempfer",
        "Rohrschalldämpfer",
        "Rohrschalldaempfer",
        "Silencer",
        "Sound Attenuator"
      ]
    )
  ) {

    return result(
      "silencer",
      "Schalldämpfer",
      "Schalldämpfer erkannt"
    );
  }


  /* Tellerventil */

  if (
    has(
      everything,
      [
        "Tellerventil",
        "Disc Valve"
      ]
    )
  ) {

    return result(
      "disc_valve",
      "Tellerventil",
      "Tellerventil erkannt"
    );
  }


  /* Gitter */

  if (
    has(
      layer,
      [
        "L_Gitter",
        "Gitter"
      ]
    )
    ||
    has(
      everything,
      [
        "Lüftungsgitter",
        "Lueftungsgitter",
        "Luftgitter",
        "Wetterschutzgitter",
        "Schutzgitter",
        "Air Grille",
        "Grille"
      ]
    )
  ) {

    return result(
      "grille",
      "Lüftungsgitter",
      "Gitter erkannt"
    );
  }


  /* Jalousieklappe */

  if (
    has(
      layer,
      [
        "L_Jalousieklappe",
        "Jalousieklappe"
      ]
    )
    ||
    has(
      everything,
      [
        "Jalousieklappe",
        "Louver Damper",
        "Louvre Damper"
      ]
    )
  ) {

    return result(
      "louver_damper",
      "Jalousieklappe",
      "Jalousieklappe erkannt"
    );
  }


  /* Absperrklappe */

  if (
    has(
      everything,
      [
        "Absperrklappe",
        "Shutoff Damper",
        "Shut Off Damper",
        "Drosselklappe"
      ]
    )
  ) {

    return result(
      "shutoff_damper",
      "Absperrklappe",
      "Absperrklappe erkannt"
    );
  }


  /* Dämmung */

  if (
    ifcType.includes(
      "covering"
    )
    ||
    has(
      layer,
      [
        "L_Daemmung",
        "L_Isolierung"
      ]
    )
    ||
    has(
      everything,
      [
        "Dämmung",
        "Daemmung",
        "Isolierung",
        "Insulation",
        "Armaflex",
        "Kaiflex",
        "K-Flex"
      ]
    )
  ) {

    return result(
      "insulation",
      "Lüftungsdämmung / Isolierung",
      "Dämmung erkannt"
    );
  }


  /* Luftauslass */

  if (
    ifcType.includes(
      "airterminal"
    )
    ||
    has(
      everything,
      [
        "Luftauslass",
        "Drallauslass",
        "Schlitzauslass",
        "Deckenauslass",
        "Quellauslass",
        "Diffuser",
        "Air Terminal"
      ]
    )
  ) {

    return result(
      "air_terminal",
      "Luftauslass",
      "Luftauslass erkannt"
    );
  }


  /* Formteil */

  if (
    ifcType.includes(
      "ductfitting"
    )
    ||
    has(
      everything,
      [
        "Kanalformteil",
        "Duct Fitting",
        "Bogen",
        "Abzweig",
        "T-Stück",
        "T Stueck",
        "Übergang",
        "Uebergang",
        "Reduktion",
        "Transition",
        "Junction",
        "Elbow",
        "Bundkragen",
        "Hosenstück",
        "Stutzen"
      ]
    )
  ) {

    return result(
      "duct_fitting",
      "Lüftungsformteil",
      "Formteil erkannt"
    );
  }


  /* Kanal / Rohr */

  if (
    ifcType.includes(
      "ductsegment"
    )
    ||
    has(
      everything,
      [
        "Lüftungskanal",
        "Lueftungskanal",
        "Luftkanal",
        "Rechteckkanal",
        "Lüftungsrohr",
        "Lueftungsrohr",
        "Wickelfalzrohr",
        "Spirorohr",
        "Duct Segment"
      ]
    )
  ) {

    return result(
      "duct_segment",
      "Lüftungskanal / Lüftungsrohr",
      "Kanal / Rohr erkannt"
    );
  }


  /* Allgemeine Klappe */

  if (
    has(
      everything,
      [
        "Klappe",
        "Damper"
      ]
    )
  ) {

    return result(
      "damper_generic",
      "Lüftungsklappe",
      "allgemeine Klappe erkannt",
      "medium"
    );
  }


  /* IFCFLOWCONTROLLER Fallback */

  if (
    ifcType.includes(
      "flowcontroller"
    )
  ) {

    return result(
      "flow_controller_generic",
      "Luftstrom-Regelbauteil",
      "IFCFLOWCONTROLLER – Untertyp in übertragenen Daten nicht eindeutig",
      "low"
    );
  }


  return result(
    "unknown",
    "Nicht eindeutig erkannt",
    "Keine eindeutige Klassifizierung",
    "low"
  );
}


/* =========================================================
   OBJECT ANALYSIS
========================================================= */

export function analyzeTgaObject(
  input: unknown
): TgaAnalysis {

  const flat =
    flatten(
      input
    );


  const classification =
    classify(
      flat
    );


  const dimensions =
    parseDimensions(
      flat
    );


  const ifcType =
    text(
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
    text(
      flat,
      [
        "PredefinedType"
      ]
    );


  const guid =
    text(
      flat,
      [
        "GUID (IFC)",
        "GUID IFC",
        "externalId",
        "GlobalId",
        "IfcGuid"
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
    text(
      flat,
      [
        "Product Name",
        "ProductName",
        "Name"
      ]
    );


  const description =
    text(
      flat,
      [
        "Product Description",
        "Description"
      ]
    );


  const objectType =
    text(
      flat,
      [
        "Product Object Type",
        "ObjectType"
      ]
    );


  const manufacturer =
    text(
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
    text(
      flat,
      [
        "Product Type",
        "Type Name",
        "Typ",
        "Type"
      ]
    );


  const layer =
    text(
      flat,
      [
        "Layer",
        "Presentation Layer",
        "PresentationLayer"
      ]
    );


  const tag =
    text(
      flat,
      [
        "Tag",
        "Kennzeichen",
        "Bauteilkennzeichen"
      ]
    );


  const modelName =
    text(
      flat,
      [
        "modelName",
        "ModelName",
        "File Name"
      ]
    );


  const system =
    text(
      flat,
      [
        "Tech-Medium",
        "Tech Medium",
        "System",
        "SystemName",
        "System Name",
        "DistributionSystem",
        "Anlage",
        "Anlagenkennzeichen",
        "MagiCADSystem"
      ]
    );


  const storey =
    text(
      flat,
      [
        "Storey",
        "BuildingStorey",
        "Geschoss",
        "Etage",
        "Floor",
        "Level",
        "ReferenceLevel"
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
        "DuctLength_mm"
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
    dimensions.shape ===
      "round" &&
    dimensions.diameterMm !==
      undefined
  ) {

    const d =
      dimensions.diameterMm /
      1000;


    areaM2 =

      Math.PI

      *

      d

      *

      d

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
        lengthMm !==
          undefined &&
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
          "Rund-Rohrformteil: Stück.";
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

    manufacturer,

    productType,

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
   SELECTION
========================================================= */

export function analyzeTgaSelection(
  selection: unknown[]
): TgaAnalysis[] {

  const result:
    TgaAnalysis[] = [];


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
        properties.length >
        0
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


    result.push(
      analyzeTgaObject(
        entryValue
      )
    );
  }


  return result;
}
