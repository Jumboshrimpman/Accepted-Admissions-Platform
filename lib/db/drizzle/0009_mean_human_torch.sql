ALTER TABLE "tutor_profiles" ADD COLUMN IF NOT EXISTS "photo_alt_text" text;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD COLUMN IF NOT EXISTS "public_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "tutor_profiles"
SET
  "title" = 'SAT & Math Tutor',
  "photo_url" = 'https://static.wixstatic.com/media/2c8654_422915d7e4da4b1a911f446b01e3a25d~mv2.webp/v1/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Xavierheadshot.webp',
  "photo_alt_text" = 'Xavier Morales, SAT and Math Tutor',
  "biography" = 'Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy. He is a 2024 Rhodes Scholar, studying Philosophy for his Masters at Oxford until 2026. Xavier is also an incoming member of the 2029 Harvard Law School class.',
  "subjects" = '["SAT", "Math"]'::jsonb,
  "linkedin_url" = 'https://www.linkedin.com/in/xavier-morales-8830821a5/',
  "public_approved" = true,
  "updated_at" = now()
WHERE "name" = 'Xavier Morales';--> statement-breakpoint
UPDATE "tutor_profiles"
SET
  "title" = 'Scholarship Tutor',
  "photo_url" = 'https://static.wixstatic.com/media/2c8654_3d3d703b8ea343ef8805961027f1406a~mv2.jpg/v1/crop/x_32,y_0,w_537,h_400/fill/w_448,h_334,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Manuel.jpg',
  "photo_alt_text" = 'Eunice Chon, Scholarship Tutor',
  "biography" = 'Eunice Chon is a third-year at Harvard College studying History of Science and Philosophy, with a secondary in Global Health and Health Policy. She is passionate about disability advocacy and law, including mental health justice and activism. She is a Coca-Cola Scholar.',
  "subjects" = '["Scholarships", "College admissions"]'::jsonb,
  "linkedin_url" = 'https://linkedin.com/in/eunicechon',
  "public_approved" = true,
  "updated_at" = now()
WHERE "name" = 'Eunice Chon';--> statement-breakpoint
UPDATE "public_content"
SET
  "seo_title" = 'Our Team | Accepted Admissions',
  "seo_description" = 'Meet the tutors behind Accepted Admissions and learn how their experience shapes thoughtful student support.',
  "body" = jsonb_build_object('intro', 'Choose the expert best fit for you.'),
  "status" = 'published',
  "published_at" = now(),
  "updated_at" = now()
WHERE "slug" = 'our-team';--> statement-breakpoint
UPDATE "public_content"
SET
  "seo_title" = 'Past Student Success | Accepted Admissions',
  "seo_description" = 'Read an approved student testimonial and explore a sample of schools Accepted Admissions students have been accepted to.',
  "body" = jsonb_build_object(
    'intro', 'This is a sample of the schools our students have been accepted to. We work hard to get our students into the schools of their dreams. As recent students, we have a nuanced understanding of our modern world''s competitive college application process landscape.',
    'testimonial', jsonb_build_object(
      'quote', 'Really happy with my experience with Accepted Admissions. It was an advantage to have on-the-ground Harvard students who are current with applications advising me for cheaper than huge firms. It was nice to work with tutors who all had an Ivy League backgrounds.',
      'attribution', 'Sarah M.',
      'attributionMode', 'named'
    ),
    'schoolLogos', jsonb_build_array(
      jsonb_build_object('name', 'Harvard University', 'src', 'https://static.wixstatic.com/media/2c8654_4afb30eddba44c779b732a0a35fb3a80~mv2.png/v1/fill/w_274,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_4afb30eddba44c779b732a0a35fb3a80~mv2.png', 'alt', 'Harvard University logo'),
      jsonb_build_object('name', 'Princeton University', 'src', 'https://static.wixstatic.com/media/2c8654_d6d5f4729bd048ddb2366f66b32506c4~mv2.png/v1/fill/w_274,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/princeton%20logo.png', 'alt', 'Princeton University logo'),
      jsonb_build_object('name', 'MIT', 'src', 'https://static.wixstatic.com/media/2c8654_e7dedad8e02d43e6965cb5d8054d6c15~mv2.jpg/v1/crop/x_276,y_222,w_528,h_425/fill/w_296,h_238,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/MIT_edited.jpg', 'alt', 'MIT logo'),
      jsonb_build_object('name', 'University of Chicago', 'src', 'https://static.wixstatic.com/media/2c8654_dfa69976a1274e4f9de87500d1409fc0~mv2.jpg', 'alt', 'University of Chicago logo'),
      jsonb_build_object('name', 'Georgetown University', 'src', 'https://static.wixstatic.com/media/2c8654_3ffd9a0cd2a544b29f175c556c4ad6ce~mv2.png/v1/fill/w_266,h_266,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/2c8654_3ffd9a0cd2a544b29f175c556c4ad6ce~mv2.png', 'alt', 'Georgetown University logo'),
      jsonb_build_object('name', 'Boston University', 'src', 'https://static.wixstatic.com/media/2c8654_956294ec39b0406ba76455aa5d2f615e~mv2.png/v1/fill/w_250,h_250,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Boston_University_seal.svg.png', 'alt', 'Boston University seal'),
      jsonb_build_object('name', 'Claremont McKenna College', 'src', 'https://static.wixstatic.com/media/2c8654_69f9b18f19db4eb68fa898beeaec3768~mv2.png/v1/fill/w_266,h_277,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/CMC%20Seal.png', 'alt', 'Claremont McKenna College seal')
    )
  ),
  "status" = 'published',
  "published_at" = now(),
  "updated_at" = now()
WHERE "slug" = 'past-success';