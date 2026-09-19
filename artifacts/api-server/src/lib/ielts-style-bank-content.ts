/**
 * Original IELTS-style practice. Not official IELTS, Cambridge, British Council,
 * or IDP material. Do not scrape or reconstruct published exam items.
 */

export const IELTS_STYLE_COPYRIGHT_NOTICE =
  "Original IELTS-style practice authored for Accepted Admissions. Not official IELTS / Cambridge / British Council / IDP test content.";

export const IELTS_STYLE_EXAM_FAMILY = "ielts";
export const IELTS_STYLE_VARIANT = "academic_style";
export const IELTS_STYLE_SOURCE_KIND = "original";
export const IELTS_STYLE_COLLECTION_SLUG = "ielts-style-original-practice";
export const IELTS_STYLE_COLLECTION_TITLE =
  "IELTS-style original practice (not official IELTS)";
export const IELTS_STYLE_COLLECTION_NOTES =
  "Original Reading MCQ and Writing prompts for English sessions. Fail-closed assign uses complete A–D items only. Writing tasks are tutor-review and are not auto-scored. Listening audio is not hosted in this slice.";

export type IeltsStyleChoice = { id: "a" | "b" | "c" | "d"; label: "A" | "B" | "C" | "D"; text: string };

export type IeltsStyleMcq = {
  skill: string;
  domain: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  choices: [IeltsStyleChoice, IeltsStyleChoice, IeltsStyleChoice, IeltsStyleChoice];
  correctAnswer: "a" | "b" | "c" | "d";
  explanation: string;
  estimatedSeconds: number;
};

export type IeltsStylePassage = {
  id: string;
  set: "diagnostic" | "routine-1" | "routine-2";
  module: 1 | 2 | 3;
  title: string;
  stimulus: string;
  questions: IeltsStyleMcq[];
};

export type IeltsStyleWritingTask = {
  id: string;
  skill: string;
  domain: string;
  difficulty: "medium" | "hard";
  prompt: string;
  stimulus: string;
  explanation: string;
  estimatedSeconds: number;
};

function choice(
  id: IeltsStyleChoice["id"],
  text: string,
): IeltsStyleChoice {
  return { id, label: id.toUpperCase() as IeltsStyleChoice["label"], text };
}

function mcq(
  skill: string,
  difficulty: IeltsStyleMcq["difficulty"],
  prompt: string,
  answers: [string, string, string, string],
  correctAnswer: IeltsStyleMcq["correctAnswer"],
  explanation: string,
  estimatedSeconds = 90,
): IeltsStyleMcq {
  return {
    skill,
    domain: "IELTS Reading",
    difficulty,
    prompt,
    choices: [
      choice("a", answers[0]),
      choice("b", answers[1]),
      choice("c", answers[2]),
      choice("d", answers[3]),
    ],
    correctAnswer,
    explanation,
    estimatedSeconds,
  };
}

