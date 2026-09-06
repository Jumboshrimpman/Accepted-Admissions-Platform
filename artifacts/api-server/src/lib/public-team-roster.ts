export const PUBLIC_TUTOR_ORDER = [
  "Rosanna Kataja",
  "Xavier Morales",
  "Eunice Chon",
  "Sophia Lamas",
  "Aurelia Finch",
  "Nika Raiffe",
  "Kya Brooks",
  "Michael Pecorara",
  "Kyle Englander",
  "Daniel Salgado-Alvarez",
  "Sama Noori",
] as const;

export type PublicTutorName = (typeof PUBLIC_TUTOR_ORDER)[number];

export const XAVIER_PUBLIC_BIOGRAPHY =
  "Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy. He currently works in finance at Jane Street Capital on Strategy and Product. He was a 2024 Rhodes Scholar and 2026 Oxford graduate, studying Philosophy for his Masters. Xavier is also an incoming member of the 2030 Harvard Law School class.";

export const XAVIER_LEGACY_PUBLIC_BIOGRAPHIES = [
  "Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy. He is a 2024 Rhodes Scholar, studying Philosophy for his Masters at Oxford until 2026. Xavier is also an incoming member of the 2029 Harvard Law School class.",
] as const;

export const EUNICE_PUBLIC_BIOGRAPHY =
  "Eunice is a Harvard 2024 graduate in History of Science and Philosophy at Harvard College, where she earned high honors. She is currently a doctoral student in History and a clinical researcher at Harvard Medical School/Massachusetts General Hospital.";

export const EUNICE_LEGACY_PUBLIC_BIOGRAPHIES = [
  "Eunice Chon is a third-year at Harvard College studying History of Science and Philosophy, with a secondary in Global Health and Health Policy. She is passionate about disability advocacy and law, including mental health justice and activism. She is a Coca-Cola Scholar.",
] as const;

export const NIKA_PUBLIC_BIOGRAPHY =
  "Nika Raiffe is a senior studying political science, law, and psychology in a dual degree between Columbia University and Sciences Po Paris. She is currently a summer business analyst in the Goldman Sachs Business Intelligence Group. She previously worked at Columbia's Irving Medical Center as a Research Intern on Relational Health.";

export const NIKA_LEGACY_PUBLIC_BIOGRAPHIES = [
  "Nika Raiffe is a sophomore studying political science, law, and psychology in a dual degree between Columbia University and Sciences Po Paris. She grew up in Eastern Europe, before graduating from Stuyvesant High School.",
] as const;

/** First-party public portraits served from this app (not Wix CDN). */
export const APPROVED_PUBLIC_TEAM_PORTRAITS: Record<PublicTutorName, string> = {
  "Rosanna Kataja": "/media/team/rosanna-kataja.jpg",
  "Xavier Morales": "/media/team/xavier-morales.jpg",
  "Eunice Chon": "/media/team/eunice-chon.jpg",
  "Sophia Lamas": "/media/team/sophia-lamas.jpg",
  "Aurelia Finch": "/media/team/aurelia-finch.png",
  "Nika Raiffe": "/media/team/nika-raiffe.png",
  "Kya Brooks": "/media/team/kya-brooks.jpg",
  "Michael Pecorara": "/media/team/michael-pecorara.jpg",
  "Kyle Englander": "/media/team/kyle-englander.jpg",
  "Daniel Salgado-Alvarez": "/media/team/daniel-salgado-alvarez.png",
  "Sama Noori": "/media/team/sama-noori.jpg",
};

/**
 * Historical Wix CDN portrait URLs. Kept only so startup can rewrite stored
 * database values after the Wix marketing site is shut down.
 */
