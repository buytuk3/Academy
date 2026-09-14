/**
 * CORE-06 — @workspace/events
 * Internal event-driven flow for the modular monolith.
 *   Engine → publishEvent → durable outbox (same DB) → in-process consumers.
 * Consumers are idempotent (stable operation key → recordEvidence dedup,
 * processed-marker per outbox row). No event bus, no second store.
 */
export { publishEvent, registerConsumer, consumerFor, type EventConsumer, type PublishOptions } from "./dispatcher.js";
export { processEventOutbox, retryFailedEvent, type OutboxProcessResult } from "./outbox.js";
export { EVENT_TO_EVIDENCE_TYPE, evidenceConsumerFor } from "./evidence-consumer.js";
