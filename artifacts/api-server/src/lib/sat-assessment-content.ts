export type SeedSatQuestion = {
  prompt: string;
  stimulus?: string | null;
  domain: string;
  skill: string;
  difficulty: "foundational" | "medium" | "hard";
  choices: readonly { id: string; label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  subject?: string;
};

export const SAT_DIAGNOSTIC_RW_QUESTIONS: readonly SeedSatQuestion[] = [
  {
    prompt: "Which choice most effectively combines the sentences while maintaining standard English conventions?",
    stimulus:
      "The community archive contains letters, maps, and photographs from the town's earliest residents. Together, these materials reveal how the waterfront changed over time.",
    domain: "Standard English Conventions",
    skill: "Boundaries",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "residents, together these" },
      { id: "b", label: "B", text: "residents; together, these" },
      { id: "c", label: "C", text: "residents together these" },
      { id: "d", label: "D", text: "residents: together these" },
    ],
    correctAnswer: "b",
    explanation:
      "A semicolon correctly joins two independent clauses, and the introductory adverb is followed by a comma.",
  },
  {
    prompt: "Which conclusion is best supported by the study?",
    stimulus:
      "In a greenhouse study, seedlings receiving six hours of filtered light grew taller than seedlings receiving six hours of direct light, while both groups received equal water and nutrients.",
    domain: "Information and Ideas",
    skill: "Command of Evidence",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "Filtered light always improves plant health." },
      { id: "b", label: "B", text: "Water affected the groups differently." },
      { id: "c", label: "C", text: "Light conditions may influence seedling height." },
      { id: "d", label: "D", text: "Direct light prevents all seedling growth." },
    ],
    correctAnswer: "c",
    explanation:
      "The controlled comparison supports a limited conclusion about a possible relationship between light conditions and height.",
  },
  {
    prompt: "Which choice completes the text with the most logical transition?",
    stimulus:
      "The first prototype was inexpensive to produce. _____, it was too fragile for repeated classroom use.",
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "Similarly" },
      { id: "b", label: "B", text: "However" },
      { id: "c", label: "C", text: "For example" },
      { id: "d", label: "D", text: "Therefore" },
    ],
    correctAnswer: "b",
    explanation:
      "The second sentence contrasts the prototype's low cost with its lack of durability, so “However” is logical.",
  },
  {
    prompt: "Which choice completes the text so that it conforms to the conventions of Standard English?",
    stimulus:
      "The museum's new exhibit features three artists _____ work explores migration and memory.",
    domain: "Standard English Conventions",
    skill: "Form, Structure, and Sense",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "who's" },
      { id: "b", label: "B", text: "whose" },
      { id: "c", label: "C", text: "whom's" },
      { id: "d", label: "D", text: "who" },
    ],
    correctAnswer: "b",
    explanation: "The possessive relative pronoun “whose” correctly describes the artists' work.",
  },
  {
    prompt: "Which choice most effectively states the main idea of the text?",
    stimulus:
      "Rather than replacing the old footbridge, residents repaired its supports and added a ramp. The project preserved a familiar landmark while making the crossing safer for more people.",
    domain: "Information and Ideas",
    skill: "Central Ideas and Details",
    difficulty: "foundational",
    choices: [
      { id: "a", label: "A", text: "A landmark was removed after years of neglect." },
      { id: "b", label: "B", text: "Residents balanced preservation with improved access." },
      { id: "c", label: "C", text: "The footbridge was moved to a new location." },
      { id: "d", label: "D", text: "Only visitors use the repaired footbridge." },
    ],
    correctAnswer: "b",
    explanation:
      "The text emphasizes both preserving the bridge and improving its safety and accessibility.",
  },
  {
    prompt: "Which choice completes the text with the most logical transition?",
    stimulus:
      "The first trial used recycled paper. _____, the research team tested a version made from agricultural waste.",
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "In contrast" },
      { id: "b", label: "B", text: "Next" },
      { id: "c", label: "C", text: "For instance" },
      { id: "d", label: "D", text: "Nevertheless" },
    ],
    correctAnswer: "b",
    explanation: "“Next” clearly signals the subsequent step in the team's testing process.",
  },
  {
    prompt: "Which choice best describes the function of the underlined sentence in the text as a whole?",
    stimulus:
      "Many coastal plants tolerate salt in the soil. This adaptation allows them to survive where freshwater species cannot.",
    domain: "Information and Ideas",
    skill: "Text Structure and Purpose",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "It introduces a problem that the next sentence disproves." },
      { id: "b", label: "B", text: "It gives an example that clarifies a broader claim." },
      { id: "c", label: "C", text: "It presents a counterargument to the study." },
      { id: "d", label: "D", text: "It lists two unrelated observations." },
    ],
    correctAnswer: "b",
    explanation:
      "The second sentence explains why salt tolerance matters, clarifying the observation in the first sentence.",
  },
  {
    prompt: "Which choice completes the text so that it conforms to the conventions of Standard English?",
    stimulus:
      "The solar panels, installed on the library's roof last spring, _____ enough electricity to power the reading room.",
    domain: "Standard English Conventions",
    skill: "Subject-Verb Agreement",
    difficulty: "foundational",
    choices: [
      { id: "a", label: "A", text: "generates" },
      { id: "b", label: "B", text: "generate" },
      { id: "c", label: "C", text: "is generating" },
      { id: "d", label: "D", text: "has generated" },
    ],
    correctAnswer: "b",
    explanation: "The plural subject “panels” takes the plural verb “generate.”",
  },
  {
    prompt: "Which choice most logically completes the text?",
    stimulus:
      "The city tested two designs for a protected bike lane. The design with a planted divider received more favorable safety ratings from riders.",
    domain: "Information and Ideas",
    skill: "Inferences",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "Riders preferred the design with a planted divider." },
      { id: "b", label: "B", text: "The city ended all bicycle programs." },
      { id: "c", label: "C", text: "Planting trees always reduces traffic." },
      { id: "d", label: "D", text: "Both designs received identical ratings." },
    ],
    correctAnswer: "a",
    explanation:
      "More favorable ratings indicate that riders preferred the protected-lane design with a planted divider.",
  },
  {
    prompt: "Which choice completes the text with the most logical transition?",
    stimulus:
      "The recipe requires only four ingredients. _____, the finished dish has a complex flavor.",
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "As a result" },
      { id: "b", label: "B", text: "In addition" },
      { id: "c", label: "C", text: "Even so" },
      { id: "d", label: "D", text: "For example" },
    ],
    correctAnswer: "c",
    explanation:
      "“Even so” signals the contrast between the recipe's simplicity and the dish's complex flavor.",
  },
  {
    prompt: "As used in the text, what does “calibrate” most nearly mean?",
    stimulus:
      "Before publishing the results, the lab had to calibrate its sensors against a known reference so the readings would stay trustworthy.",
    domain: "Craft and Structure",
    skill: "Words in Context",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "adjust for accuracy" },
      { id: "b", label: "B", text: "discard without testing" },
      { id: "c", label: "C", text: "advertise widely" },
      { id: "d", label: "D", text: "store for later use" },
    ],
    correctAnswer: "a",
    explanation: "Comparing sensors to a reference means adjusting them for accuracy.",
  },
  {
    prompt: "Which choice best supports the claim that the program improved access?",
    stimulus:
      "A city library added evening study rooms and began offering bilingual homework help twice each week.",
    domain: "Information and Ideas",
    skill: "Command of Evidence",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "Evening attendance rose, and more multilingual families used the homework help." },
      { id: "b", label: "B", text: "The library kept its weekend hours unchanged." },
      { id: "c", label: "C", text: "Some shelves were rearranged during the summer." },
      { id: "d", label: "D", text: "The building was painted a different color." },
    ],
    correctAnswer: "a",
    explanation: "Rising evening attendance and broader family use directly support improved access.",
  },
  {
    prompt: "Which choice completes the text so that it conforms to the conventions of Standard English?",
    stimulus:
      "Neither the maps nor the handwritten ledger _____ the exact year the pier was rebuilt.",
    domain: "Standard English Conventions",
    skill: "Subject-Verb Agreement",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "list" },
      { id: "b", label: "B", text: "lists" },
      { id: "c", label: "C", text: "are listing" },
      { id: "d", label: "D", text: "have listed" },
    ],
    correctAnswer: "b",
    explanation: "With “neither…nor,” the verb agrees with the nearer subject “ledger,” which is singular.",
  },
  {
    prompt: "Which choice most effectively emphasizes the growth of the volunteer program?",
    stimulus:
      "Notes: The garden program began in 2022 with 12 volunteers. In 2026, 46 volunteers maintained six neighborhood plots.",
    domain: "Expression of Ideas",
    skill: "Rhetorical Synthesis",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "The program uses neighborhood plots." },
      { id: "b", label: "B", text: "From 12 volunteers in 2022, the program grew to 46 volunteers maintaining six plots in 2026." },
      { id: "c", label: "C", text: "Some volunteers enjoy gardening." },
      { id: "d", label: "D", text: "The year 2026 followed the year 2022." },
    ],
    correctAnswer: "b",
    explanation: "Choice B uses both dates and volunteer counts to make the growth clear.",
  },
  {
    prompt: "Which inference is best supported by the text?",
    stimulus:
      "After the library moved its returns desk closer to the entrance, the average line became shorter even though daily visitor totals stayed about the same.",
    domain: "Information and Ideas",
    skill: "Inferences",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "The new desk location may have made returns more efficient." },
      { id: "b", label: "B", text: "The library had no visitors before the change." },
      { id: "c", label: "C", text: "Every visitor returned a book." },
      { id: "d", label: "D", text: "Daily visitor totals doubled." },
    ],
    correctAnswer: "a",
    explanation: "Shorter lines with similar visitor totals support a cautious inference about efficiency.",
  },
  {
    prompt: "Which choice completes the text with the most logical transition?",
    stimulus:
      "The first map showed only major roads. _____, the revised map included walking paths and public stairways.",
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "By contrast" },
      { id: "b", label: "B", text: "For example" },
      { id: "c", label: "C", text: "Therefore" },
      { id: "d", label: "D", text: "Likewise" },
    ],
    correctAnswer: "a",
    explanation: "The revised map contains information the first map omitted, so a contrast is needed.",
  },
  {
    prompt: "Which choice best states the function of the second sentence?",
    stimulus:
      "Early drafts of the policy were hard to follow. Clearer headings and shorter paragraphs later made the same rules easier for residents to apply.",
    domain: "Craft and Structure",
    skill: "Text Structure and Purpose",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "It shows how a revision improved usability." },
      { id: "b", label: "B", text: "It introduces an unrelated city ordinance." },
      { id: "c", label: "C", text: "It argues that rules should never change." },
      { id: "d", label: "D", text: "It questions whether residents read policies." },
    ],
    correctAnswer: "a",
    explanation: "The second sentence explains how formatting changes made the policy easier to use.",
  },
  {
    prompt: "Which choice completes the text so that it conforms to the conventions of Standard English?",
    stimulus:
      "The researchers asked participants to record _____ sleep and screen time for two weeks.",
    domain: "Standard English Conventions",
    skill: "Form, Structure, and Sense",
    difficulty: "foundational",
    choices: [
      { id: "a", label: "A", text: "they're" },
      { id: "b", label: "B", text: "there" },
      { id: "c", label: "C", text: "their" },
      { id: "d", label: "D", text: "theirs" },
    ],
    correctAnswer: "c",
    explanation: "The possessive determiner “their” correctly modifies “sleep and screen time.”",
  },
] as const;

