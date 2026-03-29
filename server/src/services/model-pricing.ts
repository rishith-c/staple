export interface ModelPricing {
  inputCentsPerMillion: number;
  cachedInputCentsPerMillion: number;
  outputCentsPerMillion: number;
  matchedModel: string;
  inferred: boolean;
  sourceUrl: string;
}

type PricingCatalogEntry = Omit<ModelPricing, "matchedModel" | "inferred"> & {
  aliases: string[];
};

const PRICING_CATALOG: PricingCatalogEntry[] = [
  {
    aliases: ["gpt-5.4"],
    inputCentsPerMillion: 250,
    cachedInputCentsPerMillion: 25,
    outputCentsPerMillion: 1500,
    sourceUrl: "https://openai.com/api/pricing",
  },
  {
    aliases: ["gpt-5", "gpt-5-codex"],
    inputCentsPerMillion: 125,
    cachedInputCentsPerMillion: 12.5,
    outputCentsPerMillion: 1000,
    sourceUrl: "https://openai.com/api/pricing",
  },
  {
    aliases: ["gpt-5-mini", "gpt-5.1-codex-mini"],
    inputCentsPerMillion: 25,
    cachedInputCentsPerMillion: 2.5,
    outputCentsPerMillion: 200,
    sourceUrl: "https://openai.com/api/pricing",
  },
  {
    aliases: ["gpt-5-nano"],
    inputCentsPerMillion: 5,
    cachedInputCentsPerMillion: 0.5,
    outputCentsPerMillion: 40,
    sourceUrl: "https://openai.com/api/pricing",
  },
  {
    aliases: ["o4-mini"],
    inputCentsPerMillion: 400,
    cachedInputCentsPerMillion: 100,
    outputCentsPerMillion: 1600,
    sourceUrl: "https://openai.com/api/pricing",
  },
  {
    aliases: ["gpt-5.3-codex"],
    inputCentsPerMillion: 175,
    cachedInputCentsPerMillion: 17.5,
    outputCentsPerMillion: 1400,
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.3-codex",
  },
  {
    aliases: ["codex-mini-latest"],
    inputCentsPerMillion: 150,
    cachedInputCentsPerMillion: 37.5,
    outputCentsPerMillion: 600,
    sourceUrl: "https://developers.openai.com/api/docs/models/codex-mini-latest",
  },
  {
    aliases: ["claude-opus-4.1", "claude-opus-4", "claude-opus-4-1", "claude-opus-4-5", "claude-opus-4-6"],
    inputCentsPerMillion: 1500,
    cachedInputCentsPerMillion: 150,
    outputCentsPerMillion: 7500,
    sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
  },
  {
    aliases: ["claude-sonnet-4", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-sonnet-3.7", "claude-sonnet-3-7", "claude-sonnet-3.5", "claude-sonnet-3-5"],
    inputCentsPerMillion: 300,
    cachedInputCentsPerMillion: 30,
    outputCentsPerMillion: 1500,
    sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
  },
  {
    aliases: ["claude-haiku-3.5", "claude-haiku-3-5", "claude-haiku-4.5", "claude-haiku-4-5", "claude-haiku-4.6", "claude-haiku-4-6"],
    inputCentsPerMillion: 80,
    cachedInputCentsPerMillion: 8,
    outputCentsPerMillion: 400,
    sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
  },
  {
    aliases: ["claude-haiku-3"],
    inputCentsPerMillion: 25,
    cachedInputCentsPerMillion: 3,
    outputCentsPerMillion: 125,
    sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
  },
];

function normalizeModelId(model: string) {
  return model.trim().toLowerCase();
}

export function resolveModelPricing(model: string | null | undefined): ModelPricing | null {
  if (!model) return null;
  const normalized = normalizeModelId(model);

  for (const entry of PRICING_CATALOG) {
    for (const alias of entry.aliases) {
      if (normalized === alias || normalized.startsWith(`${alias}-`)) {
        return {
          ...entry,
          matchedModel: alias,
          inferred: normalized !== alias,
        };
      }
    }
  }

  if (normalized === "gpt-5.3-codex-spark" || normalized.startsWith("gpt-5.3-codex-spark-")) {
    const base = PRICING_CATALOG.find((entry) => entry.aliases.includes("gpt-5.3-codex"));
    if (!base) return null;
    return {
      ...base,
      matchedModel: "gpt-5.3-codex",
      inferred: true,
    };
  }

  return null;
}

export function estimateUsageCostCents(input: {
  model: string | null | undefined;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}) {
  const pricing = resolveModelPricing(input.model);
  if (!pricing) {
    return {
      costCents: 0,
      pricing: null,
    };
  }

  const costCents = Math.round(
    (Math.max(0, input.inputTokens) / 1_000_000) * pricing.inputCentsPerMillion +
    (Math.max(0, input.cachedInputTokens) / 1_000_000) * pricing.cachedInputCentsPerMillion +
    (Math.max(0, input.outputTokens) / 1_000_000) * pricing.outputCentsPerMillion,
  );

  return {
    costCents,
    pricing,
  };
}
