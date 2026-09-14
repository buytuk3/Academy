/**
 * TEMPORARY COMPATIBILITY LAYER — canonical owner: packages/queue.
 * Preserves the legacy import path (`../queue/bullmq.js`) and eager event
 * wiring for engine consumers. Removal target: P5 (consumers import
 * @workspace/queue directly).
 */
export * from "@workspace/queue";
