import app from "./app";
import { logger } from "./lib/logger";
import { ensureOfficialExtractsImported } from "./lib/sat-bank-service";
import { ensureXavierSatCapabilitySession } from "./lib/xavier-sat-capability-session";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void ensureOfficialExtractsImported()
    .then((result) => logger.info(result, "SAT/PSAT official extracts ready"))
    .catch((err) => logger.warn({ err }, "SAT/PSAT official extract import skipped"))
    .then(() => ensureXavierSatCapabilitySession())
    .then((result) => logger.info(result, "Xavier SAT capability session ready"))
    .catch((err) =>
      logger.warn({ err }, "Xavier SAT capability session seed skipped"),
    );
});