export const LEGACY_WIX_PUBLIC_TEAM_PORTRAITS: Record<PublicTutorName, string> = {
  "Rosanna Kataja":
    "https://static.wixstatic.com/media/2c8654_fb71dc7f45d049339b3696beb82a0e8f~mv2.jpg/v1/fill/w_457,h_711,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_fb71dc7f45d049339b3696beb82a0e8f~mv2.jpg",
  "Xavier Morales":
    "https://static.wixstatic.com/media/2c8654_1be78ea7e5ea4c179eb57f8d77885aea~mv2.jpg/v1/fill/w_457,h_711,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_1be78ea7e5ea4c179eb57f8d77885aea~mv2.jpg",
  "Eunice Chon":
    "https://static.wixstatic.com/media/2c8654_cc6cc4127d6f4b479f89ba91c18ca457~mv2.jpg/v1/fill/w_457,h_711,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_cc6cc4127d6f4b479f89ba91c18ca457~mv2.jpg",
  "Sophia Lamas":
    "https://static.wixstatic.com/media/2c8654_1e5008d296ca4b20bd2f46a6a483de2e~mv2.jpg/v1/fill/w_457,h_711,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_1e5008d296ca4b20bd2f46a6a483de2e~mv2.jpg",
  "Aurelia Finch":
    "https://static.wixstatic.com/media/2c8654_9871b4a8b0604ba99d334b0dc6deb64d~mv2.png/v1/fill/w_457,h_685,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_9871b4a8b0604ba99d334b0dc6deb64d~mv2.png",
  "Nika Raiffe":
    "https://static.wixstatic.com/media/2c8654_da5409cc20ab493681683b7e30932b60~mv2.png/v1/fill/w_457,h_685,al_c,lg_1,q_85,enc_avif,quality_auto/2c8654_da5409cc20ab493681683b7e30932b60~mv2.png",
  "Kya Brooks":
    "https://static.wixstatic.com/media/2c8654_99fefc7159a4424fa7e6fb36ed6cbb86~mv2.jpg/v1/fill/w_457,h_685,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_99fefc7159a4424fa7e6fb36ed6cbb86~mv2.jpg",
  "Michael Pecorara":
    "https://static.wixstatic.com/media/2c8654_ab3655c726c846819c5eec1195af49bd~mv2.jpg/v1/fill/w_457,h_685,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_ab3655c726c846819c5eec1195af49bd~mv2.jpg",
  "Kyle Englander":
    "https://static.wixstatic.com/media/2c8654_1ab78bc7f16a48559bc3b46364c94bcc~mv2.jpg/v1/fill/w_457,h_763,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_1ab78bc7f16a48559bc3b46364c94bcc~mv2.jpg",
  "Daniel Salgado-Alvarez":
    "https://static.wixstatic.com/media/2c8654_72de1811814144689846123daff8471f~mv2.png/v1/fill/w_437,h_730,al_c,q_85,enc_avif,quality_auto/2c8654_72de1811814144689846123daff8471f~mv2.png",
  "Sama Noori":
    "https://static.wixstatic.com/media/2c8654_fb647c84910a4d97bd9a13d22f9dc124~mv2.jpg/v1/fill/w_457,h_763,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_fb647c84910a4d97bd9a13d22f9dc124~mv2.jpg",
};

export type ApprovedSchoolLogo = {
  name: string;
  src: string;
  alt: string;
};

/**
 * First-party school logos for /past-success, in legacy www display order.
 * Harvard College, Harvard Law, and Harvard GSAS stay separate tiles.
 */
export const APPROVED_SCHOOL_LOGOS = [
  {
    name: "Harvard University",
    src: "/media/schools/harvard.png",
    alt: "Harvard University logo",
  },
  {
    name: "Princeton University",
    src: "/media/schools/princeton.png",
    alt: "Princeton University logo",
  },
  {
    name: "MIT",
    src: "/media/schools/mit.jpg",
    alt: "MIT logo",
  },
  {
    name: "Northeastern University",
    src: "/media/schools/northeastern.jpg",
    alt: "Northeastern University logo",
  },
  {
    name: "UC San Diego",
    src: "/media/schools/uc-san-diego.png",
    alt: "UC San Diego logo",
  },
  {
    name: "University of Maryland",
    src: "/media/schools/maryland.png",
    alt: "University of Maryland logo",
  },
  {
    name: "Harvard Law School",
    src: "/media/schools/harvard-law.png",
    alt: "Harvard Law School logo",
  },
  {
    name: "Harvard GSAS",
    src: "/media/schools/harvard-gsas.jpg",
    alt: "Harvard GSAS logo",
  },
  {
    name: "University of Oxford",
    src: "/media/schools/oxford.jpg",
    alt: "University of Oxford logo",
  },
  {
    name: "Stanford University",
    src: "/media/schools/stanford.png",
    alt: "Stanford University logo",
  },
  {
    name: "Cornell University",
    src: "/media/schools/cornell.png",
    alt: "Cornell University logo",
  },
  {
    name: "University of Chicago",
    src: "/media/schools/chicago.jpg",
    alt: "University of Chicago logo",
  },
  {
    name: "Georgetown University",
    src: "/media/schools/georgetown.png",
    alt: "Georgetown University logo",
  },
  {
    name: "Pomona College",
    src: "/media/schools/pomona.png",
    alt: "Pomona College logo",
  },
  {
    name: "Boston University",
    src: "/media/schools/boston-university.png",
    alt: "Boston University seal",
  },
  {
    name: "Washington University in St. Louis",
    src: "/media/schools/washu.png",
    alt: "Washington University in St. Louis logo",
  },
  {
    name: "Claremont McKenna College",
    src: "/media/schools/claremont-mckenna.png",
    alt: "Claremont McKenna College seal",
  },
  {
    name: "University of Virginia",
    src: "/media/schools/uva.png",
    alt: "University of Virginia logo",
  },
  {
    name: "Pepperdine University",
    src: "/media/schools/pepperdine.png",
    alt: "Pepperdine University logo",
  },
] as const satisfies readonly ApprovedSchoolLogo[];

