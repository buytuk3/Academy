/**
 * Ambient declarations for runtime-only WASM packages that ship
 * without TypeScript types.
 */
declare module "essentia.js" {
  export class Essentia {
    constructor(wasm?: any);
    Window(frame: Float32Array, type: string): any;
    Spectrum(frame: any): any;
    MFCC(spectrum: any, params?: any): { magnitudes: number[]; coefficients: number[] };
    PitchMelodia(frame: Float32Array, params?: any): { pitch: any; confidence: any };
    Energy(frame: Float32Array): number;
    ZeroCrossingRate(frame: Float32Array): number;
    Centroid(spectrum: any): number;
    RollOff(spectrum: any, params?: any): number;
    HNR(frame: Float32Array, params?: any): number;
  }
  export const EssentiaWASM: any;
}
declare module "rnnoise-wasm";
