import { injectable } from "inversify";
import { spawn } from "node:child_process";
import { audioConfig } from "../../config/audio.config.js";
import { logger } from "../observability/logger.js";
import { metrics } from "../observability/metrics.js";

/**
 * Audio Enhancement using DeepFilterNet (native, not WASM)
 *
 * Pipeline:
 *   PCM 16k → DeepFilterNet subprocess → PCM 16k (cleaned)
 */
@injectable()
export class AudioEnhancement {
  private workerPath: string;

  constructor() {
    this.workerPath = process.env.DFN_WORKER_PATH || "./dfn-worker";
  }

  async denoise(pcm16k: Float32Array, correlationId?: string): Promise<Float32Array> {
    const log = logger.child({ component: "AudioEnhancement", correlationId });
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn(this.workerPath, [
        "--sample-rate", String(audioConfig.input.sampleRate),
        "--format", "f32le",
      ], { stdio: ["pipe", "pipe", "pipe"] });

      const chunks: Buffer[] = [];
      let stderr = "";

      child.stdout.on("data", (d: Buffer) => chunks.push(d));
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
        log.debug({ stderr: d.toString() }, "DeepFilterNet output");
      });

      child.on("close", (code) => {
        const duration = (Date.now() - startTime) / 1000;
        metrics.pipelineDuration.labels("audio_enhancement").observe(duration);

        if (code !== 0) {
          log.error({ code, stderr, duration }, "DeepFilterNet failed");
          reject(new Error(`DeepFilterNet exited with code ${code}: ${stderr}`));
          return;
        }

        const buf = Buffer.concat(chunks);
        const result = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

        log.info({ duration, outputSamples: result.length }, "Audio enhancement completed");
        resolve(result);
      });

      child.on("error", (err) => {
        log.error({ err }, "Failed to spawn DeepFilterNet");
        reject(err);
      });

      // Send raw PCM
      const inputBuf = Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength * 4);
      child.stdin.write(inputBuf);
      child.stdin.end();
    });
  }

  /**
   * Validate audio buffer
   */
  validate(pcm: Float32Array, sampleRate: number): void {
    if (pcm.length === 0) {
      throw new Error("Audio buffer is empty");
    }

    const durationSec = pcm.length / sampleRate;
    if (durationSec < audioConfig.processing.minDurationSec) {
      throw new Error(`Audio too short: ${durationSec}s < ${audioConfig.processing.minDurationSec}s`);
    }

    if (durationSec > audioConfig.processing.maxDurationSec) {
      throw new Error(`Audio too long: ${durationSec}s > ${audioConfig.processing.maxDurationSec}s`);
    }

    if (sampleRate !== audioConfig.input.sampleRate) {
      throw new Error(`Invalid sample rate: ${sampleRate} != ${audioConfig.input.sampleRate}`);
    }
  }
}
