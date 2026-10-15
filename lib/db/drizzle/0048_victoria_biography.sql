-- Replace Victoria's previous published biography with the shorter copy.
-- A biography that no longer matches that exact text is left as stored.

UPDATE "tutor_profiles"
SET
  "biography" = 'Victoria Wijerathnayapa graduated from Harvard in 2025 in Neuroscience and Education, after also being admitted to Brown and Yale. She makes learning engaging through evidence-based strategies, and has mentored students with the Japan-America Academic Center in Boston since 2023 and taught 500+ English lessons to international students. She is now an Operations & Business Development Associate at Todaydream.',
  "updated_at" = now()
WHERE "biography" = 'Victoria Wijerathnayapa graduated from Harvard in 2025 with a degree in Neuroscience and a focus on Education. She is passionate about making learning engaging, inclusive, and impactful through evidence-based strategies, bridging scientific research and instructional design. Since 2023 she has been a Youth Mentor with the Japan-America Academic Center in Boston, and she taught 500+ personalized English lessons to 400+ international students and professionals through Ringle. At Harvard she served on the Institute of Politics Policy Program''s Education Team, researching evidence-based graduation requirements, and helped Boston-area high school students lead their own civic engagement initiatives. She is currently an Operations & Business Development Associate at Todaydream, where she onboards and mentors its DreAmbassador professionals.';
