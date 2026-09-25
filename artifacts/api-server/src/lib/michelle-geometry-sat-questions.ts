import { auditStudentQuizItem } from "./sat-bank-diagnostic-quality.ts";
import { enrichStimulusWithFigures } from "./sat-bank-figures.ts";
import { CANONICAL_APP_ORIGIN } from "./public-origin.ts";

/**
 * Original Digital SAT–style geometry items for one client follow-up.
 * Stems and line figures are written for this quiz. They are not College Board extracts.
 * Student-facing fields have an answer key and no solution text.
 */
export const GEOMETRY_SAT_FOLLOW_UP_TITLE = "Geometry SAT Questions";

export const GEOMETRY_SAT_FOLLOW_UP_TAG = "michelle-geometry-sat-follow-up";

export const GEOMETRY_SAT_FOLLOW_UP_INSTRUCTIONS =
  "Geometry practice assigned after your session. Choose one answer for each question. Your score is the percent correct.";

/** Original line figures, served like other quiz media under `/media`. */
export const GEOMETRY_SAT_FIGURE_DIR = "/media/geometry/michelle-sat";

export const GEOMETRY_SAT_FIGURE_NOTE = "Note: Figure not drawn to scale.";

export type GeometrySatChoice = { id: string; label: string; text: string };

export type GeometrySatFigure = { url: string; alt: string };

export type GeometrySatQuestionDraft = {
  key: string;
  skill: string;
  prompt: string;
  stimulus: string;
  figures: GeometrySatFigure[];
  choices: GeometrySatChoice[];
  correctAnswer: string;
};

const choice = (id: string, text: string): GeometrySatChoice => ({
  id,
  label: id.toUpperCase(),
  text,
});

/**
 * Hosted the same way diagnostic figures are: absolute `/media` URLs in
 * stimulus markdown. Filenames include `question-block` so a cited figure
 * counts as solvable. Relative `/media/...` markdown is treated as broken
 * OCR and the portal hides the stem.
 */
function attachedFigure(
  file: string,
  alt: string,
  notToScale = false,
): Pick<GeometrySatQuestionDraft, "figures" | "stimulus"> {
  const figures = [{ url: `${CANONICAL_APP_ORIGIN}${GEOMETRY_SAT_FIGURE_DIR}/${file}`, alt }];
  const image = enrichStimulusWithFigures(null, figures);
  if (!image) {
    throw new Error(`Geometry figure ${file} did not produce stimulus markdown.`);
  }
  return {
    figures,
    stimulus: notToScale ? `${image}\n\n${GEOMETRY_SAT_FIGURE_NOTE}` : image,
  };
}

