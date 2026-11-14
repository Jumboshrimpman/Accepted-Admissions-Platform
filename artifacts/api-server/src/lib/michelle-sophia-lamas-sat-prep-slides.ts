/**
 * Queue SAT Prep I–IV slides on Michelle Makarem's Sophia Lamas SAT bookings.
 *
 * The four decks live in the repo as date-free templates at
 * `artifacts/accepted-admissions/public/media/sat-prep/SAT_Prep_{I,II,III,IV}.pptx`.
 * They are exported copies of the curriculum also used for Sophia Sleiman.
 * This module never reads, copies, renames, or edits the original Google
 * Slides files (see `sourceGoogleFileId` on each deck, documentation only).
 *
 * When Michelle books Sophia Lamas (subject SAT), the portal session gets a
 * published library resource / external_link block. Only the DISPLAY TITLE
 * changes: `SAT_Prep_I_11-4` style becomes `SAT_Prep_I_{M-D}` in
 * America/New_York (unpadded month and day). Slide content is never modified.
 *
 * Queue (booking order, gap-fill): 1→Prep I, 2→Prep II, 3→Prep III, 4→Prep IV.
 * Rescheduling the same session updates the title date only and does not
 * consume the next deck. A cancellation that restores credit does not consume
 * a deck. A late cancellation (no credit restore) keeps the deck assigned.
 * A fifth booking is left unassigned; Prep I is not reused.
 * No pre-work is created when these slides are attached.
 */

import { and, eq, inArray, ne } from "drizzle-orm";
import {
  creditLedgerTable,
  curriculumBlocksTable,
  curriculumLibraryAssetsTable,
  db,
  sessionsTable,
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SOPHIA_LAMAS_TUTOR_EMAIL, SOPHIA_LAMAS_TUTOR_NAME } from "./admin-calendar-fallback.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { libraryAssetBlockKind, libraryAssetToBlockConfig } from "./curriculum-library.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { logger } from "./logger.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { MICHELLE_MAKAREM_USER_ID } from "./no-auto-prework-clients.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isMichelleMakaremUser, type MichelleIdentity } from "./sat-tutor-pricing.ts";

export const SAT_PREP_TITLE_TIMEZONE = "America/New_York";
export const SAT_PREP_MEDIA_DIR = "/media/sat-prep";
export const SAT_PREP_SEED_KEY_PREFIX = "michelle-sophia-lamas-sat-prep";

export const MICHELLE_SOPHIA_LAMAS_SAT_PREP_DECKS = [
  {
    stem: "SAT_Prep_I",
    roman: "I",
    filename: "SAT_Prep_I.pptx",
    publicPath: "/media/sat-prep/SAT_Prep_I.pptx",
    topic: "Standard English Conventions",
    sourceGoogleFileId: "1N9Rz6AL9W4GdxrtH_vJH36tYxzS-sTpN",
  },
  {
    stem: "SAT_Prep_II",
    roman: "II",
    filename: "SAT_Prep_II.pptx",
    publicPath: "/media/sat-prep/SAT_Prep_II.pptx",
    topic: "Expression of Ideas",
    sourceGoogleFileId: "1ojCtIHMSivZtZiy7_TNN4hYujuli3CisiKQa9m21puY",
  },
  {
    stem: "SAT_Prep_III",
    roman: "III",
    filename: "SAT_Prep_III.pptx",
    publicPath: "/media/sat-prep/SAT_Prep_III.pptx",
    topic: "Information & Ideas",
    sourceGoogleFileId: "1SdjY6wTpmItWnjOOM1hS6uGCO5VNcX-p",
  },
  {
    stem: "SAT_Prep_IV",
    roman: "IV",
    filename: "SAT_Prep_IV.pptx",
    publicPath: "/media/sat-prep/SAT_Prep_IV.pptx",
    topic: "Information & Ideas + Craft & Structure",
    sourceGoogleFileId: "1beNWrG0Pxyvr6i9_9SuKpSttIGSBzpqb",
  },
] as const;

export type SatPrepDeck = (typeof MICHELLE_SOPHIA_LAMAS_SAT_PREP_DECKS)[number];
export type SatPrepStem = SatPrepDeck["stem"];
export type SatPrepRoman = SatPrepDeck["roman"];

export type SatPrepQueuePeer = {
  id: string;
  createdAt: Date;
  assignedStem: string | null;
};

export type EnsureSatPrepSlidesResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      attached: true;
      updatedTitleOnly: boolean;
      stem: SatPrepStem | string;
      title: string;
      blockId: string;
      sessionId: string;
      publicPath?: string;
    };

