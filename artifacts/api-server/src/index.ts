import app from "./app";
import { logger } from "./lib/logger";
import { xavierCalendarIdentityAlignment } from "./lib/calendar-profile";
import { reconnectStoredGoogleCalendarGrants } from "./lib/calendar-persistence";
import { retireDuplicateXavierIdentities } from "./lib/retire-duplicate-xavier";
import { ensureOfficialExtractsImported } from "./lib/sat-bank-service";
import { ensureTaitoOct30HardPrework } from "./lib/sat-hard-sets";
import { ensureXavierSatCapabilitySession } from "./lib/xavier-sat-capability-session";
import { resetSamaXavierSatCapabilityAttempts } from "./lib/reset-sama-xavier-capability";
import { ensureMichelleGeometryFollowUp } from "./lib/michelle-geometry-follow-up";
import { ensureGeometryAreaVolumeFollowUp } from "./lib/geometry-area-volume-follow-up";
import { ensureMichelleXavierSessionFollowUps } from "./lib/michelle-xavier-session-follow-up";
import { ensureMichelleOct18ReviewQuiz } from "./lib/michelle-oct18-review-quiz";
import { ensureSophiaTutorLinks } from "./lib/sophia-tutor-links";
import { ensureTaitoOct23RemainingHomework } from "./lib/taito-oct23-remaining-homework";
import { ensureInSessionAttemptsStayOpen } from "./lib/in-session-time-limit";
import { ensureRyoTaitoParentMirror } from "./lib/parent-mirror";
import { ensureCollegeConsultingProvision } from "./lib/college-consulting-provision";

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
  .then(() => ensureCollegeConsultingProvision())
  .then((result) => logger.info(result, "College Consulting provisioning ready"))
  .catch((err) => logger.warn({ err }, "College Consulting provisioning skipped"))
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
        .then(() => ensureTaitoOct30HardPrework())
        .then((result) =>
          logger.info(
            { action: result.action, readingLeftInPlace: result.readingLeftInPlace },
            "Taito Oct 30 hard pre-work check",
          ),
        )
        .catch(() => logger.warn("Taito Oct 30 hard pre-work check skipped"))
        .then(() =>
          ensureTaitoOct23RemainingHomework()
            .then((result) => logger.info(result, "Taito Oct 23 remaining homework ready"))
            .catch((err) => logger.warn({ err }, "Taito Oct 23 remaining homework skipped")),
        )
        .then(() =>
          ensureInSessionAttemptsStayOpen().catch((err) =>
            logger.warn({ err }, "In-session attempt repair skipped"),
          ),
        )
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
        .then(() =>
          ensureMichelleOct18ReviewQuiz()
            .then((result) => logger.info(result, "Michelle Oct 18 review quiz ready"))
            .catch((err) => logger.warn({ err }, "Michelle Oct 18 review quiz skipped")),
        )
        .then(() =>
          ensureSophiaTutorLinks()
            .then((result) => logger.info(result, "Sophia tutor links ready"))
            .catch((err) => logger.warn({ err }, "Sophia tutor links skipped")),
        )
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