/** Known historical Wix school-logo URLs → local assets. */
export const LEGACY_WIX_SCHOOL_LOGO_URLS: Record<string, string> = {
  "https://static.wixstatic.com/media/2c8654_4afb30eddba44c779b732a0a35fb3a80~mv2.png/v1/fill/w_274,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_4afb30eddba44c779b732a0a35fb3a80~mv2.png":
    "/media/schools/harvard.png",
  "https://static.wixstatic.com/media/2c8654_4afb30eddba44c779b732a0a35fb3a80~mv2.png":
    "/media/schools/harvard.png",
  "https://static.wixstatic.com/media/2c8654_d6d5f4729bd048ddb2366f66b32506c4~mv2.png/v1/fill/w_274,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/princeton%20logo.png":
    "/media/schools/princeton.png",
  "https://static.wixstatic.com/media/2c8654_d6d5f4729bd048ddb2366f66b32506c4~mv2.png":
    "/media/schools/princeton.png",
  "https://static.wixstatic.com/media/2c8654_e7dedad8e02d43e6965cb5d8054d6c15~mv2.jpg/v1/crop/x_276,y_222,w_528,h_425/fill/w_296,h_238,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/MIT_edited.jpg":
    "/media/schools/mit.jpg",
  "https://static.wixstatic.com/media/2c8654_e7dedad8e02d43e6965cb5d8054d6c15~mv2.jpg":
    "/media/schools/mit.jpg",
  "https://static.wixstatic.com/media/2c8654_dfa69976a1274e4f9de87500d1409fc0~mv2.jpg":
    "/media/schools/chicago.jpg",
  "https://static.wixstatic.com/media/2c8654_dfa69976a1274e4f9de87500d1409fc0~mv2.jpg/v1/fill/w_250,h_249,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/UChicago-logo.jpg":
    "/media/schools/chicago.jpg",
  "https://static.wixstatic.com/media/2c8654_3ffd9a0cd2a544b29f175c556c4ad6ce~mv2.png/v1/fill/w_266,h_266,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Georgetown-University-Logo.png":
    "/media/schools/georgetown.png",
  "https://static.wixstatic.com/media/2c8654_3ffd9a0cd2a544b29f175c556c4ad6ce~mv2.png/v1/fill/w_266,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_3ffd9a0cd2a544b29f175c556c4ad6ce~mv2.png":
    "/media/schools/georgetown.png",
  "https://static.wixstatic.com/media/2c8654_3ffd9a0cd2a544b29f175c556c4ad6ce~mv2.png":
    "/media/schools/georgetown.png",
  "https://static.wixstatic.com/media/2c8654_956294ec39b0406ba76455aa5d2f615e~mv2.png/v1/fill/w_250,h_250,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Boston_University_seal.svg.png":
    "/media/schools/boston-university.png",
  "https://static.wixstatic.com/media/2c8654_956294ec39b0406ba76455aa5d2f615e~mv2.png/v1/fill/w_250,h_250,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_956294ec39b0406ba76455aa5d2f615e~mv2.png":
    "/media/schools/boston-university.png",
  "https://static.wixstatic.com/media/2c8654_956294ec39b0406ba76455aa5d2f615e~mv2.png":
    "/media/schools/boston-university.png",
  "https://static.wixstatic.com/media/2c8654_69f9b18f19db4eb68fa898beeaec3768~mv2.png/v1/fill/w_266,h_277,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/CMC%20Seal.png":
    "/media/schools/claremont-mckenna.png",
  "https://static.wixstatic.com/media/2c8654_69f9b18f19db4eb68fa898beeaec3768~mv2.png":
    "/media/schools/claremont-mckenna.png",
  "https://static.wixstatic.com/media/2c8654_98f54bd2e0524ac7bc3420560cb534ea~mv2.jpg/v1/fill/w_250,h_250,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_98f54bd2e0524ac7bc3420560cb534ea~mv2.jpg":
    "/media/schools/northeastern.jpg",
  "https://static.wixstatic.com/media/2c8654_98f54bd2e0524ac7bc3420560cb534ea~mv2.jpg":
    "/media/schools/northeastern.jpg",
  "https://static.wixstatic.com/media/2c8654_7badca46b23e4ac18c43e338718969f5~mv2.png/v1/fill/w_250,h_250,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_7badca46b23e4ac18c43e338718969f5~mv2.png":
    "/media/schools/uc-san-diego.png",
  "https://static.wixstatic.com/media/2c8654_7badca46b23e4ac18c43e338718969f5~mv2.png":
    "/media/schools/uc-san-diego.png",
  "https://static.wixstatic.com/media/2c8654_9e7629415ec54631b276463c2cfcb0c5~mv2.png/v1/fill/w_244,h_244,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_9e7629415ec54631b276463c2cfcb0c5~mv2.png":
    "/media/schools/maryland.png",
  "https://static.wixstatic.com/media/2c8654_9e7629415ec54631b276463c2cfcb0c5~mv2.png":
    "/media/schools/maryland.png",
  "https://static.wixstatic.com/media/2c8654_6836fcc515314bd9bdce33595cbbefe5~mv2.webp/v1/fill/w_176,h_278,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/shield-stack.webp":
    "/media/schools/harvard-law.png",
  "https://static.wixstatic.com/media/2c8654_6836fcc515314bd9bdce33595cbbefe5~mv2.webp":
    "/media/schools/harvard-law.png",
  "https://static.wixstatic.com/media/2c8654_b6afee5d4f7b45e282b6c07209aa3623~mv2.jpg/v1/fill/w_372,h_211,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/gsas_shield_16x9.jpg":
    "/media/schools/harvard-gsas.jpg",
  "https://static.wixstatic.com/media/2c8654_b6afee5d4f7b45e282b6c07209aa3623~mv2.jpg":
    "/media/schools/harvard-gsas.jpg",
  "https://static.wixstatic.com/media/2c8654_66a18563da3c4186b81d3a6d58475a0b~mv2.jpg/v1/fill/w_286,h_286,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_66a18563da3c4186b81d3a6d58475a0b~mv2.jpg":
    "/media/schools/oxford.jpg",
  "https://static.wixstatic.com/media/2c8654_66a18563da3c4186b81d3a6d58475a0b~mv2.jpg":
    "/media/schools/oxford.jpg",
  "https://static.wixstatic.com/media/2c8654_1c42ffba51cc4f229aee5c1a1aa45d06~mv2.png/v1/fill/w_266,h_266,al_c,lg_1,q_85,enc_avif,quality_auto/2c8654_1c42ffba51cc4f229aee5c1a1aa45d06~mv2.png":
    "/media/schools/stanford.png",
  "https://static.wixstatic.com/media/2c8654_1c42ffba51cc4f229aee5c1a1aa45d06~mv2.png":
    "/media/schools/stanford.png",
  "https://static.wixstatic.com/media/2c8654_a3d9ef9f5a294dcdae6d996ba43f410f~mv2.png/v1/fill/w_266,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_a3d9ef9f5a294dcdae6d996ba43f410f~mv2.png":
    "/media/schools/cornell.png",
  "https://static.wixstatic.com/media/2c8654_a3d9ef9f5a294dcdae6d996ba43f410f~mv2.png":
    "/media/schools/cornell.png",
  "https://static.wixstatic.com/media/2c8654_678dd5ee85284e1a9ad002517c069449~mv2.png/v1/fill/w_153,h_250,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_678dd5ee85284e1a9ad002517c069449~mv2.png":
    "/media/schools/pomona.png",
  "https://static.wixstatic.com/media/2c8654_678dd5ee85284e1a9ad002517c069449~mv2.png":
    "/media/schools/pomona.png",
  "https://static.wixstatic.com/media/2c8654_e435388057834dfc83c5b1e40d8bf993~mv2.png/v1/fill/w_258,h_258,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_e435388057834dfc83c5b1e40d8bf993~mv2.png":
    "/media/schools/washu.png",
  "https://static.wixstatic.com/media/2c8654_e435388057834dfc83c5b1e40d8bf993~mv2.png":
    "/media/schools/washu.png",
  "https://static.wixstatic.com/media/2c8654_83ab38633dc74d3da6ee7d91a92e92ba~mv2.png/v1/fill/w_377,h_201,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_83ab38633dc74d3da6ee7d91a92e92ba~mv2.png":
    "/media/schools/uva.png",
  "https://static.wixstatic.com/media/2c8654_83ab38633dc74d3da6ee7d91a92e92ba~mv2.png":
    "/media/schools/uva.png",
  "https://static.wixstatic.com/media/2c8654_695af7ff84a7402ea6de96506bed410d~mv2.png/v1/fill/w_249,h_249,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_695af7ff84a7402ea6de96506bed410d~mv2.png":
    "/media/schools/pepperdine.png",
  "https://static.wixstatic.com/media/2c8654_695af7ff84a7402ea6de96506bed410d~mv2.png":
    "/media/schools/pepperdine.png",
};