export function satPrepSeedKey(roman: string): string {
  return `${SAT_PREP_SEED_KEY_PREFIX}:${roman}`;
}

export function satPrepDisplayTitle(
  stem: string,
  sessionDate: Date,
  timeZone: string = SAT_PREP_TITLE_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "numeric",
    day: "numeric",
  }).formatToParts(sessionDate);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!month || !day) {
    throw new Error("Could not format the SAT prep display title date.");
  }
  return `${stem}_${month}-${day}`;
}

const STEM_BY_ROMAN = new Map(
  MICHELLE_SOPHIA_LAMAS_SAT_PREP_DECKS.map((deck) => [deck.roman, deck.stem]),
);
const KNOWN_STEMS = new Set(MICHELLE_SOPHIA_LAMAS_SAT_PREP_DECKS.map((deck) => deck.stem));

export function assignedStemFromConfig(
  config: Record<string, unknown> | null | undefined,
): SatPrepStem | string | null {
  if (!config) return null;
  const seed = typeof config.seedKey === "string" ? config.seedKey : "";
  const seedMatch = new RegExp(`^${SAT_PREP_SEED_KEY_PREFIX}:(I{1,3}|IV)$`).exec(seed);
  if (seedMatch) return STEM_BY_ROMAN.get(seedMatch[1] as SatPrepRoman) ?? `SAT_Prep_${seedMatch[1]}`;
  if (typeof config.satPrepStem === "string" && KNOWN_STEMS.has(config.satPrepStem as SatPrepStem)) {
    return config.satPrepStem;
  }
  const title = typeof config.title === "string" ? config.title : "";
  const titleMatch = /^(SAT_Prep_(?:I{1,3}|IV))(?:_\d{1,2}-\d{1,2})?$/.exec(title);
  return titleMatch?.[1] ?? null;
}

export function isLiveSatPrepBookingStatus(status: string): boolean {
  return status === "confirmed" || status === "rescheduled";
}

export function sessionConsumesSatPrepQueue(session: {
  bookingStatus: string;
  creditRestored: boolean;
}): boolean {
  if (session.bookingStatus === "cancelled") return !session.creditRestored;
  return isLiveSatPrepBookingStatus(session.bookingStatus);
}

export function nextSatPrepDeck(
  usedStems: Iterable<string | null | undefined>,
): SatPrepDeck | null {
  const used = new Set(
    [...usedStems].filter((stem): stem is string => Boolean(stem)),
  );
  return MICHELLE_SOPHIA_LAMAS_SAT_PREP_DECKS.find((deck) => !used.has(deck.stem)) ?? null;
}

export function nextSatPrepDeckForSession(args: {
  currentSessionId: string;
  currentCreatedAt: Date;
  peers: readonly SatPrepQueuePeer[];
}): SatPrepDeck | null {
  const reserved = new Set(
    args.peers
      .map((peer) => peer.assignedStem)
      .filter((stem): stem is string => Boolean(stem)),
  );
  const pendingEarlier = args.peers
    .filter((peer) => !peer.assignedStem)
    .filter((peer) => {
      const createdDelta = peer.createdAt.getTime() - args.currentCreatedAt.getTime();
      if (createdDelta < 0) return true;
      if (createdDelta > 0) return false;
      return peer.id < args.currentSessionId;
    })
    .sort((left, right) => {
      const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();
      if (createdDelta !== 0) return createdDelta;
      return left.id.localeCompare(right.id);
    });
  for (const _peer of pendingEarlier) {
    const reservedDeck = nextSatPrepDeck(reserved);
    if (reservedDeck) reserved.add(reservedDeck.stem);
  }
  return nextSatPrepDeck(reserved);
}

export type SatPrepPairInput = {
  subject: string;
  bookingStatus: string;
  client: (MichelleIdentity & { id?: string | null }) | null | undefined;
  tutor: { name?: string | null; email?: string | null; displayName?: string | null } | null | undefined;
};

export function isMichelleSophiaLamasSatClient(
  client: (MichelleIdentity & { id?: string | null }) | null | undefined,
): boolean {
  if (!client) return false;
  if (client.id === MICHELLE_MAKAREM_USER_ID) return true;
  return isMichelleMakaremUser(client);
}

export function isSophiaLamasTutor(tutor: {
  name?: string | null;
  email?: string | null;
  displayName?: string | null;
} | null | undefined): boolean {
  if (!tutor) return false;
  const name = (tutor.name ?? tutor.displayName ?? "").trim();
  const email = (tutor.email ?? "").trim().toLowerCase();
  return name === SOPHIA_LAMAS_TUTOR_NAME || email === SOPHIA_LAMAS_TUTOR_EMAIL;
}