export const SAT_DIAGNOSTIC_MATH_QUESTIONS: readonly SeedSatQuestion[] = [
  {
    subject: "SAT Math",
    prompt: "If 3x − 7 = 14, what is the value of x?",
    domain: "Algebra",
    skill: "Linear equations",
    difficulty: "foundational",
    choices: [
      { id: "a", label: "A", text: "5" },
      { id: "b", label: "B", text: "7" },
      { id: "c", label: "C", text: "21" },
      { id: "d", label: "D", text: "3" },
    ],
    correctAnswer: "b",
    explanation: "Add 7 to both sides to get 3x = 21, then divide by 3 to get x = 7.",
  },
  {
    subject: "SAT Math",
    prompt: "A store discounts a $80 jacket by 25%. What is the sale price?",
    domain: "Problem-Solving and Data Analysis",
    skill: "Percents",
    difficulty: "foundational",
    choices: [
      { id: "a", label: "A", text: "$20" },
      { id: "b", label: "B", text: "$55" },
      { id: "c", label: "C", text: "$60" },
      { id: "d", label: "D", text: "$75" },
    ],
    correctAnswer: "c",
    explanation: "25% of 80 is 20, so the sale price is 80 − 20 = 60.",
  },
  {
    subject: "SAT Math",
    prompt: "Which value of x satisfies the equation 2(x + 4) = 3x − 1?",
    domain: "Algebra",
    skill: "Linear equations",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "5" },
      { id: "b", label: "B", text: "7" },
      { id: "c", label: "C", text: "9" },
      { id: "d", label: "D", text: "11" },
    ],
    correctAnswer: "c",
    explanation: "Expand to 2x + 8 = 3x − 1, then 8 + 1 = 3x − 2x, so x = 9.",
  },
  {
    subject: "SAT Math",
    prompt: "A rectangle has a length of 12 and a width of 5. What is its area?",
    domain: "Geometry and Trigonometry",
    skill: "Area and volume",
    difficulty: "foundational",
    choices: [
      { id: "a", label: "A", text: "17" },
      { id: "b", label: "B", text: "34" },
      { id: "c", label: "C", text: "60" },
      { id: "d", label: "D", text: "120" },
    ],
    correctAnswer: "c",
    explanation: "Area equals length times width: 12 × 5 = 60.",
  },
  {
    subject: "SAT Math",
    prompt: "If y = 2x + 3 and x = 4, what is the value of y?",
    domain: "Algebra",
    skill: "Linear functions",
    difficulty: "foundational",
    choices: [
      { id: "a", label: "A", text: "5" },
      { id: "b", label: "B", text: "8" },
      { id: "c", label: "C", text: "11" },
      { id: "d", label: "D", text: "14" },
    ],
    correctAnswer: "c",
    explanation: "Substitute x = 4 into y = 2x + 3 to get y = 8 + 3 = 11.",
  },
  {
    subject: "SAT Math",
    prompt: "A data set has values 4, 6, 6, 8, and 11. What is the median?",
    domain: "Problem-Solving and Data Analysis",
    skill: "Data distributions",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "4" },
      { id: "b", label: "B", text: "6" },
      { id: "c", label: "C", text: "7" },
      { id: "d", label: "D", text: "8" },
    ],
    correctAnswer: "b",
    explanation: "In ordered form, the middle value of five numbers is the third value, 6.",
  },
  {
    subject: "SAT Math",
    prompt: "Which expression is equivalent to (x + 3)(x − 5)?",
    domain: "Advanced Math",
    skill: "Quadratic equations",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "x² − 2x − 15" },
      { id: "b", label: "B", text: "x² + 8x − 15" },
      { id: "c", label: "C", text: "x² − 15" },
      { id: "d", label: "D", text: "x² − 2x + 15" },
    ],
    correctAnswer: "a",
    explanation: "Expand: x² − 5x + 3x − 15 = x² − 2x − 15.",
  },
  {
    subject: "SAT Math",
    prompt: "A car travels 150 miles in 2.5 hours at a constant speed. What is its speed in miles per hour?",
    domain: "Problem-Solving and Data Analysis",
    skill: "Rates",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "50" },
      { id: "b", label: "B", text: "60" },
      { id: "c", label: "C", text: "75" },
      { id: "d", label: "D", text: "90" },
    ],
    correctAnswer: "b",
    explanation: "Speed equals distance divided by time: 150 ÷ 2.5 = 60.",
  },
  {
    subject: "SAT Math",
    prompt: "If 5 is 20% of n, what is n?",
    domain: "Problem-Solving and Data Analysis",
    skill: "Percents",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "1" },
      { id: "b", label: "B", text: "20" },
      { id: "c", label: "C", text: "25" },
      { id: "d", label: "D", text: "100" },
    ],
    correctAnswer: "c",
    explanation: "0.20n = 5 → n = 5 / 0.20 = 25.",
  },
  {
    subject: "SAT Math",
    prompt: "In the xy-plane, what is the slope of the line through (0, 2) and (4, 10)?",
    domain: "Algebra",
    skill: "Linear functions",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "1" },
      { id: "b", label: "B", text: "2" },
      { id: "c", label: "C", text: "3" },
      { id: "d", label: "D", text: "4" },
    ],
    correctAnswer: "b",
    explanation: "Slope = (10 − 2) / (4 − 0) = 8 / 4 = 2.",
  },
  {
    subject: "SAT Math",
    prompt: "A right triangle has legs of length 6 and 8. What is the length of the hypotenuse?",
    domain: "Geometry and Trigonometry",
    skill: "Right triangles",
    difficulty: "medium",
    choices: [
      { id: "a", label: "A", text: "8" },
      { id: "b", label: "B", text: "10" },
      { id: "c", label: "C", text: "12" },
      { id: "d", label: "D", text: "14" },
    ],
    correctAnswer: "b",
    explanation: "By the Pythagorean theorem, √(36 + 64) = √100 = 10.",
  },
  {
    subject: "SAT Math",
    prompt: "Which value of x makes the equation x² − 9 = 0 true?",
    domain: "Advanced Math",
    skill: "Quadratic equations",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "−9 only" },
      { id: "b", label: "B", text: "3 only" },
      { id: "c", label: "C", text: "−3 and 3" },
      { id: "d", label: "D", text: "0 and 9" },
    ],
    correctAnswer: "c",
    explanation: "x² = 9 → x = ±3.",
  },
] as const;

