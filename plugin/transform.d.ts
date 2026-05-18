export type TransformTsPatternOptions = {
  filename?: string;
  pluginPath?: string;
  pluginOptions?: Record<string, unknown>;
  sourceMaps?: boolean | "inline";
  swcOptions?: Record<string, unknown>;
};

export type TransformTsPatternResult = {
  code: string;
  map?: string;
  diagnostics?: unknown[];
};

export const defaultPluginPath: () => string;
export const transformTsPattern: (
  source: string,
  options?: TransformTsPatternOptions,
) => Promise<TransformTsPatternResult>;
