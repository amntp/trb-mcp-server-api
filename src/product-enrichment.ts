export type ProductProviderStatus =
  | "matched-local-catalog"
  | "api-configured"
  | "api-not-configured"
  | "api-error";

export interface ProductEnrichmentInput {
  manufacturer?: string;
  productType?: string;
  name?: string;
  description?: string;
  objectType?: string;
  ifcType?: string;
  diameterMm?: number;
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
}

export interface ProductSourceRecord {
  source: "manufacturer" | "ausschreiben.de" | "BIMobject";
  title?: string;
  manufacturer?: string;
  productSeries?: string;
  productCode?: string;
  description?: string;
  url?: string;
  attributes?: Record<string, string | number | boolean>;
  confidence: "high" | "medium" | "low";
}

export interface ProductEnrichment {
  query: string;
  manufacturer?: string;
  productSeries?: string;
  productCode?: string;
  diameterMm?: number;
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
  sources: ProductSourceRecord[];
  providerStatus: {
    manufacturerCatalog: ProductProviderStatus;
    ausschreiben: ProductProviderStatus;
    bimobject: ProductProviderStatus;
  };
}

type KnownProduct = {
  manufacturer: string;
  series: string;
  aliases: string[];
  description: string;
  url: string;
  attributes?: Record<string, string | number | boolean>;
  shape?: "round" | "rectangular";
};

const KNOWN_PRODUCTS: KnownProduct[] = [
  {
    manufacturer: "TROX",
    series: "FKRS-EU",
    aliases: ["FKRS-EU", "FKRS EU"],
    description: "Runde Brandschutzklappe",
    url: "https://www.trox.de/brandschutzklappen/fkrs-eu-065efc2b4efeb254",
    attributes: {
      nominalSizeMinMm: 100,
      nominalSizeMaxMm: 315,
      standard: "DIN EN 13501-3",
    },
    shape: "round",
  },
  {
    manufacturer: "TROX",
    series: "FK2-EU",
    aliases: ["FK2-EU", "FK2 EU"],
    description: "Rechteckige Brandschutzklappe",
    url: "https://www.trox.de/brandschutzklappen/fk2-eu-d43c8f48f846955c",
    attributes: {
      nominalWidthMinMm: 200,
      nominalWidthMaxMm: 1500,
      nominalHeightMinMm: 100,
      nominalHeightMaxMm: 800,
      standard: "DIN EN 13501-3",
    },
    shape: "rectangular",
  },
  {
    manufacturer: "TROX",
    series: "TVR",
    aliases: ["TVR"],
    description: "Rundes Volumenstromregelgerät",
    url: "https://www.trox.de/vvs-regelgeraete/tvr-1009c569f1631661",
    shape: "round",
  },
];

function envValue(name: string): string | undefined {
  const root = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  };
  return root.process?.env?.[name];
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[_\-\/]+/g, " ")
    .replace(/\s+/g, " ");
}