const LEGACY_WIX_MEDIA_REWRITES: Record<string, string> = {
  ...Object.fromEntries(
    PUBLIC_TUTOR_ORDER.map((name) => [
      LEGACY_WIX_PUBLIC_TEAM_PORTRAITS[name],
      APPROVED_PUBLIC_TEAM_PORTRAITS[name],
    ]),
  ),
  "https://static.wixstatic.com/media/2c8654_422915d7e4da4b1a911f446b01e3a25d~mv2.webp/v1/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Xavierheadshot.webp":
    APPROVED_PUBLIC_TEAM_PORTRAITS["Xavier Morales"],
  "https://static.wixstatic.com/media/2c8654_3d3d703b8ea343ef8805961027f1406a~mv2.jpg/v1/crop/x_32,y_0,w_537,h_400/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Manuel.jpg":
    APPROVED_PUBLIC_TEAM_PORTRAITS["Eunice Chon"],
  ...LEGACY_WIX_SCHOOL_LOGO_URLS,
};

export function rewriteLegacyWixMediaUrl(url: string): string {
  return LEGACY_WIX_MEDIA_REWRITES[url] ?? url;
}

export function publicTeamPortrait(name: string, storedPhotoUrl: string | null) {
  if (name === "Kya Brooks") {
    return APPROVED_PUBLIC_TEAM_PORTRAITS["Kya Brooks"];
  }
  if (!storedPhotoUrl) return storedPhotoUrl;
  return rewriteLegacyWixMediaUrl(storedPhotoUrl);
}