export function shouldAttachMichelleSophiaLamasSatPrep(input: SatPrepPairInput): boolean {
  if (!isLiveSatPrepBookingStatus(input.bookingStatus)) return false;
  if (input.subject.trim().toLowerCase() !== "sat") return false;
  if (!isMichelleSophiaLamasSatClient(input.client)) return false;
  return isSophiaLamasTutor(input.tutor);
}

function tutorIdentity(profile?: {
  name?: string | null;
  email?: string | null;
} | null, user?: { displayName?: string | null; email?: string | null } | null) {
  return {
    name: profile?.name ?? user?.displayName ?? null,
    email: profile?.email ?? user?.email ?? null,
    displayName: user?.displayName ?? null,
  };
}

async function usedPeersForPair(
  clientUserId: string,
  tutorUserId: string,
  exceptSessionId: string,
): Promise<SatPrepQueuePeer[]> {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.clientUserId, clientUserId),
        eq(sessionsTable.tutorUserId, tutorUserId),
        ne(sessionsTable.id, exceptSessionId),
      ),
    );
  const satSessions = sessions.filter((session) => session.subject.trim().toLowerCase() === "sat");
  const cancelledIds = satSessions
    .filter((session) => session.bookingStatus === "cancelled")
    .map((session) => session.id);
  const restored = new Set<string>();
  if (cancelledIds.length > 0) {
    const rows = await db
      .select({ sessionId: creditLedgerTable.sessionId })
      .from(creditLedgerTable)
      .where(
        and(
          inArray(creditLedgerTable.sessionId, cancelledIds),
          eq(creditLedgerTable.entryType, "restored"),
        ),
      );
    for (const row of rows) {
      if (row.sessionId) restored.add(row.sessionId);
    }
  }
  const consuming = satSessions.filter((session) =>
    sessionConsumesSatPrepQueue({
      bookingStatus: session.bookingStatus,
      creditRestored: restored.has(session.id),
    }),
  );
  if (consuming.length === 0) return [];
  const blocks = await db
    .select({
      sessionId: curriculumBlocksTable.sessionId,
      config: curriculumBlocksTable.config,
    })
    .from(curriculumBlocksTable)
    .where(inArray(curriculumBlocksTable.sessionId, consuming.map((session) => session.id)));
  const stemBySession = new Map<string, string>();
  for (const block of blocks) {
    const stem = assignedStemFromConfig(block.config as Record<string, unknown> | null);
    if (stem && !stemBySession.has(block.sessionId)) stemBySession.set(block.sessionId, stem);
  }
  return consuming.map((session) => ({
    id: session.id,
    createdAt: session.createdAt,
    assignedStem: stemBySession.get(session.id) ?? null,
  }));
}

