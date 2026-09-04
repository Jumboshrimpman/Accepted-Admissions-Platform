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
    name: "Boston University",
    src: "/media/schools/boston-university.png",
    alt: "Boston University seal",
  },
  {
    name: "Claremont McKenna College",
    src: "/media/schools/claremont-mckenna.png",
    alt: "Claremont McKenna College seal",
  },
] as const;

/** Known historical Wix school-logo URLs → local assets. */
export const LEGACY_WIX_SCHOOL_LOGO_URLS: Record<string, string> = {
  "https://static.wixstatic.com/media/2c8654_4afb30eddba44c779b732a0a35fb3a80~mv2.png/v1/fill/w_274,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_4afb30eddba44c779b732a0a35fb3a80~mv2.png":
    "/media/schools/harvard.png",
  "https://static.wixstatic.com/media/2c8654_d6d5f4729bd048ddb2366f66b32506c4~mv2.png/v1/fill/w_274,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/princeton%20logo.png":
    "/media/schools/princeton.png",
  "https://static.wixstatic.com/media/2c8654_e7dedad8e02d43e6965cb5d8054d6c15~mv2.jpg/v1/crop/x_276,y_222,w_528,h_425/fill/w_296,h_238,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/MIT_edited.jpg":
    "/media/schools/mit.jpg",
  "https://static.wixstatic.com/media/2c8654_dfa69976a1274e4f9de87500d1409fc0~mv2.jpg":
    "/media/schools/chicago.jpg",
  "https://static.wixstatic.com/media/2c8654_3ffd9a0cd2a544b29f175c556c4ad6ce~mv2.png/v1/fill/w_266,h_266,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Georgetown-University-Logo.png":
    "/media/schools/georgetown.png",
  "https://static.wixstatic.com/media/2c8654_956294ec39b0406ba76455aa5d2f615e~mv2.png/v1/fill/w_250,h_250,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Boston_University_seal.svg.png":
    "/media/schools/boston-university.png",
  "https://static.wixstatic.com/media/2c8654_69f9b18f19db4eb68fa898beeaec3768~mv2.png/v1/fill/w_266,h_277,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/CMC%20Seal.png":
    "/media/schools/claremont-mckenna.png",
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
  },
  {
    email: "eunice_chon@berkeley.edu",
    name: "Eunice Chon" as const,
    previousPhotoUrl:
      "https://static.wixstatic.com/media/2c8654_3d3d703b8ea343ef8805961027f1406a~mv2.jpg/v1/crop/x_32,y_0,w_537,h_400/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Manuel.jpg",
    photoAltText: "Eunice Chon, Scholarship Tutor",
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

export function rewriteLegacyWixSchoolLogos(
  logos: unknown,
): { name: string; src: string; alt: string }[] | null {
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
