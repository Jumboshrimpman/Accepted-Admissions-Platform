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

export const APPROVED_PUBLIC_TEAM_PORTRAITS: Record<PublicTutorName, string> = {
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

export function publicTeamPortrait(name: string, storedPhotoUrl: string | null) {
  if (name === "Kya Brooks") {
    return APPROVED_PUBLIC_TEAM_PORTRAITS["Kya Brooks"];
  }
  return storedPhotoUrl;
}

export const MIRRORED_PORTRAIT_RECONCILIATIONS = [
  {
    email: "xsfam6@gmail.com",
    name: "Xavier Morales",
    previousPhotoUrl:
      "https://static.wixstatic.com/media/2c8654_422915d7e4da4b1a911f446b01e3a25d~mv2.webp/v1/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Xavierheadshot.webp",
    photoAltText: "Xavier Morales, SAT and Math Tutor",
  },
  {
    email: "eunice_chon@berkeley.edu",
    name: "Eunice Chon",
    previousPhotoUrl:
      "https://static.wixstatic.com/media/2c8654_3d3d703b8ea343ef8805961027f1406a~mv2.jpg/v1/crop/x_32,y_0,w_537,h_400/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Manuel.jpg",
    photoAltText: "Eunice Chon, Scholarship Tutor",
  },
  {
    email: "public-rosanna-kataja@seed.invalid",
    name: "Rosanna Kataja",
    previousPhotoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Xavier Morales"],
    photoAltText: "Rosanna Kataja, Admissions Tutor",
  },
  {
    email: "public-sophia-lamas@seed.invalid",
    name: "Sophia Lamas",
    previousPhotoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Aurelia Finch"],
    photoAltText: "Sophia Lamas, Admissions Tutor",
  },
  {
    email: "public-aurelia-finch@seed.invalid",
    name: "Aurelia Finch",
    previousPhotoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Nika Raiffe"],
    photoAltText: "Aurelia Finch, Admissions Tutor - UK",
  },
  {
    email: "public-kya-brooks@seed.invalid",
    name: "Kya Brooks",
    previousPhotoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Michael Pecorara"],
    photoAltText: "Kya Brooks, Admissions Tutor",
    biography:
      "Kya is a senior at Harvard studying economics and the History of Art and Literature. She works in investment finance, consulting, and is a professional model for Wilhelmina Co. Kya is a Coca-Cola Scholar.",
  },
  {
    email: "public-michael-pecorara@seed.invalid",
    name: "Michael Pecorara",
    previousPhotoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Kyle Englander"],
    photoAltText: "Michael Pecorara, SAT and LSAT Tutor",
    linkedinUrl: "https://www.linkedin.com/in/michaelpecorara/",
  },
  {
    email: "public-kyle-englander@seed.invalid",
    name: "Kyle Englander",
    previousPhotoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Daniel Salgado-Alvarez"],
    photoAltText: "Kyle Englander, Scholarship Tutor",
  },
  {
    email: "public-daniel-salgado-alvarez@seed.invalid",
    name: "Daniel Salgado-Alvarez",
    previousPhotoUrl: APPROVED_PUBLIC_TEAM_PORTRAITS["Sama Noori"],
    photoAltText: "Daniel Salgado-Alvarez, Admissions Tutor",
  },
  {
    email: "public-sama-noori@seed.invalid",
    name: "Sama Noori",
    previousPhotoUrl: null,
    photoAltText: "Sama Noori, Admissions Tutor",
  },
] as const;