export const FULL_SAT_DIAGNOSTIC_QUESTIONS: readonly SeedSatQuestion[] = [
  ...SAT_DIAGNOSTIC_RW_QUESTIONS,
  ...SAT_DIAGNOSTIC_MATH_QUESTIONS,
];

export const HARD_BANK_SEED_QUESTIONS: readonly SeedSatQuestion[] = [
  {
    prompt: "Which conclusion is best supported by the evidence?",
    stimulus:
      "In a two-week comparison, seedlings in the shaded plot retained more water than seedlings in the unshaded plot, while both plots received the same amount of rain.",
    domain: "Information and Ideas",
    skill: "Command of Evidence",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "Shade may help the soil retain moisture." },
      { id: "b", label: "B", text: "Every plant grows best in shade." },
      { id: "c", label: "C", text: "Rain never reaches shaded plots." },
      { id: "d", label: "D", text: "The comparison proves all soil is identical." },
    ],
    correctAnswer: "a",
    explanation:
      "The controlled comparison supports a limited relationship between shade and moisture retention.",
  },
  {
    prompt: "Which choice completes the text with the most logical transition?",
    stimulus:
      "The design reduced material waste during production. _____, the team continued testing its durability.",
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "However" },
      { id: "b", label: "B", text: "For example" },
      { id: "c", label: "C", text: "Similarly" },
      { id: "d", label: "D", text: "In particular" },
    ],
    correctAnswer: "a",
    explanation:
      "The second sentence introduces a related but contrasting concern, so “However” is the logical transition.",
  },
  {
    subject: "SAT Math",
    prompt: "If 2x + 5 = 3(x − 1), what is x?",
    domain: "Algebra",
    skill: "Linear equations",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "2" },
      { id: "b", label: "B", text: "5" },
      { id: "c", label: "C", text: "8" },
      { id: "d", label: "D", text: "11" },
    ],
    correctAnswer: "c",
    explanation: "2x + 5 = 3x − 3 → 5 + 3 = 3x − 2x → x = 8.",
  },
  {
    subject: "SAT Math",
    prompt: "A circle has radius 5. What is its area in terms of π?",
    domain: "Geometry and Trigonometry",
    skill: "Area and volume",
    difficulty: "hard",
    choices: [
      { id: "a", label: "A", text: "5π" },
      { id: "b", label: "B", text: "10π" },
      { id: "c", label: "C", text: "25π" },
      { id: "d", label: "D", text: "50π" },
    ],
    correctAnswer: "c",
    explanation: "Area = πr² = π · 25 = 25π.",
  },
] as const;