async function ensureDeckAsset(deck: SatPrepDeck, createdByUserId: string) {
  const [existing] = await db
    .select()
    .from(curriculumLibraryAssetsTable)
    .where(eq(curriculumLibraryAssetsTable.title, deck.stem))
    .limit(1);
  if (existing) {
    if (
      existing.resourceUrl !== deck.publicPath ||
      existing.kind !== "resource" ||
      existing.description !== deck.topic
    ) {
      const [updated] = await db
        .update(curriculumLibraryAssetsTable)
        .set({
          kind: "resource",
          description: deck.topic,
          resourceUrl: deck.publicPath,
          updatedAt: new Date(),
        })
        .where(eq(curriculumLibraryAssetsTable.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }
  const [created] = await db
    .insert(curriculumLibraryAssetsTable)
    .values({
      title: deck.stem,
      kind: "resource",
      description: deck.topic,
      resourceUrl: deck.publicPath,
      body: null,
      createdByUserId,
    })
    .returning();
  return created!;
}

function displayConfig(
  asset: {
    id: string;
    title: string;
    kind: string;
    description: string | null;
    resourceUrl: string | null;
    body: string | null;
  },
  deck: SatPrepDeck,
  title: string,
) {
  return {
    ...libraryAssetToBlockConfig(asset),
    title,
    label: title,
    text: deck.topic,
    seedKey: satPrepSeedKey(deck.roman),
    satPrepStem: deck.stem,
  };
}

export async function ensureMichelleSophiaLamasSatPrepSlides(
  sessionId: string,
): Promise<EnsureSatPrepSlidesResult> {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);
  if (!session) return { skipped: true, reason: "session-not-found" };
  if (!isLiveSatPrepBookingStatus(session.bookingStatus)) {
    return { skipped: true, reason: "not-live" };
  }
  if (!session.clientUserId || !session.tutorUserId) {
    return { skipped: true, reason: "missing-pair" };
  }
  const [[client], [tutorUser], [profile]] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, session.clientUserId)).limit(1),
    db.select().from(usersTable).where(eq(usersTable.id, session.tutorUserId)).limit(1),
    db
      .select()
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.userId, session.tutorUserId))
      .limit(1),
  ]);
  if (
    !shouldAttachMichelleSophiaLamasSatPrep({
      subject: session.subject,
      bookingStatus: session.bookingStatus,
      client: client ?? null,
      tutor: tutorIdentity(profile, tutorUser),
    })
  ) {
    return { skipped: true, reason: "not-michelle-sophia-lamas-sat" };
  }

  const blocks = await db
    .select()
    .from(curriculumBlocksTable)
    .where(eq(curriculumBlocksTable.sessionId, session.id));
  const existing = blocks.find((block) =>
    assignedStemFromConfig(block.config as Record<string, unknown> | null),
  );
  if (existing) {
    const stem = assignedStemFromConfig(existing.config as Record<string, unknown>)!;
    const title = satPrepDisplayTitle(stem, session.dateTime);
    const current = existing.config as Record<string, unknown>;
    if (current.title !== title || current.label !== title) {
      await db
        .update(curriculumBlocksTable)
        .set({
          config: {
            ...current,
            title,
            label: title,
            satPrepStem: stem,
          },
          updatedAt: new Date(),
        })
        .where(eq(curriculumBlocksTable.id, existing.id));
    }
    return {
      skipped: false,
      attached: true,
      updatedTitleOnly: true,
      stem,
      title,
      blockId: existing.id,
      sessionId: session.id,
    };
  }

  const peers = await usedPeersForPair(session.clientUserId, session.tutorUserId, session.id);
  const deck = nextSatPrepDeckForSession({
    currentSessionId: session.id,
    currentCreatedAt: session.createdAt,
    peers,
  });
  if (!deck) return { skipped: true, reason: "queue-exhausted" };

  const asset = await ensureDeckAsset(deck, session.tutorUserId);
  const title = satPrepDisplayTitle(deck.stem, session.dateTime);
  const config = displayConfig(asset, deck, title);
  const position = blocks.reduce((max, block) => Math.max(max, block.position), -1) + 1;
  try {
    const [created] = await db
      .insert(curriculumBlocksTable)
      .values({
        sessionId: session.id,
        libraryAssetId: asset.id,
        kind: libraryAssetBlockKind(asset),
        position,
        visibility: "both",
        status: "published",
        config,
      })
      .returning();
    return {
      skipped: false,
      attached: true,
      updatedTitleOnly: false,
      stem: deck.stem,
      title,
      blockId: created!.id,
      sessionId: session.id,
      publicPath: deck.publicPath,
    };
  } catch {
    const retryBlocks = await db
      .select()
      .from(curriculumBlocksTable)
      .where(eq(curriculumBlocksTable.sessionId, session.id));
    const raced = retryBlocks.find((block) =>
      assignedStemFromConfig(block.config as Record<string, unknown> | null),
    );
    if (raced) {
      const stem = assignedStemFromConfig(raced.config as Record<string, unknown>)!;
      const racedTitle = satPrepDisplayTitle(stem, session.dateTime);
      return {
        skipped: false,
        attached: true,
        updatedTitleOnly: true,
        stem,
        title: racedTitle,
        blockId: raced.id,
        sessionId: session.id,
      };
    }
    throw new Error("Michelle Sophia Lamas SAT prep slides could not be attached.");
  }
}

export async function ensureMichelleSophiaLamasSatPrepSlidesSafe(
  sessionId: string | null | undefined,
): Promise<EnsureSatPrepSlidesResult> {
  if (!sessionId) return { skipped: true, reason: "missing-session" };
  try {
    return await ensureMichelleSophiaLamasSatPrepSlides(sessionId);
  } catch (error) {
    logger.warn(
      { err: error, sessionId },
      "Michelle Sophia Lamas SAT prep slides could not be attached",
    );
    return { skipped: true, reason: "error" };
  }
}

export async function ensureMichelleSophiaLamasSatPrepSlidesForSessionsSafe(
  sessions: readonly {
    id: string;
    clientUserId?: string | null;
    tutorUserId?: string | null;
    subject?: string | null;
    bookingStatus?: string | null;
  }[],
): Promise<void> {
  for (const session of sessions) {
    if (!isLiveSatPrepBookingStatus(session.bookingStatus ?? "")) continue;
    if ((session.subject ?? "").trim().toLowerCase() !== "sat") continue;
    await ensureMichelleSophiaLamasSatPrepSlidesSafe(session.id);
  }
}
