import { MockProvider } from "./mock-provider"
import type { ModelProvider } from "./provider"
import { HttpProviderConfig, HttpModelProvider, type FetchLike } from "./http-provider"
import type { ProviderConfig } from "./config"

export type { ProviderConfigInput as ProviderConfigFile }

/**
 * Resolves the configured provider. Default is always the deterministic mock;
 * the real provider requires an explicit http config and reads its key from the
 * environment at call time.
 */
export type ProviderConfigInput = Partial<ProviderConfig> & Pick<ProviderConfig, "kind">

export function createProvider(
  config: ProviderConfigInput | undefined,
  deps: { fetchImpl?: FetchLike; env?: Record<string, string | undefined> } = {},
): ModelProvider {
  if (!config || config.kind === "mock" || !config.baseUrl || !config.model) {
    return new MockProvider()
  }
  const parsed = HttpProviderConfig.parse({
    baseUrl: config.baseUrl,
    model: config.model,
    apiKeyEnv: config.apiKeyEnv ?? "SOLVEBENCH_API_KEY",
    ...(config.maxTokens ? { maxTokens: config.maxTokens } : {}),
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
  })
  return new HttpModelProvider(parsed, deps.fetchImpl, deps.env)
}

export function providerLabel(provider: ModelProvider): string {
  if (provider instanceof HttpModelProvider) {
    const info = provider.describe()
    return `http:${info.model}`
  }
  return "mock"
}
