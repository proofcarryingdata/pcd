/**
 * Settings for calling {@link gpcArtifactDownloadURL} as parsed from an
 * environment variable by {@link parseGPCArtifactsConfig}.
 */
export type GPCArtifactsConfigEnv = {
  source: string | undefined;
  stability: string | undefined;
  version: string | undefined;
};

/**
 * Parse configuration overrides for GPC artifact download from a string
 * environment variable, or provides default values if not set.
 *
 * @param envConfig environment variable value for override
 * @returns config variables suitable for calling {@link gpcArtifactDownloadURL}.
 * @throws if the input string isn't in the correct JSON format
 */
export function parseGPCArtifactsConfig(
  envConfig: string | undefined
): GPCArtifactsConfigEnv {
  const defaultConfig = {
    source: "unpkg",
    stability: "prod",
    version: undefined // Means to use GPC_ARTIFACTS_NPM_VERSION
  };
  if (
    envConfig === undefined ||
    envConfig === "" ||
    envConfig === "undefined"
  ) {
    return defaultConfig;
  }
  try {
    const config = JSON.parse(envConfig);
    if (typeof config !== "object" || Array.isArray(config)) {
      throw new TypeError(
        `Input string doesn't parse as an object: ${envConfig}`
      );
    }
    return {
      source: config.source ?? defaultConfig.source,
      stability: config.stability ?? defaultConfig.stability,
      version: config.version ?? defaultConfig.version
    };
  } catch (e) {
    console.error(
      "Failed to parse GPC artifacts config from environment var: ",
      e
    );
    throw e;
  }
}
