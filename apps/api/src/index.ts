import { config, configWarnings } from "@workspace/config";
import { createLogger } from "@workspace/observability";
import { getS3StartupStatus } from "../../../engines/reading-engine/src/security/s3-client.js";
import app from "./app.js";

app.listen(config.server.port, () => {
  const logger = createLogger({ level: config.observability.logLevel, name: "buytuk-api" });
  const s3 = getS3StartupStatus();
  logger.info({ port: config.server.port }, "Server listening");
  for (const warning of configWarnings) {
    logger.warn({ component: "config" }, warning);
  }
  if (s3.ready) {
    logger.info({ mode: s3.mode, bucket: s3.bucket, region: s3.region, endpointUrl: s3.endpointUrl, hasSessionToken: s3.hasSessionToken, usingLocalEndpointFallback: s3.usingLocalEndpointFallback }, "S3 startup check passed");
  } else {
    logger.warn({ mode: s3.mode, bucket: s3.bucket, region: s3.region, endpointUrl: s3.endpointUrl, hasPartialCredentials: s3.hasPartialCredentials, hasSessionToken: s3.hasSessionToken }, s3.message);
  }
});
