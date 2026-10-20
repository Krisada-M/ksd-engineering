/** Lightweight SDLC guidance; not an automatic release gate. */
export type KsdMode = "balanced" | "adaptive";
export declare const SDLC_PHASES: readonly string[];
export declare function buildSdlcPolicy({ mode }?: {
    mode?: KsdMode;
}): string;