export const MIRRORED_PORTRAIT_RECONCILIATIONS = [
  {
    email: "xaver.rmz6@gmail.com",
    name: "Xavier Morales" as const,
    previousPhotoUrl:
      "https://static.wixstatic.com/media/2c8654_422915d7e4da4b1a911f446b01e3a25d~mv2.webp/v1/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Xavierheadshot.webp",
    photoAltText: "Xavier Morales, SAT and Math Tutor",
    biography: XAVIER_PUBLIC_BIOGRAPHY,
  },
  {
    email: "eunice_chon@berkeley.edu",
    name: "Eunice Chon" as const,
    previousPhotoUrl:
      "https://static.wixstatic.com/media/2c8654_3d3d703b8ea343ef8805961027f1406a~mv2.jpg/v1/crop/x_32,y_0,w_537,h_400/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Manuel.jpg",
    photoAltText: "Eunice Chon, Scholarship Tutor",
    biography: EUNICE_PUBLIC_BIOGRAPHY,
  },
  {
    email: "public-rosanna-kataja@seed.invalid",
    name: "Rosanna Kataja" as const,
    previousPhotoUrl: LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Xavier Morales"],
    photoAltText: "Rosanna Kataja, Admissions Tutor",
  },
  {
    email: "public-sophia-lamas@seed.invalid",
    name: "Sophia Lamas" as const,
    previousPhotoUrl: LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Aurelia Finch"],
    photoAltText: "Sophia Lamas, Admissions Tutor",
  },
  {
    email: "public-aurelia-finch@seed.invalid",
    name: "Aurelia Finch" as const,
    previousPhotoUrl: LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Nika Raiffe"],
    photoAltText: "Aurelia Finch, Admissions Tutor - UK",
  },
  {
    email: "public-kya-brooks@seed.invalid",
    name: "Kya Brooks" as const,
    previousPhotoUrl: LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"],
    photoAltText: "Kya Brooks, Admissions Tutor",
    biography:
      "Kya is a senior at Harvard studying economics and the History of Art and Literature. She works in investment finance, consulting, and is a professional model for Wilhelmina Co. Kya is a Coca-Cola Scholar.",
  },
  {
    email: "public-michael-pecorara@seed.invalid",
    name: "Michael Pecorara" as const,
    previousPhotoUrl: LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Kyle Englander"],
    photoAltText: "Michael Pecorara, SAT and LSAT Tutor",
    linkedinUrl: "https://www.linkedin.com/in/michaelpecorara/",
  },
  {
    email: "public-kyle-englander@seed.invalid",
    name: "Kyle Englander" as const,
    previousPhotoUrl: LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Daniel Salgado-Alvarez"],
    photoAltText: "Kyle Englander, Scholarship Tutor",
  },
  {
    email: "public-daniel-salgado-alvarez@seed.invalid",
    name: "Daniel Salgado-Alvarez" as const,
    previousPhotoUrl: LEGACY_WIX_PUBLIC_TEAM_PORTRAITS["Sama Noori"],
    photoAltText: "Daniel Salgado-Alvarez, Admissions Tutor",
  },
  {
    email: "public-sama-noori@seed.invalid",
    name: "Sama Noori" as const,
    previousPhotoUrl: null,
    photoAltText: "Sama Noori, Admissions Tutor",
  },
] as const;

