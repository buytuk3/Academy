import { config } from "@workspace/config";
import { createLogger } from "@workspace/observability";
import app from "./app.js";

app.listen(config.server.port, () => {
  const logger = createLogger({ level: config.observability.logLevel, name: "buytuk-api" });
  logger.info({ port: config.server.port }, "Server listening");
});