export const GEOMETRY_SAT_QUESTIONS: readonly GeometrySatQuestionDraft[] = [
  {
    key: "q01-composite-l-polygon",
    skill: "Area of composite polygons",
    ...attachedFigure(
      "q01-l-floor-question-block.svg",
      "L-shaped floor with outer sides 18 m and 14 m and a removed corner 7 m by 6 m",
    ),
    prompt:
      "In the figure, an L-shaped floor is formed by removing a 7 m by 6 m rectangle from one corner of an 18 m by 14 m rectangle. What is the area, in square meters, of the remaining floor?",
    choices: [
      choice("a", "210"),
      choice("b", "168"),
      choice("c", "252"),
      choice("d", "196"),
    ],
    correctAnswer: "a",
  },
  {
    key: "q02-regular-hexagon-area",
    skill: "Area of regular polygons",
    ...attachedFigure(
      "q02-hexagon-question-block.svg",
      "Regular hexagon with side length 6",
    ),
    prompt:
      "In the figure, a regular hexagon has side length 6. What is the area of the hexagon?",
    choices: [
      choice("a", "108√3"),
      choice("b", "54√3"),
      choice("c", "18√3"),
      choice("d", "27√3"),
    ],
    correctAnswer: "b",
  },
  {
    key: "q03-apothem-decagon",
    skill: "Apothem and polygonal area",
    ...attachedFigure(
      "q03-decagon-question-block.svg",
      "Regular 10-sided polygon with side length 8 and apothem 6",
      true,
    ),
    prompt:
      "In the figure, a regular polygon has 10 sides. Each side has length 8, and the apothem has length 6. What is the area of the polygon?",
    choices: [
      choice("a", "480"),
      choice("b", "160"),
      choice("c", "80"),
      choice("d", "240"),
    ],
    correctAnswer: "d",
  },
  {
    key: "q04-similar-prism-volume",
    skill: "Similar solids and volume",
    ...attachedFigure(
      "q04-prisms-question-block.svg",
      "Two similar rectangular prisms with corresponding edges 5 cm and 8 cm",
      true,
    ),
    prompt:
      "In the figure, two similar rectangular prisms have corresponding edge lengths in the ratio 5 to 8. The volume of the smaller prism is 250 cubic centimeters. What is the volume, in cubic centimeters, of the larger prism?",
    choices: [
      choice("a", "1024"),
      choice("b", "640"),
      choice("c", "2048"),
      choice("d", "400"),
    ],
    correctAnswer: "a",
  },
  {
    key: "q05-cylinder-cone-volume",
    skill: "Volume of cones and cylinders",
    ...attachedFigure(
      "q05-cylinder-cone-question-block.svg",
      "Cylinder and cone with radius 6 and height 10",
      true,
    ),
    prompt:
      "In the figure, a cylinder and a cone have the same radius, 6, and the same height, 10. How much greater is the volume of the cylinder than the volume of the cone?",
    choices: [
      choice("a", "360π"),
      choice("b", "120π"),
      choice("c", "240π"),
      choice("d", "180π"),
    ],
    correctAnswer: "c",
  },
  {
    key: "q06-rectangle-semicircle",
    skill: "Composite polygonal and circular area",
    ...attachedFigure(
      "q06-rectangle-semicircle-question-block.svg",
      "Rectangle 12 by 5 with a semicircle of diameter 12",
    ),
    prompt:
      "In the figure, a region consists of a 12 by 5 rectangle and a semicircle whose diameter is the side of length 12. What is the area of the combined region?",
    choices: [
      choice("a", "60 + 36π"),
      choice("b", "72 + 18π"),
      choice("c", "60 + 9π"),
      choice("d", "60 + 18π"),
    ],
    correctAnswer: "d",
  },
  {
    key: "q07-rectangle-triangle-polygon",
    skill: "Area by polygonal triangulation",
    ...attachedFigure(
      "q07-rectangle-triangle-question-block.svg",
      "Rectangle 16 by 9 with an attached right triangle of base 16 and height 5",
    ),
    prompt:
      "In the figure, a polygonal region is a 16 by 9 rectangle with a right triangle attached along one longer side. The triangle has base 16 and height 5, measured perpendicular to that side. What is the area of the combined region?",
    choices: [
      choice("a", "164"),
      choice("b", "184"),
      choice("c", "224"),
      choice("d", "144"),
    ],
    correctAnswer: "b",
  },
  {
    key: "q08-similar-spheres",
    skill: "Similar solids and volume",
    ...attachedFigure(
      "q08-spheres-question-block.svg",
      "Two spheres with radii 3 and 6",
    ),
    prompt:
      "In the figure, a solid sphere has radius 3. A second sphere is similar to the first, and the ratio of the second radius to the first radius is 2 to 1. What is the volume of the second sphere?",
    choices: [
      choice("a", "288π"),
      choice("b", "864π"),
      choice("c", "72π"),
      choice("d", "144π"),
    ],
    correctAnswer: "a",
  },
  {
    key: "q09-inscribed-square",
    skill: "Polygons inscribed in circles",
    ...attachedFigure(
      "q09-inscribed-square-question-block.svg",
      "Square inscribed in a circle of radius 5",
    ),
    prompt:
      "In the figure, a square is inscribed in a circle so that every vertex of the square lies on the circle. The radius of the circle is 5. What is the area of the square?",
    choices: [
      choice("a", "25π"),
      choice("b", "100"),
      choice("c", "50"),
      choice("d", "25"),
    ],
    correctAnswer: "c",
  },
  {
    key: "q10-prism-surface-from-volume",
    skill: "Surface area and volume",
    ...attachedFigure(
      "q10-prism-question-block.svg",
      "Rectangular prism with base edges 8 cm and 5 cm",
      true,
    ),
    prompt:
      "In the figure, a rectangular prism has a volume of 240 cubic centimeters. Its base is a rectangle with side lengths 8 centimeters and 5 centimeters. What is the surface area, in square centimeters, of the prism?",
    choices: [
      choice("a", "280"),
      choice("b", "118"),
      choice("c", "196"),
      choice("d", "236"),
    ],
    correctAnswer: "d",
  },
  {
    key: "q11-similar-polygon-area",
    skill: "Similar polygons and area",
    ...attachedFigure(
      "q11-polygons-question-block.svg",
      "Two similar polygons with corresponding sides 6 and 15",
    ),
    prompt:
      "In the figure, two similar polygons have corresponding side lengths 6 and 15. The area of the smaller polygon is 48 square units. What is the area, in square units, of the larger polygon?",
    choices: [
      choice("a", "192"),
      choice("b", "300"),
      choice("c", "750"),
      choice("d", "120"),
    ],
    correctAnswer: "b",
  },
  {
    key: "q12-cylinder-with-hole",
    skill: "Volume of composite solids",
    ...attachedFigure(
      "q12-cylinder-hole-question-block.svg",
      "Cylinder of radius 4 and height 9 with a hole of radius 2",
      true,
    ),
    prompt:
      "In the figure, a cylindrical block has radius 4 and height 9. A cylindrical hole of radius 2 is bored through the block along its full height. What is the volume of the material that remains?",
    choices: [
      choice("a", "144π"),
      choice("b", "36π"),
      choice("c", "108π"),
      choice("d", "72π"),
    ],
    correctAnswer: "c",
  },
];

