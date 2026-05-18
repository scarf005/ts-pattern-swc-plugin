import type { TransformTsPatternOptions } from "./transform.mjs";

export type LoaderOptions = TransformTsPatternOptions;

export const initialize: (data?: LoaderOptions) => void;
export const resolve: (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => Promise<unknown>,
) => Promise<unknown>;
export const load: (
  url: string,
  context: unknown,
  nextLoad: (url: string, context: unknown) => Promise<unknown>,
) => Promise<unknown>;