export const IELTS_STYLE_PASSAGES: IeltsStylePassage[] = [
  {
    id: "harbor-night-market",
    set: "diagnostic",
    module: 1,
    title: "A harbor night-market refrigeration cooperative",
    stimulus: `In the port town of Kell Harbor, the Friday night market grew faster than the electrical grid around it. Stallholders selling fish, dumplings, and cut fruit had long relied on a patchwork of household freezers wheeled onto the quay. When two overloaded circuits failed during a heatwave, the harbor authority offered a different model: a shared refrigeration cooperative housed in a former net loft.

Membership is modest. Each stall pays a weekly fee scaled to cubic metres reserved, not to nightly revenue. A rotating pair of vendors checks temperatures at opening and closing and logs any door left ajar. The cooperative does not deliver ice to stalls. Instead, vendors collect labelled crates from a single loading door, which has reduced the number of extension cords crossing the pedestrian lane.

The arrangement has trade-offs. Vendors who sell only three hours a week argue that they subsidise those who keep stock overnight. The board answered by adding a short-stay shelf with a higher hourly rate and a hard 11 p.m. clear-out. Waste has fallen because unsold fish can be held safely until Saturday’s smaller morning market, but the loft’s compressor is audible from the adjacent rowing club, which has asked for a later start on race mornings.

A city energy officer notes that the cooperative’s load is smoother than twenty independent freezers cycling at once. That stability, not cheaper electricity, is why the harbour agreed to underwrite the first year’s maintenance. If membership drops below twelve stalls, the underwriting ends. For now, the night market keeps its reputation for cold drinks and intact seafood, and the quay has fewer orange cables for visitors to trip over.`,
    questions: [
      mcq(
        "Main idea",
        "medium",
        "What is the main purpose of the passage?",
        [
          "To argue that night markets should be banned during heatwaves",
          "To describe a shared refrigeration model and its practical effects",
          "To compare Kell Harbor’s cuisine with other port towns",
          "To explain how to repair an overloaded household freezer",
        ],
        "b",
        "The passage centres on the cooperative’s design, fees, benefits, and remaining tensions.",
      ),
      mcq(
        "Detail",
        "easy",
        "How is a stall’s weekly cooperative fee determined?",
        [
          "By the stall’s nightly revenue",
          "By the number of staff working the stall",
          "By the cubic metres of space reserved",
          "By the length of the stall’s extension cord",
        ],
        "c",
        "The second paragraph states the fee is scaled to cubic metres reserved, not nightly revenue.",
      ),
      mcq(
        "Detail",
        "medium",
        "What change reduced extension cords on the pedestrian lane?",
        [
          "Vendors now collect labelled crates from one loading door",
          "The rowing club banned freezers after 6 p.m.",
          "The city delivered ice to every stall",
          "Household freezers were fitted with longer cables",
        ],
        "a",
        "Collection from a single loading door is explicitly linked to fewer cords across the lane.",
      ),
      mcq(
        "Inference",
        "medium",
        "Why did the board add a short-stay shelf with a higher hourly rate?",
        [
          "To punish vendors who sell fish",
          "To address part-time vendors who felt they were subsidising overnight storage",
          "To satisfy the rowing club’s request for a later start",
          "To increase the harbour’s electricity profit",
        ],
        "b",
        "The short-stay shelf is presented as the board’s answer to vendors who sell only three hours a week.",
      ),
      mcq(
        "Writer's views",
        "medium",
        "According to the energy officer, why did the harbour underwrite the first year’s maintenance?",
        [
          "Because electricity became cheaper for every household",
          "Because the cooperative’s demand is steadier than many independent freezers",
          "Because the rowing club agreed to move its races",
          "Because membership is guaranteed to stay above twenty stalls",
        ],
        "b",
        "The officer says stability of load, not cheaper electricity, justified the underwriting.",
      ),
      mcq(
        "Vocabulary in context",
        "medium",
        "In the final paragraph, “underwrite” is closest in meaning to",
        [
          "publicly criticise",
          "financially guarantee",
          "physically rebuild",
          "temporarily close",
        ],
        "b",
        "The harbour covers first-year maintenance and will stop if membership falls, which is a financial guarantee.",
      ),
    ],
  },
  {
    id: "valley-weather-observers",
    set: "diagnostic",
    module: 1,
    title: "Volunteer weather observers in a mountain valley",
    stimulus: `The Lirren Valley has no staffed weather station. Forecast models treat the valley floor as a single grid cell, yet frost often settles in the western orchards while the eastern slopes stay two degrees warmer. For twelve years, a volunteer network has filled that gap with simple instruments and a shared log.

Observers are orchardists, a retired bus driver, and two secondary-school teachers. Each keeps a shaded thermometer, a rain gauge clear of roof drip, and a notebook with the same column headings. Readings are taken at 7 a.m. local time. The group’s coordinator, Mara Chen, transcribes the week’s sheets every Sunday and flags any gauge that sat under a leaking gutter.

The data are not a substitute for a national station. Volunteers miss travel days, and one winter a snow-laden branch bent a gauge so that it under-reported for a fortnight. What the network does provide is a pattern: the western hollow is consistently the first to frost, and a narrow wind corridor near the old quarry delays frost by a night or two after a cold front.

The regional agriculture office now uses those notes when it issues orchard warnings. It does not pay the volunteers. It did, however, replace three cracked gauges and print waterproof cards with the column headings after a wet autumn turned several notebooks into pulp. Mara argues that the next improvement is not a more expensive sensor but a second observer at the hollow, so a missed morning does not erase the valley’s most sensitive site.`,
    questions: [
      mcq(
        "Main idea",
        "medium",
        "What problem does the volunteer network mainly try to solve?",
        [
          "A lack of paid jobs for retired bus drivers",
          "Forecast models that miss frost differences inside the valley",
          "A shortage of secondary-school science teachers",
          "National stations that refuse to share rainfall totals",
        ],
        "b",
        "The opening contrasts a single grid cell with frost that varies between orchards and slopes.",
      ),
      mcq(
        "Detail",
        "easy",
        "When are the volunteer readings taken?",
        [
          "At sunset",
          "At 7 a.m. local time",
          "Whenever a frost warning is issued",
          "Only on Sundays",
        ],
        "b",
        "The second paragraph states readings are taken at 7 a.m. local time.",
      ),
      mcq(
        "Detail",
        "medium",
        "What caused a gauge to under-report for about two weeks?",
        [
          "Mara transcribed the wrong Sunday sheet",
          "A snow-laden branch bent the gauge",
          "The agriculture office replaced the wrong instrument",
          "A leaking gutter overflowed the notebook",
        ],
        "b",
        "A snow-laden branch bent a gauge so that it under-reported for a fortnight.",
      ),
      mcq(
        "Inference",
        "medium",
        "Why is the western hollow described as the valley’s most sensitive site?",
        [
          "It is the only place with a paid observer",
          "It is consistently the first location to frost",
          "It receives the most rainfall in summer",
          "It is closest to the national weather station",
        ],
        "b",
        "The pattern section says the western hollow is consistently first to frost; Mara wants a second observer there.",
      ),
      mcq(
        "Detail",
        "easy",
        "How has the regional agriculture office supported the volunteers?",
        [
          "By paying each observer a weekly wage",
          "By replacing cracked gauges and printing waterproof cards",
          "By moving the national station into the valley",
          "By cancelling orchard warnings on travel days",
        ],
        "b",
        "The office replaced three cracked gauges and printed waterproof column-heading cards.",
      ),
      mcq(
        "Writer's views",
        "hard",
        "What does Mara Chen believe should come next?",
        [
          "Buying the most expensive sensors available",
          "Ending Sunday transcription",
          "Adding a second observer at the hollow rather than costlier equipment",
          "Paying volunteers from orchard-warning fees",
        ],
        "c",
        "The closing sentence contrasts a more expensive sensor with a second observer at the hollow.",
      ),
    ],
  },
  {
    id: "tool-lending-library",
    set: "diagnostic",
    module: 1,
    title: "A municipal tool-lending library",
    stimulus: `When the city of North Barrow converted a disused reading room into a tool-lending library, councillors expected drills and ladders to be the headline. Eighteen months later, the most borrowed items are a tile cutter, a wallpaper steamer, and a soil-testing kit. The librarian, Idris Cole, says residents are not trying to become contractors. They are finishing one awkward job without buying a tool they will store for a decade.

Borrowing is free with a library card. Late fees exist, but Idris prefers a same-day text and a Saturday repair clinic staffed by two retired electricians. Tools that come back dirty are not fined; they are booked onto a cleaning shelf. The only hard refusal is a tool with a cut power cord. That item is tagged and sent out of circulation until a technician signs it off.

Insurance was the political hurdle. The city’s existing public-liability policy did not mention lending saws. A specialist rider now covers injury from a library tool used as instructed, but not from homemade modifications. A laminated card in every case lists the intended use in one sentence. Idris admits some cards are blunt: the tile cutter’s card says it is for ceramic tile, not for pruning trees.

Usage data surprised the housing office. Borrowers cluster in two postcodes with many rented terraces, where landlords rarely supply specialist tools. The office now points new tenants to the library in the welcome pack. Critics still call the service a gift to hobbyists. Idris answers with the steamer’s log: most loans last forty-eight hours, and the same names rarely appear twice in a month. The library is less a clubhouse than a way to keep a one-off job from becoming a landfill purchase.`,
    questions: [
      mcq(
        "Main idea",
        "medium",
        "What is the passage mainly about?",
        [
          "Why North Barrow closed its reading room",
          "How a city tool-lending service is used and governed",
          "A comparison of drills and ladders across cities",
          "Instructions for repairing a cut power cord",
        ],
        "b",
        "The text covers what is borrowed, rules, insurance, and who uses the service.",
      ),
      mcq(
        "Detail",
        "easy",
        "Which items have been borrowed most often?",
        [
          "Drills, ladders, and hammers",
          "A tile cutter, a wallpaper steamer, and a soil-testing kit",
          "Saws that have been modified at home",
          "Books about becoming a contractor",
        ],
        "b",
        "The opening paragraph lists those three items as the most borrowed.",
      ),
      mcq(
        "Detail",
        "medium",
        "What happens to a tool that is returned with a cut power cord?",
        [
          "The borrower is fined and the tool stays on the shelf",
          "It is tagged and kept out of circulation until a technician signs it off",
          "It is given to the housing office",
          "It is cleaned on Saturday and lent again that afternoon",
        ],
        "b",
        "A cut cord is the only hard refusal; the tool is tagged and withdrawn until signed off.",
      ),
      mcq(
        "Inference",
        "medium",
        "Why does the tile cutter’s card mention ceramic tile and not pruning trees?",
        [
          "The insurance rider covers intended use, not homemade modifications",
          "The city wants to sell more trees",
          "Retired electricians refused to repair garden tools",
          "The housing office banned all outdoor work",
        ],
        "a",
        "The insurance paragraph and the blunt cards are linked: cover applies to instructed use.",
      ),
      mcq(
        "Detail",
        "easy",
        "Where do borrowers mainly live, according to the housing office data?",
        [
          "In newly built suburban villas",
          "In two postcodes with many rented terraces",
          "Only in streets next to the library",
          "In industrial units outside the city",
        ],
        "b",
        "Usage clusters in two postcodes with many rented terraces.",
      ),
      mcq(
        "Writer's views",
        "medium",
        "How does Idris respond to the claim that the library is a gift to hobbyists?",
        [
          "He publishes a list of contractors who donate tools",
          "He points to short loans and few repeat names in a month",
          "He argues late fees should be higher",
          "He says drills remain the most borrowed item",
        ],
        "b",
        "The steamer log shows forty-eight-hour loans and few repeat names, supporting a one-off-job reading.",
      ),
    ],
  },
  {
    id: "bus-depot-inventory",
    set: "diagnostic",
    module: 1,
    title: "Night-shift parts inventory at a bus depot",
    stimulus: `The municipal bus depot in East Caldon used to treat the night shift as a quiet holding pattern: sweep the bays, top up washer fluid, and wait for the first driver at 4:40 a.m. That changed after three morning services were cancelled because a common door-seal kit was “on the shelf” in the computer system and nowhere in the cage.

The new rule is unglamorous. Between 11 p.m. and 2 a.m., two technicians walk a printed pick-list of the twenty parts that most often delay a pull-out. They do not audit the entire storeroom. They confirm that those twenty lines are physically present, labelled, and not sitting in a driver’s cab from the previous evening. A mismatch is logged before the day supervisor arrives, not after a bus has failed to leave.

The union initially disliked the extra walking. The compromise was to drop two low-value cleaning tasks from the night list and to heat the cage to a tolerable 12°C. Within six weeks, door-seal shortages stopped appearing in the morning cancellation notes. A side effect was cultural: night staff began leaving a one-line note on any part that looked worn but was still officially “serviceable.” Day supervisors now treat those notes as a queue, not as complaints.

The inventory software was not replaced. A consultant had quoted a full barcode rebuild that the depot could not fund this year. The printed pick-list is, in the operations manager’s phrase, “a cheap honesty layer.” It will fail if the twenty-part list goes stale. Every quarter the manager compares cancellation codes with the list and swaps two items. The point is not a perfect warehouse. It is that the morning should not discover an empty bin that the computer still calls full.`,
    questions: [
      mcq(
        "Main idea",
        "medium",
        "What change does the passage describe?",
        [
          "Replacing all depot software with a barcode system",
          "A limited night check of high-impact parts to prevent morning cancellations",
          "Moving the first driver start time to 4:40 a.m.",
          "Closing the parts cage during winter",
        ],
        "b",
        "The new rule is a short night walk of twenty critical parts, not a full rebuild.",
      ),
      mcq(
        "Detail",
        "easy",
        "What problem triggered the new night procedure?",
        [
          "Washer fluid ran out on every bus",
          "Three morning services were cancelled when a door-seal kit was missing",
          "The union demanded heated offices",
          "A consultant refused to quote for software",
        ],
        "b",
        "The first paragraph ties the change to cancelled services and a missing door-seal kit.",
      ),
      mcq(
        "Detail",
        "medium",
        "What do the night technicians confirm about the twenty parts?",
        [
          "That they are on sale to other depots",
          "That they are physically present, labelled, and not left in a cab",
          "That they have been replaced with barcodes",
          "That they belong to the union",
        ],
        "b",
        "The second paragraph lists presence, labels, and not sitting in a driver’s cab.",
      ),
      mcq(
        "Inference",
        "medium",
        "Why was heating the cage part of the compromise with the union?",
        [
          "Because extra walking was unpopular and two cleaning tasks were dropped in exchange",
          "Because the consultant required 12°C for barcodes",
          "Because door seals freeze below 12°C",
          "Because day supervisors refused to read notes",
        ],
        "a",
        "The union disliked extra walking; the compromise dropped cleaning tasks and heated the cage.",
      ),
      mcq(
        "Vocabulary in context",
        "medium",
        "The operations manager’s phrase “a cheap honesty layer” refers to",
        [
          "a full software rebuild",
          "a simple physical check that exposes false computer stock",
          "a union rule about night pay",
          "a heated waiting room for drivers",
        ],
        "b",
        "The printed pick-list is contrasted with an unaffordable barcode rebuild and with computer records that can be wrong.",
      ),
      mcq(
        "Detail",
        "easy",
        "How does the manager keep the twenty-part list from going stale?",
        [
          "By replacing the entire list every Monday",
          "By comparing cancellation codes with the list each quarter and swapping two items",
          "By asking drivers to rewrite the list nightly",
          "By buying whatever the consultant recommends",
        ],
        "b",
        "Every quarter the manager compares cancellation codes and swaps two items.",
      ),
    ],
  },
  {
    id: "bakery-fermentation",
    set: "routine-1",
    module: 2,
    title: "Fermentation logs in a neighborhood bakery",
    stimulus: `At Wren Street Bakery the sourdough programme looks artistic in the window and bureaucratic in the back. Each starter jar has a card: time fed, room temperature, dough temperature, and a one-word note such as “sluggish” or “sharp.” The owner, Leila Ortiz, started the cards after a humid week produced loaves that split at the score and tasted overly acidic.

The cards are not a secret recipe. They are a way to see that the same starter behaves differently when the mixer room sits at 24°C instead of 20°C. Apprentices used to “correct” a slow rise by adding extra yeast from a supermarket sachet. That made the day’s loaves predictable and made the starter weaker over the following week. The log made the shortcut visible because the card still said “unfed” while the dough had risen on commercial yeast.

Leila now forbids sachet yeast in the sourdough line. If a dough is slow, the bake is delayed or the batch is sold as rolls with a printed explanation. Customers complained at first. After three months, the complaints shifted from sourness to availability: people wanted the same loaf on Tuesday that they had tasted on Saturday. The log cannot manufacture identical weather. It can stop the shop from pretending that every day is the same day.

A visiting food-science student asked why Leila does not automate the room. She could. A used HVAC controller is cheaper than a month of wasted flour. She prefers the cards because they train attention. “If the room is perfect,” she told the student, “nobody notices the starter until it fails in public.”`,
    questions: [
      mcq(
        "Main idea",
        "medium",
        "Why does Wren Street Bakery keep fermentation cards?",
        [
          "To hide a secret recipe from apprentices",
          "To record conditions so staff can see why dough behaves differently",
          "To satisfy a city hygiene inspector’s weekly visit",
          "To advertise supermarket yeast in the window",
        ],
        "b",
        "The cards track time, temperatures, and notes so staff can see environmental effects.",
      ),
      mcq(
        "Detail",
        "easy",
        "What problem first led Leila to introduce the cards?",
        [
          "A humid week produced split, overly acidic loaves",
          "Customers demanded gluten-free bread",
          "The HVAC controller broke",
          "Apprentices refused to work on Tuesdays",
        ],
        "a",
        "The first paragraph links the cards to a humid week of split, acidic loaves.",
      ),
      mcq(
        "Detail",
        "medium",
        "How did the log reveal the supermarket-yeast shortcut?",
        [
          "The card still said “unfed” while the dough had risen on commercial yeast",
          "Customers posted photos of sachets",
          "The food-science student inspected the mixer",
          "The city banned sourdough",
        ],
        "a",
        "The mismatch between an unfed card and a risen dough exposed the shortcut.",
      ),
      mcq(
        "Inference",
        "medium",
        "What does Leila choose to do when a sourdough batch is slow?",
        [
          "Add supermarket yeast and keep the schedule",
          "Delay the bake or sell the batch as rolls with an explanation",
          "Close the bakery for the day",
          "Raise the room to 30°C immediately",
        ],
        "b",
        "She forbids sachet yeast on that line and either delays the bake or sells rolls with a printed note.",
      ),
      mcq(
        "Writer's views",
        "hard",
        "Why does Leila prefer cards to a fully automated room?",
        [
          "Because HVAC controllers are illegal in bakeries",
          "Because she wants staff to keep noticing the starter before it fails in public",
          "Because customers dislike identical loaves",
          "Because the student asked her to refuse technology",
        ],
        "b",
        "She says a perfect room would mean nobody notices the starter until a public failure.",
      ),
      mcq(
        "Vocabulary in context",
        "easy",
        "In the first paragraph, “sluggish” most nearly describes",
        [
          "a starter that is slow to show activity",
          "a customer who arrives late",
          "an oven that is too hot",
          "a loaf that is too sweet",
        ],
        "a",
        "The word sits on a starter card beside fermentation notes, so it refers to slow starter activity.",
      ),
    ],
  },
  {
    id: "coastal-trail-club",
    set: "routine-1",
    module: 2,
    title: "A high-school club measuring coastal-trail erosion",
    stimulus: `Each autumn, students at Mare Point High School adopt a 400-metre stretch of cliff-top path. They are not there to rebuild the path. They measure how far the outer edge has moved since the previous year using a simple method: a tape from three fixed posts set in inland rock, photographs from the same standing marks, and a note about any new fence or warning sign.

The club began after a parent noticed that a picnic bench had been moved inland twice in five years while official maps still showed the old alignment. The town’s coastal engineer welcomed the students on one condition: they would not post “the cliff is collapsing tomorrow” on social media. Their job is a yearly comparison, not a forecast.

The first two seasons taught them that storms do not move the edge evenly. A clay section near the steps lost 40 centimetres one winter; a rocky knuckle barely changed. The engineer used that contrast when she argued for a short boardwalk over the clay instead of closing the whole path. The students’ photographs, time-stamped and boring, were more persuasive in committee than a dramatic drone clip from a visitor.

Parents still worry about students standing near an edge. The school’s rule is firm: measurements are taken from the inland posts, never from the lip. If a post is lost to a slump, the club does not replace it themselves. They mark the gap and wait for the engineer. The project’s value is continuity, not heroics. A new Year 10 cohort inherits the same three posts and the same refusal to turn a tape measure into a panic.`,
    questions: [
      mcq(
        "Main idea",
        "medium",
        "What is the club’s main task?",
        [
          "To rebuild the cliff-top path each autumn",
          "To record yearly change in the path’s outer edge with a repeatable method",
          "To post urgent collapse warnings on social media",
          "To replace picnic benches for the town",
        ],
        "b",
        "They measure edge movement with posts, photos, and notes; they do not rebuild or forecast.",
      ),
      mcq(
        "Detail",
        "easy",
        "What condition did the coastal engineer set?",
        [
          "Students must pay for a new boardwalk",
          "Students must not post claims that the cliff is collapsing tomorrow",
          "Students must stand on the lip to get accurate photos",
          "Students must replace lost posts the same day",
        ],
        "b",
        "The engineer welcomed them if they would not post panic forecasts.",
      ),
      mcq(
        "Detail",
        "medium",
        "What contrast did the first two seasons show?",
        [
          "The whole path moved 40 centimetres evenly",
          "A clay section lost far more ground than a rocky knuckle",
          "Official maps were more accurate than photographs",
          "Drone clips were required by the committee",
        ],
        "b",
        "The clay near the steps lost 40 cm; the rocky knuckle barely changed.",
      ),
      mcq(
        "Inference",
        "medium",
        "Why were the students’ photographs useful in committee?",
        [
          "They were time-stamped comparisons rather than a dramatic one-off clip",
          "They proved the path should be closed entirely",
          "They showed students standing on the lip",
          "They replaced the need for an engineer",
        ],
        "a",
        "The text contrasts boring time-stamped photos with a dramatic visitor drone clip.",
      ),
      mcq(
        "Detail",
        "easy",
        "What must the club do if a measuring post is lost to a slump?",
        [
          "Replace it immediately without waiting",
          "Mark the gap and wait for the engineer",
          "Close the high school for a week",
          "Move the picnic bench back to the old alignment",
        ],
        "b",
        "They mark the gap and wait; they do not replace posts themselves.",
      ),
      mcq(
        "Writer's views",
        "medium",
        "The final sentence suggests the project’s discipline is",
        [
          "to turn measurements into panic",
          "to keep the same method and refuse sensational claims",
          "to train students as professional engineers in one term",
          "to update official maps every week",
        ],
        "b",
        "A new cohort inherits the same posts and the same refusal to turn a tape measure into a panic.",
      ),
    ],
  },
  {
    id: "ferry-timetable",
    set: "routine-2",
    module: 3,
    title: "Redesigning a harbor ferry timetable",
    stimulus: `The crossing between Pell Quay and Holm Jetty takes eleven minutes in good weather. For years the timetable assumed that eleven minutes plus four minutes of loading would always fit a twenty-minute clock-face: departures at :00, :20, and :40. In practice, a late commuter, a bicycle, or a low tide at Holm added three to six minutes, and the next departure inherited the delay.

A winter review plotted actual departure times from the ticket scanner. The :20 sailing was the worst offender because it met both the school boat from the east and a shift change at the fish plant. The operator’s first idea was to add a fourth boat. The harbour refused: the pontoons cannot berth four vessels at once, and a spare crew was not funded.

The accepted redesign looks smaller. The :20 departure moved to :25, creating a five-minute buffer after the school boat. The :40 became :45. The :00 morning sailings stayed put because factory workers said a later boat would miss the plant whistle. Published journey time is now “about 15 minutes including loading,” which matches the scanner more closely than the old promise of eleven.

Complaints arrived from people who had memorised the old clock-face. The operator printed a one-week comparison card and staffed the quay with a person who only answered timetable questions. Within a fortnight the late-inherited delays on the mid-morning sailings dropped. The lesson the harbour recorded was not that passengers dislike change. It was that a tidy clock-face is a poor substitute for the actual five minutes a bicycle needs on a wet ramp.`,
    questions: [
      mcq(
        "Main idea",
        "medium",
        "What was wrong with the old twenty-minute clock-face?",
        [
          "The crossing never took eleven minutes even in good weather",
          "Small loading delays stacked onto the next departure",
          "The harbour wanted to ban bicycles",
          "Factory workers refused to use the ferry",
        ],
        "b",
        "Late loading caused the next departure to inherit the delay.",
      ),
      mcq(
        "Detail",
        "easy",
        "Why was the :20 sailing the most unreliable?",
        [
          "It was the only sailing that carried bicycles",
          "It coincided with the school boat and a fish-plant shift change",
          "The ticket scanner did not work at :20",
          "The pontoon was closed at :20",
        ],
        "b",
        "The winter review links the :20 sailing to the school boat and the plant shift change.",
      ),
      mcq(
        "Detail",
        "medium",
        "Why did the harbour reject a fourth boat?",
        [
          "Passengers preferred a slower crossing",
          "The pontoons cannot berth four vessels, and a spare crew was not funded",
          "The school boat already used four berths",
          "The ticket scanner cannot handle four departures",
        ],
        "b",
        "Berthing limits and an unfunded spare crew blocked the extra boat.",
      ),
      mcq(
        "Detail",
        "easy",
        "Which morning sailings kept their original time, and why?",
        [
          "The :00 sailings, so factory workers would not miss the plant whistle",
          "The :20 sailings, because students liked the old time",
          "The :40 sailings, because the ramp is dry then",
          "All sailings moved by five minutes",
        ],
        "a",
        "The :00 morning sailings stayed so workers would not miss the plant whistle.",
      ),
      mcq(
        "Inference",
        "medium",
        "Why did the operator publish “about 15 minutes including loading”?",
        [
          "To make the crossing sound faster than eleven minutes",
          "To match scanner data instead of an optimistic eleven-minute promise",
          "To include a stop at the fish plant",
          "To justify buying a fourth boat",
        ],
        "b",
        "The new published time matches the scanner more closely than the old eleven-minute claim.",
      ),
      mcq(
        "Writer's views",
        "medium",
        "What lesson did the harbour record?",
        [
          "Passengers will never accept a new timetable",
          "A neat clock-face is a poor substitute for real loading time",
          "Bicycles should be banned from wet ramps",
          "School boats should be cancelled in winter",
        ],
        "b",
        "The closing sentence says a tidy clock-face does not replace the minutes a bicycle needs on a wet ramp.",
      ),
    ],
  },
  {
    id: "urban-beekeeping",
    set: "routine-2",
    module: 3,
    title: "A hearing on an urban beekeeping ordinance",
    stimulus: `The city council of Lower Stead called a hearing after neighbours on two streets reported swarm collections in the same week. The draft ordinance was not a ban. It required hive registration, a water source on the same lot, and a flyway barrier — a fence or hedge at least two metres high — so departing bees would gain height before crossing a pavement.

Beekeepers argued that a rigid two-metre rule would punish a rooftop hive on a four-storey building, where the bees already leave above head height. Allergists asked for a maximum hive count on lots next to playgrounds. A rooftop gardener said bees had improved her tomato set and that the swarm reports were more about surprise than injury.

The planning officer tried to separate three issues that had been mixed in public comments: nuisance on pavements, genuine allergy risk, and the desire to keep honey production as a cottage sale. The draft said nothing about selling honey. That omission made some councillors nervous and others relieved.

The compromise sent back for legal drafting was narrower than either camp wanted. Registration stays. The water-source rule stays. The flyway barrier applies to ground-level hives only; rooftop hives must instead sit at least three metres from the roof edge facing a street. Lots adjoining playgrounds may keep two hives, not five. Selling honey from a front garden still falls under the existing casual-trading permit, which the ordinance does not rewrite. The officer’s minutes end with a sentence the chair asked to keep: the city is regulating flight paths over pavements, not declaring a position on whether every resident should like bees.`,
    questions: [
      mcq(
        "Main idea",
        "medium",
        "What is the hearing mainly trying to decide?",
        [
          "Whether to ban all urban bees",
          "How to regulate hive placement and neighbour impacts without a total ban",
          "Whether tomatoes need bees to survive",
          "How to replace casual-trading permits",
        ],
        "b",
        "The draft and compromise set registration and placement rules; they are not a ban.",
      ),
      mcq(
        "Detail",
        "easy",
        "What did the original draft require besides registration?",
        [
          "A city-owned honey shop",
          "A water source on the same lot and a two-metre flyway barrier",
          "Five hives next to every playground",
          "A ban on rooftop gardens",
        ],
        "b",
        "The first paragraph lists registration, an on-lot water source, and a two-metre flyway barrier.",
      ),
      mcq(
        "Detail",
        "medium",
        "Why did beekeepers object to a rigid two-metre barrier rule?",
        [
          "Because rooftop hives already launch above head height",
          "Because they wanted to sell honey without a permit",
          "Because allergists supported five hives",
          "Because the chair disliked tomatoes",
        ],
        "a",
        "They said a rooftop hive on a four-storey building already leaves above head height.",
      ),
      mcq(
        "Detail",
        "easy",
        "What limit applies to lots adjoining playgrounds in the compromise?",
        [
          "No hives at all",
          "Two hives rather than five",
          "Five hives and a honey stall",
          "Unlimited rooftop hives",
        ],
        "b",
        "The compromise allows two hives, not five, on lots adjoining playgrounds.",
      ),
      mcq(
        "Inference",
        "hard",
        "Why did omitting honey sales from the draft make some councillors nervous and others relieved?",
        [
          "Because the hearing had mixed nuisance, allergy, and cottage sales into one argument",
          "Because honey sales were already illegal everywhere",
          "Because the planning officer wanted to ban tomatoes",
          "Because registration was removed from the compromise",
        ],
        "a",
        "The officer had to separate those three issues; leaving sales untouched split political reactions.",
      ),
      mcq(
        "Writer's views",
        "medium",
        "The chair’s kept sentence emphasises that the city is",
        [
          "endorsing bees as a hobby for every resident",
          "regulating pavement flight paths, not requiring residents to like bees",
          "rewriting the casual-trading permit",
          "banning ground-level hives entirely",
        ],
        "b",
        "The minutes say the city regulates flight paths over pavements, not whether everyone should like bees.",
      ),
    ],
  },
];

