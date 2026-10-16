import { DEC11, DEC18 } from "./original-hard-sat-rw-later.ts";

export type OriginalHardRwDraft = {
  stimulus: string;
  prompt: string;
  correct: string;
  wrong: [string, string, string];
  explanation: string;
  note: string;
  domain: string;
  skill: string;
};

const CRAFT = "Craft and Structure";
const INFO = "Information and Ideas";
const CONV = "Standard English Conventions";
const EXPR = "Expression of Ideas";

const WORD = "Which choice completes the text with the most logical and precise word or phrase?";
const STRUCTURE = "Which choice best describes the overall structure of the text?";
const PURPOSE = "Which choice best states the main purpose of the text?";
const CROSS = "Based on the texts, how would the author of Text 2 most likely respond to Text 1?";
const IDEA = "Which choice best states the main idea of the text?";
const TRANS = "Which choice completes the text with the most logical transition?";
const LOGIC = "Which choice most logically completes the text?";
const STANDARD = "Which choice completes the text so that it conforms to the conventions of Standard English?";

function goal(sentence: string): string {
  return `${sentence} Which choice most effectively uses relevant information from the notes to accomplish this goal?`;
}

function weaken(topic: string): string {
  return `Which finding, if true, would most directly weaken the researchers' claim about ${topic}?`;
}

function support(topic: string): string {
  return `Which finding, if true, would most directly support the researchers' claim about ${topic}?`;
}

function quant(start: string, end: string, left: string, right: string): string {
  return `Which choice most effectively uses data from the table to complete the text? From ${start} to ${end}, compare ${left} and ${right}.`;
}

function r(
  stimulus: string,
  prompt: string,
  correct: string,
  wrong: [string, string, string],
  explanation: string,
  note: string,
  domain: string,
  skill: string,
): OriginalHardRwDraft {
  return { stimulus, prompt, correct, wrong, explanation, note, domain, skill };
}

const notesIntro = "While researching a topic, a student has taken the following notes:";

