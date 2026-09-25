import { auditStudentQuizItem } from "./sat-bank-diagnostic-quality.ts";

/**
 * Original Digital SAT–style geometry items for one client follow-up.
 * Stems are written for this quiz. They are not College Board extracts.
 * Student-facing fields have an answer key and no solution text.
 */
export const GEOMETRY_SAT_FOLLOW_UP_TITLE = "Geometry SAT Questions";

export const GEOMETRY_SAT_FOLLOW_UP_TAG = "michelle-geometry-sat-follow-up";

export const GEOMETRY_SAT_FOLLOW_UP_INSTRUCTIONS =
  "Geometry practice assigned after your session. Choose one answer for each question. Your score is the percent correct.";

export type GeometrySatChoice = { id: string; label: string; text: string };

export type GeometrySatQuestionDraft = {
  key: string;
  skill: string;
  prompt: string;
  choices: GeometrySatChoice[];
  correctAnswer: string;
};

const choice = (id: string, text: string): GeometrySatChoice => ({
  id,
  label: id.toUpperCase(),
  text,
});

export const GEOMETRY_SAT_QUESTIONS: readonly GeometrySatQuestionDraft[] = [
  {
    key: "q01-composite-l-polygon",
    skill: "Area of composite polygons",
    prompt:
      "An L-shaped polygonal floor is formed by cutting a 7-meter by 6-meter rectangle out of one corner of an 18-meter by 14-meter rectangle. What is the area, in square meters, of the remaining floor?",
    choices: [
      choice("a", "168 square meters."),
      choice("b", "196 square meters."),
      choice("c", "210 square meters."),
      choice("d", "252 square meters."),
    ],
    correctAnswer: "c",
  },
  {
    key: "q02-regular-hexagon-area",
    skill: "Area of regular polygons",
    prompt:
      "A regular hexagon has side length 6. The area of a regular hexagon equals the combined area of 6 equilateral triangles whose sides match the hexagon. The area of an equilateral triangle with side length s is (square root of 3) divided by 4, times s squared. What is the area of the hexagon?",
    choices: [
      choice("a", "18 times the square root of 3."),
      choice("b", "27 times the square root of 3."),
      choice("c", "54 times the square root of 3."),
      choice("d", "108 times the square root of 3."),
    ],
    correctAnswer: "c",
  },
  {
    key: "q03-apothem-decagon",
    skill: "Apothem and polygonal area",
    prompt:
      "A regular polygon has 10 sides. Each side has length 8, and the apothem has length 6. The area of a regular polygon is one-half the product of its perimeter and its apothem. What is the area of the polygon?",
    choices: [
      choice("a", "80 square units."),
      choice("b", "160 square units."),
      choice("c", "240 square units."),
      choice("d", "480 square units."),
    ],
    correctAnswer: "c",
  },
  {
    key: "q04-similar-prism-volume",
    skill: "Similar solids and volume",
    prompt:
      "Two similar rectangular prisms have corresponding edge lengths in the ratio 5 to 8. The volume of the smaller prism is 250 cubic centimeters. What is the volume, in cubic centimeters, of the larger prism?",
    choices: [
      choice("a", "400 cubic centimeters."),
      choice("b", "640 cubic centimeters."),
      choice("c", "1024 cubic centimeters."),
      choice("d", "2048 cubic centimeters."),
    ],
    correctAnswer: "c",
  },
  {
    key: "q05-cylinder-cone-volume",
    skill: "Volume of cones and cylinders",
    prompt:
      "A cylinder and a cone have the same radius, 6, and the same height, 10. The volume of a cylinder is pi times the square of the radius times the height. The volume of a cone is one-third of that product for the same radius and height. How much greater is the volume of the cylinder than the volume of the cone?",
    choices: [
      choice("a", "120 pi."),
      choice("b", "180 pi."),
      choice("c", "240 pi."),
      choice("d", "360 pi."),
    ],
    correctAnswer: "c",
  },
  {
    key: "q06-rectangle-semicircle",
    skill: "Composite polygonal and circular area",
    prompt:
      "A region is a rectangle that is 12 units long and 5 units wide, with a semicircle attached along the side of length 12 so that the diameter of the semicircle is 12. The area of a semicircle is one-half pi times the square of its radius. What is the area of the combined region?",
    choices: [
      choice("a", "60 + 9 pi."),
      choice("b", "60 + 18 pi."),
      choice("c", "60 + 36 pi."),
      choice("d", "72 + 18 pi."),
    ],
    correctAnswer: "b",
  },
  {
    key: "q07-rectangle-triangle-polygon",
    skill: "Area by polygonal triangulation",
    prompt:
      "A polygonal region is a rectangle that is 16 units long and 9 units wide, with a right triangle attached along one longer side. The triangle has base 16 and height 5, and the height is measured perpendicular to that side. What is the area of the combined region?",
    choices: [
      choice("a", "144 square units."),
      choice("b", "164 square units."),
      choice("c", "184 square units."),
      choice("d", "224 square units."),
    ],
    correctAnswer: "c",
  },
  {
    key: "q08-similar-spheres",
    skill: "Similar solids and volume",
    prompt:
      "A solid sphere has radius 3. A second sphere is similar to the first, and the ratio of the second radius to the first radius is 2 to 1. The volume of a sphere is four-thirds pi times the cube of the radius. What is the volume of the second sphere?",
    choices: [
      choice("a", "72 pi."),
      choice("b", "144 pi."),
      choice("c", "288 pi."),
      choice("d", "864 pi."),
    ],
    correctAnswer: "c",
  },
  {
    key: "q09-inscribed-square",
    skill: "Polygons inscribed in circles",
    prompt:
      "A square is inscribed in a circle so that every vertex of the square lies on the circle. The radius of the circle is 5. The diagonal of the square is a diameter of the circle, and the area of a square is half the square of its diagonal. What is the area of the square?",
    choices: [
      choice("a", "25 square units."),
      choice("b", "50 square units."),
      choice("c", "25 pi square units."),
      choice("d", "100 square units."),
    ],
    correctAnswer: "b",
  },
  {
    key: "q10-prism-surface-from-volume",
    skill: "Surface area and volume",
    prompt:
      "A rectangular prism has a volume of 240 cubic centimeters. Its base is a rectangle with side lengths 8 centimeters and 5 centimeters. What is the surface area, in square centimeters, of the prism?",
    choices: [
      choice("a", "118 square centimeters."),
      choice("b", "196 square centimeters."),
      choice("c", "236 square centimeters."),
      choice("d", "280 square centimeters."),
    ],
    correctAnswer: "c",
  },
  {
    key: "q11-similar-polygon-area",
    skill: "Similar polygons and area",
    prompt:
      "Two similar polygons have corresponding side lengths 6 and 15. The area of the smaller polygon is 48 square units. What is the area, in square units, of the larger polygon?",
    choices: [
      choice("a", "120 square units."),
      choice("b", "192 square units."),
      choice("c", "300 square units."),
      choice("d", "750 square units."),
    ],
    correctAnswer: "c",
  },
  {
    key: "q12-cylinder-with-hole",
    skill: "Volume of composite solids",
    prompt:
      "A cylindrical block of material has radius 4 and height 9. A cylindrical hole of radius 2 is bored through the block along its full height. The volume of a cylinder is pi times the square of the radius times the height. What is the volume of the material that remains?",
    choices: [
      choice("a", "36 pi."),
      choice("b", "72 pi."),
      choice("c", "108 pi."),
      choice("d", "144 pi."),
    ],
    correctAnswer: "c",
  },
];

export function geometrySatQuestionCount(): number {
  return GEOMETRY_SAT_QUESTIONS.length;
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
      stimulus: null,
      choices: item.choices,
      questionType: "multiple_choice",
      correctAnswer: item.correctAnswer,
      subject: "SAT Math",
      domain: "Geometry",
      section: "math",
      figures: [],
    });
    if (!audit.ok) failed.push({ key: item.key, reasons: audit.reasons });
  }
  return failed;
}