export const IELTS_STYLE_WRITING_TASKS: IeltsStyleWritingTask[] = [
  {
    id: "writing-rooftop-gardens",
    skill: "Essay organisation",
    domain: "IELTS Writing",
    difficulty: "medium",
    prompt:
      "Writing task (tutor review, not auto-scored): Some cities want unused rooftops turned into shared gardens. Do the advantages of this policy outweigh the disadvantages? Write at least 250 words. Use your own examples; do not copy published exam essays.",
    stimulus:
      "Plan before you write: take a position, give two developed reasons, mention one genuine drawback, and finish with a short conclusion. Original IELTS-style practice — not an official prompt.",
    explanation:
      "Tutors score argument, paragraphing, and lexical range. There is no single letter key. Students should not be auto-marked correct or incorrect.",
    estimatedSeconds: 2400,
  },
  {
    id: "writing-ferry-table",
    skill: "Data description",
    domain: "IELTS Writing",
    difficulty: "medium",
    prompt:
      "Writing task (tutor review, not auto-scored): The table shows average weekday passengers on the Pell–Holm ferry. Summarise the main features and make comparisons. Write at least 150 words. Do not invent official IELTS charts.",
    stimulus:
      "Weekday average passengers (original practice table)\nEarly :00 factory sailing: 62\nMid-morning :25 sailing: 41\nAfternoon :45 sailing: 28\nSaturday mid-morning (included for contrast): 19\n\nDescribe the pattern only. Original IELTS-style practice — not an official Task 1 figure.",
    explanation:
      "Tutors look for an overview (factory sailing busiest; Saturday lowest) and accurate comparisons. No auto-score letter key.",
    estimatedSeconds: 1200,
  },
];

export function ieltsStyleReadingItems(): Array<IeltsStylePassage["questions"][number] & {
  passageId: string;
  set: IeltsStylePassage["set"];
  module: IeltsStylePassage["module"];
  stimulus: string;
  passageTitle: string;
}> {
  return IELTS_STYLE_PASSAGES.flatMap((passage) =>
    passage.questions.map((question) => ({
      ...question,
      passageId: passage.id,
      set: passage.set,
      module: passage.module,
      stimulus: `${passage.title}\n\n${passage.stimulus}`,
      passageTitle: passage.title,
    })),
  );
}
