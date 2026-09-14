export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter, CustomFetchOptions } from "./custom-fetch";

/** CORE-24 Wave 3: canonical /v1 client — GENERATED from lib/api-spec/v1.yaml.
 *  The dormant hand-mirrored orval pair (generated/api.ts, generated/api.schemas.ts)
 *  is OUT of package scope (its @tanstack/react-query dep is not installed in this
 *  environment; orval regeneration is a documented CI step). No consumers exist —
 *  verified 2026-09-11. Technical debt: tracked in the Wave-3 checkpoint report. */
export * from "./generated/v1-client.generated.js";