/** Question 35 down to question 1. */
export const RW_BY_DATE: readonly (readonly OriginalHardRwDraft[])[] = [
  [
    r(
      "The municipal census of 1848 was offered to the council as a cautious working figure, and several members treated that caution as if it were the only issue worth debating. The dispute changed when the omitted waterfront households were restored to the rolls. The council's estimate of spare housing collapsed, and the surplus it had advertised could not be maintained. Once the missing households were included, that count was not merely a cautious guess awaiting a cleaner tally. It was ___.",
      WORD,
      "untenable",
      ["tentative", "provisional", "speculative"],
      "The estimate collapses once the omitted households are restored, so it cannot be maintained. Tentative and provisional fit a cautious first draft, which the passage sets aside, and speculative fits a figure offered before any count.",
      "RW module 2 vocabulary: untenable is required by a collapsed census, while near-synonyms of caution or guesswork ignore the restored households.",
      CRAFT,
      "Words in Context",
    ),
    r(
      "Marine chemists hypothesized that the brown band in the inlet came from the tannery upstream. They expected a week of rain to thicken the band by washing more extract into the channel. Samplers measured the water after the storm and found that the band had become paler, an outcome that ran against the tannery account. Jars taken at night showed the same paling, so the daylight method was not the mismatch. The authors cannot say whether the tide diluted the extract or the tannery paused its vats, and that mechanism remains unresolved. They also decline to call the band harmless to eelgrass, a plant they never surveyed on those dates, and they publish the jar readings without recommending a fine.",
      STRUCTURE,
      "The text places a proposed explanation beside a result that cuts against it and then leaves an open question.",
      [
        "The text places a proposed explanation beside a result that cuts against it and ends with a call for a new law.",
        "The text offers a familiar assumption and then a replacement account.",
        "The text traces the life of a single person who worked at the tannery.",
      ],
      "The chemists offer a tannery hypothesis, the storm result cuts against it, and the cause of that mismatch stays unresolved. A new law, a replacement history, and a biography are not in the passage.",
      "RW module 2 structure: a tannery hypothesis is cut down by paler water, and the mechanism is left open rather than resolved or turned into policy.",
      CRAFT,
      "Text Structure and Purpose",
    ),
    r(
      "Text 1\nHarbor historians say stone quays appeared in this city only after the 1710 dredging. Their account treats the earlier waterfront as timber and mud, and they read the customs rolls as silent on masonry before that year. A 1702 map is dismissed as schematic rather than measured. The historians add that pile drivers and lime kilns are absent from the guild minutes until the dredging contract. They treat that silence as positive evidence, not as a gap in the archive.\nText 2\nA foundation trench opened in 2019 reached a mortared quay whose shells predate the dredging by several decades. The mortar sits under an undisturbed silt layer that the dredging spoil never cut. The trench does not map the whole harbor, but the quay itself was already present before 1710.",
      CROSS,
      "The trench shows the timing in the first account is too late.",
      [
        "The trench shows the timing in the first account is too early.",
        "The pattern holds in a further case.",
        "The stated rule fails under a condition the first account omits.",
      ],
      "Text 1 dates stone quays to after 1710. Text 2 finds a mortared quay already in place before that dredging, so the first dating is too late rather than too early, and it is not merely an extra example of the same rule.",
      "RW module 2 cross-text: an older mortared quay undercuts a claim that masonry began only after the 1710 dredging.",
      CRAFT,
      "Cross-Text Connections",
    ),
    r(
      "Canal yields rose after the new gates were installed on the lower plots. In those same plots the salt crust thickened through the dry months. The ditches were lined with fired brick, and managers kept the gates shut on market days. A clerk recorded brick sizes in the margin of the ledger. None of that bookkeeping changes the paired result in the fields: more grain on the stalk, and a heavier white crust on the soil beside the gates.",
      IDEA,
      "Yields rose while the crust thickened.",
      [
        "Yields rose while the crust thinned.",
        "Yields rose in the surveyed plots.",
        "Yields rose and the crust thickened in every valley.",
      ],
      "The passage reports two field results, higher yields and a thicker salt crust. Thinning reverses the crust, the brick detail ignores the crust, and extending the result to every valley goes beyond the lower plots.",
      "RW module 2 main idea: canal yields and salt crust move together, so a one-sided or reversed summary misses half of the result.",
      INFO,
      "Central Ideas and Details",
    ),
    r(
      "Field crews walked the marsh for three seasons after the path lights went in. Nest boxes that had been full in May were empty by June, and the loss was sharpest beside the new poles. Feeders and water levels were logged so they would not be confused with the lights. The report attributes the decline in nesting to lamps. The authors say darkness was the condition the birds lost, and they do not rest the claim on feeder counts.",
      weaken("the marsh lights"),
      "Nesting still fell where no lamps were installed.",
      [
        "Nesting fell beside lamps in the same month.",
        "Feed still fell where no lamps were installed.",
        "Nesting still fell where no paths were widened.",
      ],
      "A decline in nesting where the lamps were never installed removes the lamps as the cause. A decline beside the lamps would support the claim, and a drop in feed or a path change does not test the nesting claim.",
      "RW module 2 textual evidence: nesting that still falls without lamps is the finding that cuts the lamp explanation.",
      INFO,
      "Command of Evidence",
    ),
    r(
      "Marsh counts during the restoration survey.\nRegion 2012 2016 2019\nCoast 40 42 31\nInland 29 27 39\nDelta 18 18 19\nCounts are whole numbers.",
      quant("2016", "2019", "Coast", "Inland"),
      "Coast fell from 42 to 31, and Inland rose from 27 to 39.",
      [
        "Coast rose from 40 to 42, and Inland fell from 29 to 27.",
        "Coast fell from 42 to 31, and Inland fell from 27 to 39.",
        "Coast fell from 42 to 31, and Delta held from 18 to 18.",
      ],
      "From 2016 to 2019 the coast count goes from 42 to 31 and the inland count goes from 27 to 39. The other choices use 2012, reverse the inland direction, or swap in the delta.",
      "RW module 2 quantitative evidence: coast and inland must both be read from 2016 to 2019, so a true earlier interval or the delta row fails the comparison.",
      INFO,
      "Command of Evidence",
    ),
    r(
      "A restorer can call the finish yellow only if both kiln heat and tin oxide are present. Workshop notes from the firing week say the kiln heat was present. The same notes say the tin oxide was absent, and a later chip confirms that the oxide layer is missing. The pot was still sold, but the sale does not put the oxide back into the glaze. The yellow finish ___.",
      LOGIC,
      "could not form, because the kiln heat had no tin oxide with it",
      [
        "must have formed, because the kiln heat was present",
        "proves the kiln heat was absent from the firing",
        "shows the sale replaced the missing oxide",
      ],
      "Yellow requires both kiln heat and tin oxide. The heat was present and the oxide was absent, so the finish could not form. Heat alone does not satisfy the rule, and the sale does not restore the oxide.",
      "RW module 2 logical completion: yellow glaze needs kiln heat and tin oxide together, so heat without oxide cannot produce the finish.",
      INFO,
      "Inferences",
    ),
    r(
      "Although the pigment flaked along the outer border, the figures kept the hue recorded in the 1490 inventory. ___ the panel was cleared for display.",
      TRANS,
      "Even so,",
      ["However,", "Specifically,", "Moreover,"],
      "The although-clause concedes the flaking, and the clearance agrees with the preserved hue rather than opposing it. Even so marks that concession. However would invent a contrast with the hue, and the clearance is neither a narrower subset nor a fresh side point.",
      "RW module 2 transition: flaking is conceded and the panel is still cleared, so the link is concession rather than contrast or specification.",
      EXPR,
      "Transitions",
    ),
    r(
      `${notesIntro}\n- The kiln heat cracked older vessels during the test firing.\n- The clay body stayed whole in that same firing.\n- The studio bought extra shelves in March.`,
      goal("The student wants to emphasize the contrast between the kiln heat and the clay body."),
      "The kiln heat cracked older vessels, but the clay body stayed whole.",
      [
        "The kiln heat cracked older vessels during the test firing.",
        "The clay body stayed whole in that same firing.",
        "The studio bought extra shelves in March and stacked the spare boards beside the unused wheel.",
      ],
      "The goal needs both the kiln heat and the clay body set against each other. Either fact alone, and the shelf purchase, leaves out half of that contrast.",
      "RW module 2 synthesis: kiln heat and clay body are both required, so a verbatim note about only one of them misses the contrast.",
      EXPR,
      "Rhetorical Synthesis",
    ),
    r(
      "The trial left one visible result___",
      STANDARD,
      ": the gilding held its color.",
      ["; a thin blue wash over the gilding.", ", the gilding held its color.", "the gilding held its color."],
      "An independent clause that announces a result takes a colon before the clause that states it. The semicolon option is only a noun phrase, the comma creates a splice, and the bare wording is a run-on.",
      "RW module 2 boundaries: a colon can introduce the result clause, while a semicolon fragment, a comma splice, and a run-on cannot.",
      CONV,
      "Boundaries",
    ),
    r(
      "Each of the folios, which the rival houses have disputed in print since the lawsuit, ___ still sealed today.",
      STANDARD,
      "is",
      ["are", "was", "were"],
      "Each is singular, and today requires the present. Folios and houses are nearer plural nouns, and was or were would fit a past cue that the sentence does not use.",
      "RW module 2 agreement: each stays singular across a long plural interrupter, and today keeps the verb in the present.",
      CONV,
      "Form, Structure, and Sense",
    ),
    r(
      "The envoy answered every point the committee had listed, and he did it in one unadorned sentence. The minutes record no complaint that the tone was rude. He was not withholding the harbor figures, and he did not sit through the hearing without a reply. The reply was ___.",
      WORD,
      "laconic",
      ["curt", "reticent", "mute"],
      "One unadorned sentence that still answers every point is laconic. Curt would require rudeness, which the minutes do not record, and reticent or mute would require silence or withheld figures.",
      "RW module 2 vocabulary: a complete one-sentence reply is laconic, not curt, reticent, or mute.",
      CRAFT,
      "Words in Context",
    ),
    r(
      "For years, archivists long assumed that guilds kept apprenticeship inside a single port and nowhere else. The rolls were cited as if the absence of a second harbor proved the limit. In Bristol, one case broke that assumption: the same master signed boys in two harbors in one season, and the second harbor's book uses his mark. The second harbor's book is dated to the same season and lists the same fee for each boy. The article offers a revised account in which the route, not the port, organized the training. The article does not ask the city to rewrite its festival or follow one apprentice from childhood.",
      PURPOSE,
      "The text sets a familiar assumption beside a case that breaks the assumption and a replacement account.",
      [
        "The text sets a familiar assumption beside a case that breaks the assumption and a call for a new law.",
        "The text places a proposed explanation beside an open question.",
        "The text follows the life of a single person from childhood to mastery.",
      ],
      "The passage starts from the single-port assumption, breaks it with the Bristol case, and offers a revised account. It does not propose a law, leave the question open, or tell one life.",
      "RW module 2 purpose: a single-port guild assumption is broken by one Bristol case and replaced, not left open or turned into a law.",
      CRAFT,
      "Text Structure and Purpose",
    ),
    r(
      "Excavators compared hearths along the ridge after a dry summer. Hearth ash was deepest where the old path runs, and the report treats the crust as the product of traffic. Wind and leaf fall were measured so they would not be mistaken for the path. The authors still need a finding that cuts the path explanation rather than one that repeats it.",
      weaken("the path crust"),
      "The crust still thickened where no traffic was allowed.",
      [
        "The crust thickened together with traffic while wind was held steady.",
        "Leaf fall still rose where no traffic was allowed.",
        "The crust still thickened where no sheds were built.",
      ],
      "If the crust thickened where traffic was forbidden, foot traffic cannot be the cause. A joint rise with traffic would support the claim, and leaf fall or sheds are not the crust.",
      "RW module 2 textual evidence: crust that thickens without traffic weakens the claim that foot traffic produced it.",
      INFO,
      "Command of Evidence",
    ),
    r(
      "Kiln logs from the teaching studio.\nRegion 2010 2014 2018\nGlaze 15 22 22\nClay 18 18 11\nFuel 9 14 16\nCounts are whole numbers.",
      quant("2014", "2018", "Glaze", "Clay"),
      "Glaze held from 22 to 22, and Clay fell from 18 to 11.",
      [
        "Glaze rose from 15 to 22, and Clay held from 18 to 18.",
        "Glaze held from 22 to 22, and Clay rose from 18 to 11.",
        "Glaze held from 22 to 22, and Fuel rose from 14 to 16.",
      ],
      "From 2014 to 2018 glaze stays at 22 and clay falls from 18 to 11. The other choices use 2010, reverse the clay change, or replace clay with fuel.",
      "RW module 2 quantitative evidence: glaze and clay from 2014 to 2018 are the pair, so an earlier span or the fuel row is the trap.",
      INFO,
      "Command of Evidence",
    ),
    r(
      "A sealed crate would be enough to prove shipment, but it is not enough once water damage is also true. The crate in the hold is sealed. Water damage is also true: the bilge line crosses the lid, and the tally clerk marked the box wet before it left the dock. The seal alone ___.",
      LOGIC,
      "cannot settle the question, because water damage prevents a sealed crate from proving shipment",
      [
        "proves shipment, because a sealed crate would be enough",
        "shows the crate was never sealed at all",
        "means water damage is irrelevant to the tally",
      ],
      "A seal would prove shipment only when water damage is absent. The damage is present, so it prevents that proof. The seal is real, and the damage is not irrelevant.",
      "RW module 2 logical completion: a seal stops proving shipment once water damage is also true.",
      INFO,
      "Inferences",
    ),
    r(
      "The harbor trade expanded after the dredging. ___ upriver markets shrank once the tolls took hold.",
      TRANS,
      "However,",
      ["Even so,", "Specifically,", "For instance,"],
      "Expanded trade and shrunken upriver markets are opposing results, so the link is contrast. The second sentence is not a concession carried through, a narrower case of the harbor trade, or an example introduced by a plural claim.",
      "RW module 2 transition: harbor expansion against upriver shrinkage is contrast, not concession, specification, or example.",
      EXPR,
      "Transitions",
    ),
    r(
      `${notesIntro}\n- Firing means heating clay until it becomes hard.\n- The studio bought its kiln in 1998.\n- Visitors asked about parking.`,
      goal("The student wants to introduce firing to an unfamiliar audience."),
      "Firing, heating clay until it becomes hard, is the step the studio expects visitors to learn.",
      [
        "The studio bought its kiln in 1998.",
        "Visitors asked about parking.",
        "Firing was mentioned in the studio brochure.",
      ],
      "An unfamiliar audience needs the meaning of firing, not the purchase year, the parking question, or the bare word with no definition.",
      "RW module 2 synthesis: introducing firing requires the definition of heating clay, so a date or a parking note misses the audience.",
      EXPR,
      "Rhetorical Synthesis",
    ),
    r(
      "The pigment___was reserved for the altar cloth.",
      STANDARD,
      "—the curator noted the source in the margin—",
      [
        "—the curator noted the source in the margin,",
        ", the curator noted the source in the margin—",
        "the curator noted the source in the margin",
      ],
      "The aside is a full interruption and needs a matched pair of dashes. One dash plus a comma, the reverse mismatch, and a bare insertion all leave the sentence unpunctuated in the middle.",
      "RW module 2 boundaries: only a matched pair of dashes sets off the curator's aside without breaking the sentence.",
      CONV,
      "Boundaries",
    ),
    r(
      "The archivists finished the inventory before the donor arrived, which left time for ___ to correct the errors.",
      STANDARD,
      "them",
      ["him", "her", "it"],
      "The people who finished the inventory, and who therefore had the time, are the archivists. Him or her would invent a single gendered person, and it would make the inventory correct itself.",
      "RW module 2 pronoun reference: the plural archivists, not the later donor or the inventory, had the time to correct the errors.",
      CONV,
      "Form, Structure, and Sense",
    ),
    r(
      "In her study of the 1720 quarantine, Dr. Ellison keeps the claim that harbor fees slowed the relief ships, but only for the weeks when the fee was collected at the outer bar. In the weeks the council waived the fee, those same ships made ordinary time. The fee weeks still show the full delay she first described. Her revision ___ the original claim.",
      WORD,
      "qualified",
      ["tempered", "moderated", "diluted"],
      "The revision limits the claim to the weeks the fee was actually collected, and inside those weeks the delay is still the full one she first described. Tempered or moderated would make that delay milder, and diluted would thin the claim.",
      "RW module 2 in-session vocabulary for Nov 27: qualified limits the quarantine claim to fee weeks without softening the delay itself.",
      CRAFT,
      "Words in Context",
    ),
    r(
      "Biologists tracking a cave colony of Mexican free-tailed bats had expected the animals to stay inside once nightly insects thinned. Mouth counts supported that expectation through August, when fewer insects meant fewer departures. September broke the pattern. On the warmest nights, when traps at the cave mouth were nearly empty, the bats still left in a dense stream and returned before dawn with full stomachs. The team then sampled moths drawn to orchard lamps two miles south and found those moths abundant only on the nights the colony flew. The paper sets the August expectation beside the September counts and then offers the orchard lamps as a possible explanation. Whether the lamps changed the bats' route, or merely coincided with a migration the August counts had missed, is left for a later season.",
      STRUCTURE,
      "The text sets an August expectation beside September counts that cut against it and an orchard-lamp explanation that is still untested.",
      [
        "The text sets an August expectation beside September counts that cut against it and proof that the lamps redirected the colony.",
        "The text reports full stomachs at dawn and abundant moths around the orchard lamps.",
        "The text accounts for the colony remaining in the cave once insects decline.",
      ],
      "August supplies the expectation, September cuts against it, and the lamps are offered without a decision. Proof that the lamps redirected the colony goes past the paper, the dawn and moth details omit the expectation, and remaining in the cave reverses September.",
      "RW module 2 in-session structure for Nov 27: an August expectation, September counts against it, and an untested orchard-lamp explanation.",
      CRAFT,
      "Text Structure and Purpose",
    ),
    r(
      "Text 1\nA dye manual printed in Lyon in 1684 treats the crimson used on altar cloths as a local invention of that decade. The writer describes an insect harvest along the Rhone, names the mordant mixed with the dye, and presents the recipe as beginning in the Lyon workshops. An earlier shipment is never mentioned. The manual does not discuss other ports, and it presents the 1680s harvest as the start of the color.\nText 2\nA Marseille shipping ledger from 1641 lists the same insect and the same mordant, consigned to a dyer in Lyon. The ledger never mentions altar cloths, and it does not claim that Marseille invented the color. The ink matches other entries from that voyage. What the ledger shows is that the materials were already moving toward Lyon more than forty years before the manual's date.",
      CROSS,
      "The ledger shows that the manual dates the recipe too late.",
      [
        "The ledger shows that the manual dates the recipe too early.",
        "The ledger shows that Marseille claimed the color as its own invention.",
        "The ledger shows that altar cloths were already being dyed in Marseille in 1641.",
      ],
      "The 1641 shipment puts the materials in motion decades before 1684, so the manual's start date is too late. Too early reverses that gap. The ledger does not give Marseille the invention, and it never mentions altar cloths.",
      "RW module 2 in-session cross-text for Nov 27: a 1641 Marseille ledger makes the Lyon manual's 1680s start too late.",
      CRAFT,
      "Cross-Text Connections",
    ),
    r(
      "After the city lowered the bridge toll, the change in cart traffic was not all in one direction. Morning carts on the west span increased, and the harbor master marked the largest gains before noon. Evening carts decreased over the same month, which he tied to a rule that shut the span at dusk. Foot traffic hardly moved in either part of the day. A poster at the tollhouse listed the new closing time, and clerks filed the retired tickets.",
      IDEA,
      "Morning carts increased while evening carts decreased.",
      [
        "Cart traffic increased after the toll was lowered.",
        "Foot traffic hardly moved after the toll was lowered.",
        "A poster at the tollhouse listed the new closing time.",
      ],
      "The paired result is a morning increase and an evening decrease. A general increase drops the evening drop, and the foot traffic and the poster are side details.",
      "RW module 2 in-session main idea for Nov 27: morning carts rose and evening carts fell, so a one-sided increase or a side detail misses the pair.",
      INFO,
      "Central Ideas and Details",
    ),
    r(
      "Growers covered half the berry rows with shade cloth and left the other half open. They claim the covered rows set more berries because the cloth lowered the peak heat, not because those rows received extra water. Irrigation was logged for every row.",
      "Which finding, if true, would most directly support the claim that the cloth, rather than a change in water, raised the berry set?",
      "Covered rows set more berries than open rows, and both halves received the same amount of water.",
      [
        "Covered rows set more berries than open rows, and the covered half was watered more often.",
        "Open rows set more berries than covered rows, and both halves received the same amount of water.",
        "Both halves received the same amount of water, and berry set was never counted.",
      ],
      "Same water plus a higher set on the covered rows isolates the cloth. Extra water on the covered half confounds the comparison, a higher set on the open rows cuts against the claim, and an uncounted set supplies no result.",
      "RW module 2 in-session textual evidence for Nov 27: equal water and a higher set under the cloth support the shade claim.",
      INFO,
      "Command of Evidence",
    ),
    r(
      "A historian argues that from 1804 to 1809 the northern dock lost traffic while the southern dock gained it.\nDock tallies during the embargo years.\nRegion 1801 1804 1809\nNorth 12 19 9\nSouth 7 7 14\nWest 4 6 6\nCounts are whole numbers.",
      "Which choice most effectively uses data from the table to support the historian's claim?",
      "From 1804 to 1809, North fell from 19 to 9, and South rose from 7 to 14.",
      [
        "From 1801 to 1804, North rose from 12 to 19, and South held from 7 to 7.",
        "From 1804 to 1809, North fell from 19 to 9, and West held from 6 to 6.",
        "From 1801 to 1804, West rose from 4 to 6, and South held from 7 to 7.",
      ],
      "Only the 1804-1809 pair shows North falling while South rises. The 1801-1804 rows are accurate for those earlier years, and the West comparison never shows the southern gain.",
      "RW module 2 in-session quantitative evidence for Nov 27: only North's fall and South's rise from 1804 to 1809 match the claim.",
      INFO,
      "Command of Evidence",
    ),
    r(
      "Last March the archive left out of its average every crate whose card had no weight, including crates that already carried a label. This crate has a label on two sides. Its weight line is empty, and the scale sheet never lists it. This crate ___.",
      LOGIC,
      "would be left out of the average",
      [
        "would be included in the average on the strength of its label",
        "shows that the label was never attached",
        "would be left out only if the label were missing too",
      ],
      "March already left out labeled crates that had no weight. This crate has a label and no weight, so it would be left out. The label is not enough, and it was in fact attached.",
      "RW module 2 in-session logical completion for Nov 27: a labeled crate with no weight follows the March practice of leaving such crates out.",
      INFO,
      "Inferences",
    ),
    r(
      "The restorers had planned to keep the south aisle closed for the whole month because the plaster was damp. ___ visitors were admitted on the last weekend, after that plaster had set.",
      TRANS,
      "However,",
      ["Even so,", "Specifically,", "Moreover,"],
      "The admission contrasts with the plan to stay closed, and it happened only after the plaster had set, not while the plaster was still damp. Even so would concede the dampness as still in force. The weekend is not a narrower case of staying closed, and it is not a fact added in the same direction.",
      "RW module 2 in-session transition for Nov 27: opening after the plaster set contrasts with the plan, so the link is However.",
      EXPR,
      "Transitions",
    ),
    r(
      `${notesIntro}\n- Shade cloth covered the west rows.\n- The east rows were left open to the sun.\n- Berry set was higher on the west rows than on the east rows.\n- Pickers cleared both halves on the same morning.`,
      goal("The student wants to emphasize the contrast between the shade cloth and the open rows."),
      "Berry set was higher under the shade cloth than on the rows left open to the sun.",
      [
        "Shade cloth covered the west rows, and pickers cleared both halves on the same morning.",
        "The east rows were left open to the sun, and pickers cleared both halves on the same morning.",
        "Berry set was higher on the west rows than on the east rows, and pickers cleared both halves on the same morning.",
      ],
      "The contrast needs both the shade cloth and the open rows, together with the difference in berry set. Either covering alone, or the berry difference without saying which rows were shaded, misses that contrast.",
      "RW module 2 in-session synthesis for Nov 27: the shade-cloth rows set more berries than the open rows, so a picking note misses the contrast.",
      EXPR,
      "Rhetorical Synthesis",
    ),
    r(
      "The appeal turned on a disputed line in the warehouse ledger. The ledger line for the missing cargo___was read aloud before the magistrate.",
      STANDARD,
      "—the only entry in a second hand—",
      [
        "—the only entry in a second hand,",
        ", the only entry in a second hand—",
        "the only entry in a second hand",
      ],
      "The remark about the second hand is a nonessential aside, so a matched pair of dashes sets it off. A dash closed by a comma, the reverse mismatch, and a bare insertion all break the sentence.",
      "RW module 2 in-session boundaries for Nov 27: only matched dashes set off the note that the cargo line is in a second hand.",
      CONV,
      "Boundaries",
    ),
    r(
      "By the time the gallery opened, the restorer ___ the flaking ground.",
      STANDARD,
      "had stabilized",
      ["stabilized", "has stabilized", "will stabilize"],
      "By the time plus a past opening requires the past perfect for work finished before that opening. Simple past, present perfect, and future all miss that earlier completion.",
      "RW module 2 tense: work finished before the gallery opened needs past perfect, not simple past or present perfect.",
      CONV,
      "Form, Structure, and Sense",
    ),
    r(
      "The brief looked convincing in outline, but the charter it depended on had been forged, so the reasoning only appeared sound. Readers who stop at the outline miss the forgery that empties the argument. The reasoning was ___.",
      WORD,
      "specious",
      ["plausible", "credible", "cogent"],
      "Reasoning that only appears sound because its charter was forged is specious. Plausible, credible, and cogent would leave the argument actually standing, which the forgery prevents.",
      "RW module 2 vocabulary: a forged charter makes the apparently sound brief specious rather than plausible, credible, or cogent.",
      CRAFT,
      "Words in Context",
    ),
    r(
      "Several coastal warehouses changed hands after the blockade. ___ the Santos loft was sold to a Lisbon broker in 1821.",
      TRANS,
      "For instance,",
      ["However,", "Therefore,", "Specifically,"],
      "The Santos sale is one case of the plural claim that several warehouses changed hands. For instance marks that example. The sale does not oppose the claim, follow as a separate caused result of a named imposition, or narrow it to an only-case.",
      "RW module 2 transition: one named 1821 sale illustrates the plural claim that several warehouses changed hands.",
      EXPR,
      "Transitions",
    ),
    r(
      `${notesIntro}\n- A ditch shard predates the accepted date by forty years.\n- The catalog was printed in a blue cover.\n- The exhibit opened on a Friday.`,
      goal("The student wants to highlight the evidence against the accepted date."),
      "A ditch shard predates the accepted date by forty years.",
      [
        "The catalog was printed in a blue cover.",
        "The exhibit opened on a Friday.",
        "The accepted date appears on the title page of the printed guide.",
      ],
      "The shard's earlier date is the evidence against the accepted date. The cover, the Friday opening, and the mere appearance of the date on a title page do not supply that earlier finding.",
      "RW module 2 synthesis: a shard that predates the accepted date is the evidence, so a cover color or an opening day is not.",
      EXPR,
      "Rhetorical Synthesis",
    ),
    r(
      `${notesIntro}\n- The fishing fleet will have to move its nets upriver.\n- The dam was finished in August.\n- Posters advertised the old landing.`,
      goal("The student wants to center the practical result for the fishing fleet."),
      "The fishing fleet will have to move its nets upriver.",
      [
        "The dam was finished in August.",
        "Posters advertised the old landing beside the customs house for three summers.",
        "The old landing appeared on a poster.",
      ],
      "The result for the fleet is that it will have to move its nets. The dam's finish date and the posters do not state what the fleet must do.",
      "RW module 2 synthesis: the fleet must move its nets, so a dam date or a poster does not center that result.",
      EXPR,
      "Rhetorical Synthesis",
    ),
  ],
  DEC11,
  DEC18,
];

if (RW_BY_DATE.some((date) => date.length !== 35)) {
  throw new Error(`RW date length ${RW_BY_DATE.map((date) => date.length).join(",")}`);
}
