import app from "./app";
import { logger } from "./lib/logger";
import { xavierCalendarIdentityAlignment } from "./lib/calendar-profile";
import { reconnectStoredGoogleCalendarGrants } from "./lib/calendar-persistence";
import { retireDuplicateXavierIdentities } from "./lib/retire-duplicate-xavier";
import { ensureOfficialExtractsImported } from "./lib/sat-bank-service";
import { ensureXavierSatCapabilitySession } from "./lib/xavier-sat-capability-session";
import { resetSamaXavierSatCapabilityAttempts } from "./lib/reset-sama-xavier-capability";
import { ensureMichelleGeometryFollowUp } from "./lib/michelle-geometry-follow-up";
import { ensureGeometryAreaVolumeFollowUp } from "./lib/geometry-area-volume-follow-up";
import { ensureMichelleXavierSessionFollowUps } from "./lib/michelle-xavier-session-follow-up";
import { ensureRyoTaitoParentMirror } from "./lib/parent-mirror";

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

void ensureRyoTaitoParentMirror()
  .then((result) => logger.info(result, "Ryo parent mirror ready"))
  .catch((err) => logger.warn({ err }, "Ryo parent mirror upsert skipped"))
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      void ensureOfficialExtractsImported()
        .then((result) => logger.info(result, "SAT/PSAT official extracts ready"))
        .catch((err) => logger.warn({ err }, "SAT/PSAT official extract import skipped"))
        .then(() =>
          retireDuplicateXavierIdentities().catch((err) =>
            logger.warn({ err }, "Xavier identity retirement skipped"),
          ),
        )
        .then(() => reconnectStoredGoogleCalendarGrants())
        .then((healed) =>
          logger.info(
            { event: "calendar.grants_kept_connected", ...healed },
            "Stored Google Calendar refresh tokens kept connected",
          ),
        )
        .then(() => ensureXavierSatCapabilitySession())
        .then((result) => logger.info(result, "Xavier SAT capability session ready"))
        .then(() =>
          resetSamaXavierSatCapabilityAttempts()
            .then((result) =>
              logger.info(result, "Sama Xavier SAT capability attempt reset"),
            )
            .catch((err) =>
              logger.warn({ err }, "Sama Xavier SAT capability attempt reset skipped"),
            ),
        )
        .then(() => ensureMichelleGeometryFollowUp())
        .then((result) => logger.info(result, "Michelle geometry follow-up ready"))
        .then(() => ensureGeometryAreaVolumeFollowUp())
        .then((result) => logger.info(result, "Geometry area and volume follow-up ready"))
        .then(() => ensureMichelleXavierSessionFollowUps())
        .then((result) => logger.info(result, "Michelle Xavier session follow-up ready"))
        .then(() => xavierCalendarIdentityAlignment())
        .then((alignment) =>
          logger.info(
            { event: "calendar.xavier_identity_alignment", ...alignment },
            "Xavier calendar identity alignment",
          ),
        )
        .catch((err) =>
          logger.warn({ err }, "Xavier SAT capability session seed skipped"),
        );
    });
  });