export function geometrySatQuestionCount(): number {
  return GEOMETRY_SAT_QUESTIONS.length;
}

export type GeometryQuestionSnapshot = {
  id: string;
  tags: string[] | null;
  prompt: string;
  stimulus: string | null;
  choices: Array<{ id: string; label: string; text: string }>;
  correctAnswer: string;
  explanation: string;
  skill: string;
};

function choicesMatch(
  current: Array<{ id: string; label: string; text: string }>,
  next: readonly GeometrySatChoice[],
): boolean {
  if (current.length !== next.length) return false;
  return current.every(
    (choice, index) =>
      choice.id === next[index]?.id &&
      choice.label === next[index]?.label &&
      choice.text === next[index]?.text,
  );
}

export function geometryQuestionContentMatches(
  current: GeometryQuestionSnapshot,
  draft: GeometrySatQuestionDraft,
): boolean {
  return (
    current.prompt === draft.prompt &&
    (current.stimulus ?? "") === draft.stimulus &&
    current.correctAnswer === draft.correctAnswer &&
    current.explanation === "" &&
    current.skill === draft.skill &&
    choicesMatch(current.choices, draft.choices)
  );
}

/** Michelle-tagged rows only. Other clients' questions are not in the update list. */
export function geometryQuestionsNeedingRefresh(
  rows: readonly GeometryQuestionSnapshot[],
): Array<{ id: string; draft: GeometrySatQuestionDraft }> {
  const updates: Array<{ id: string; draft: GeometrySatQuestionDraft }> = [];
  for (const draft of GEOMETRY_SAT_QUESTIONS) {
    const row = rows.find((item) => {
      const tags = item.tags ?? [];
      return tags.includes(GEOMETRY_SAT_FOLLOW_UP_TAG) && tags.includes(draft.key);
    });
    if (!row || geometryQuestionContentMatches(row, draft)) continue;
    updates.push({ id: row.id, draft });
  }
  return updates;
}

export function auditGeometrySatQuestions(): Array<{
  key: string;
  reasons: string[];
}> {
  const failed: Array<{ key: string; reasons: string[] }> = [];
  for (const item of GEOMETRY_SAT_QUESTIONS) {
    const audit = auditStudentQuizItem({
      id: item.key,
      prompt: item.prompt,
      stimulus: item.stimulus,
      choices: item.choices,
      questionType: "multiple_choice",
      correctAnswer: item.correctAnswer,
      subject: "SAT Math",
      domain: "Geometry",
      section: "math",
      figures: item.figures,
    });
    if (!audit.ok) failed.push({ key: item.key, reasons: audit.reasons });
  }
  return failed;
}
