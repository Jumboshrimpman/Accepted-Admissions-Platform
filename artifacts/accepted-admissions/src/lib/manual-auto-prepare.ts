/**
 * Manual "Auto-prepare session" / "Refresh from latest result" buttons.
 *
 * Off for now: a manual run on a session whose pre-work is not yet attempted
 * re-picks the pre-work form, and because draft reserves and unattempted
 * in-session sets mark every form as "seen", it falls back to form 4 and
 * recycles questions already used on another session (todo 310). Automatic
 * preparation on new-session creation is not affected.
 *
 * Flip to true to restore the buttons once todo 310 is fixed.
 */
export const MANUAL_AUTO_PREPARE_ENABLED = false;