function normalizeSchoolLogos(logos: unknown): ApprovedSchoolLogo[] | null {
  if (!Array.isArray(logos)) return null;
  return logos.flatMap((logo) => {
    if (!logo || typeof logo !== "object" || Array.isArray(logo)) return [];
    const item = logo as Record<string, unknown>;
    if (typeof item.name !== "string" || typeof item.src !== "string" || typeof item.alt !== "string") {
      return [];
    }
    return [{
      name: item.name,
      src: rewriteLegacyWixMediaUrl(item.src),
      alt: item.alt,
    }];
  });
}

function isApprovedSchoolLogo(logo: ApprovedSchoolLogo) {
  return APPROVED_SCHOOL_LOGOS.some(
    (approved) =>
      approved.name.trim().toLowerCase() === logo.name.trim().toLowerCase() ||
      approved.src === logo.src,
  );
}

function schoolLogosEqual(left: ApprovedSchoolLogo[], right: ApprovedSchoolLogo[]) {
  return (
    left.length === right.length &&
    left.every((logo, index) => {
      const other = right[index];
      return logo.name === other.name && logo.src === other.src && logo.alt === other.alt;
    })
  );
}

export function rewriteLegacyWixSchoolLogos(
  logos: unknown,
): ApprovedSchoolLogo[] | null {
  if (!Array.isArray(logos)) return null;
  let changed = false;
  const next = logos.flatMap((logo) => {
    if (!logo || typeof logo !== "object" || Array.isArray(logo)) return [];
    const item = logo as Record<string, unknown>;
    if (typeof item.name !== "string" || typeof item.src !== "string" || typeof item.alt !== "string") {
      return [];
    }
    const rewritten = rewriteLegacyWixMediaUrl(item.src);
    if (rewritten !== item.src) changed = true;
    return [{ name: item.name, src: rewritten, alt: item.alt }];
  });
  return changed ? next : null;
}

/**
 * Expand stored past-success logos to the full approved set without dropping
 * custom admin tiles. When every stored tile is already an approved school,
 * restore www display order (including separate Harvard / Harvard Law / GSAS).
 */
export function mergeApprovedSchoolLogos(logos: unknown): ApprovedSchoolLogo[] | null {
  const current = normalizeSchoolLogos(logos) ?? [];
  const extras = current.filter((logo) => !isApprovedSchoolLogo(logo));
  const approved = APPROVED_SCHOOL_LOGOS.map((logo) => ({ ...logo }));
  const next =
    extras.length === 0
      ? approved
      : [
          ...current,
          ...approved.filter(
            (logo) =>
              !current.some(
                (existing) =>
                  existing.name.trim().toLowerCase() === logo.name.trim().toLowerCase() ||
                  existing.src === logo.src,
              ),
          ),
        ];
  return schoolLogosEqual(current, next) ? null : next;
}