function joinedText(input: ProductEnrichmentInput): string {
  return [
    input.manufacturer,
    input.productType,
    input.name,
    input.description,
    input.objectType,
    input.ifcType,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");
}

function findKnownProduct(input: ProductEnrichmentInput): KnownProduct | undefined {
  const text = normalize(joinedText(input));
  return KNOWN_PRODUCTS.find((product) =>
    product.aliases.some((alias) => text.includes(normalize(alias)))
  );
}

function parseKnownDimensions(
  input: ProductEnrichmentInput,
  known: KnownProduct | undefined
): Pick<ProductEnrichment, "diameterMm" | "widthMm" | "heightMm" | "lengthMm"> {
  const result = {
    diameterMm: input.diameterMm,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    lengthMm: input.lengthMm,
  };

  if (!known) return result;
  const raw = joinedText(input).replace(/×/g, "x");

  if (known.series === "FKRS-EU") {
    const match = raw.match(/FKRS[- ]?EU(?:\/DE)?\/(\d{2,4})(?:\/|$)/i);
    if (match && result.diameterMm === undefined) result.diameterMm = Number(match[1]);
  }

  if (known.series === "FK2-EU") {
    const match = raw.match(
      /FK2[- ]?EU(?:\/DE)?\/(\d{2,4})\s*x\s*(\d{2,4})\s*x\s*(\d{2,4})(?:\/|$)/i
    );
    if (match) {
      if (result.widthMm === undefined) result.widthMm = Number(match[1]);
      if (result.heightMm === undefined) result.heightMm = Number(match[2]);
      if (result.lengthMm === undefined) result.lengthMm = Number(match[3]);
    }
  }

  return result;
}

function buildQuery(input: ProductEnrichmentInput, known: KnownProduct | undefined): string {
  const values = [
    known?.manufacturer ?? input.manufacturer,
    known?.series,
    input.productType,
    input.description,
    input.name,
  ].filter((value): value is string => Boolean(value && value.trim()));
  return Array.from(new Set(values)).join(" ").trim();
}

function firstArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["items", "results", "products", "data", "entries"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

function parseProviderItem(
  source: "ausschreiben.de" | "BIMobject",
  value: unknown
): ProductSourceRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return {
    source,
    title: asString(record.title ?? record.name ?? record.productName),
    manufacturer: asString(record.manufacturer ?? record.brand ?? record.brandName),
    productSeries: asString(record.series ?? record.productSeries ?? record.type),
    productCode: asString(record.code ?? record.productCode ?? record.articleNumber),
    description: asString(record.description ?? record.summary),
    url: asString(record.url ?? record.link ?? record.productUrl),
    confidence: "medium",
  };
}

async function queryConfiguredProvider(
  source: "ausschreiben.de" | "BIMobject",
  endpointTemplate: string | undefined,
  token: string | undefined,
  query: string
): Promise<{ status: ProductProviderStatus; records: ProductSourceRecord[] }> {
  if (!endpointTemplate) return { status: "api-not-configured", records: [] };

  const endpoint = endpointTemplate.includes("{query}")
    ? endpointTemplate.replace("{query}", encodeURIComponent(query))
    : `${endpointTemplate}${endpointTemplate.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-User-Agent": "AgentEyes/2.2",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) return { status: "api-error", records: [] };

    const payload: unknown = await response.json();
    const records = firstArray(payload)
      .map((item) => parseProviderItem(source, item))
      .filter((item): item is ProductSourceRecord => Boolean(item))
      .slice(0, 5);

    return { status: "api-configured", records };
  } catch {
    return { status: "api-error", records: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichProductData(
  input: ProductEnrichmentInput
): Promise<ProductEnrichment> {
  const known = findKnownProduct(input);
  const dimensions = parseKnownDimensions(input, known);
  const query = buildQuery(input, known);

  const localSources: ProductSourceRecord[] = known
    ? [
        {
          source: "manufacturer",
          title: `${known.manufacturer} ${known.series}`,
          manufacturer: known.manufacturer,
          productSeries: known.series,
          description: known.description,
          url: known.url,
          attributes: known.attributes,
          confidence: "high",
        },
      ]
    : [];

  const [ausschreiben, bimobject] = await Promise.all([
    queryConfiguredProvider(
      "ausschreiben.de",
      envValue("AUSSCHREIBEN_API_SEARCH_URL"),
      envValue("AUSSCHREIBEN_API_TOKEN"),
      query
    ),
    queryConfiguredProvider(
      "BIMobject",
      envValue("BIMOBJECT_API_SEARCH_URL"),
      envValue("BIMOBJECT_API_TOKEN"),
      query
    ),
  ]);

  return {
    query,
    manufacturer: known?.manufacturer ?? input.manufacturer,
    productSeries: known?.series,
    productCode: known?.series,
    ...dimensions,
    sources: [...localSources, ...ausschreiben.records, ...bimobject.records],
    providerStatus: {
      manufacturerCatalog: known ? "matched-local-catalog" : "api-not-configured",
      ausschreiben: ausschreiben.status,
      bimobject: bimobject.status,
    },
  };
}
