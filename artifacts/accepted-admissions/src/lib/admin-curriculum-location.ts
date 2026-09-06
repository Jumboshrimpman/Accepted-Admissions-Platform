export const ADMIN_CURRICULUM_PATH = "/admin/curriculum";

export const ADMIN_CURRICULUM_SECTIONS = [
  "roadmap",
  "people",
  "programs",
  "curriculum",
  "sessions",
] as const;

export const ADMIN_CURRICULUM_TABS = [
  "quizzes",
  "questions",
  "library",
  "submissions",
] as const;

export type AdminCurriculumSection = (typeof ADMIN_CURRICULUM_SECTIONS)[number];
export type AdminCurriculumTab = (typeof ADMIN_CURRICULUM_TABS)[number];

const TAB_SET = new Set<string>(ADMIN_CURRICULUM_TABS);

const VISIBLE_SECTIONS = new Set<string>(["people", "sessions", "curriculum"]);

/**
 * Wouter's `useLocation()` is pathname-only. Query string lives on `useSearch()`.
 * Honor (in order): useSearch, `?` embedded in a location mock, then the
 * browser search string so a first paint cannot drop section/tab/quiz.
 */
export function searchStringFromLocation(location: string, search = "", browserSearch = ""): string {
  const embedded = location.includes("?") ? location.slice(location.indexOf("?") + 1) : "";
  const fromSearch = search.startsWith("?") ? search.slice(1) : search;
  const fromBrowser = browserSearch.startsWith("?") ? browserSearch.slice(1) : browserSearch;
  return fromSearch || embedded || fromBrowser;
}

export function resolveAdminCurriculumSection(requested: string | null): AdminCurriculumSection {
  if (requested && VISIBLE_SECTIONS.has(requested)) {
    return requested as AdminCurriculumSection;
  }
  if (requested === "roadmap" || requested === "programs") return "sessions";
  return "curriculum";
}

export function parseAdminCurriculumSearch(search: string): {
  section: AdminCurriculumSection;
  tab: AdminCurriculumTab;
  quizId: string | null;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const section = resolveAdminCurriculumSection(params.get("section"));
  const requestedTab = params.get("tab");
  const tab =
    requestedTab && TAB_SET.has(requestedTab) ? (requestedTab as AdminCurriculumTab) : "quizzes";
  const quiz = params.get("quiz")?.trim() ?? "";
  return { section, tab, quizId: quiz.length > 0 ? quiz : null };
}

export function adminCurriculumHref(input: {
  section?: string | null;
  tab?: string | null;
  quiz?: string | null;
} = {}): string {
  const section = resolveAdminCurriculumSection(input.section ?? null);
  const params = new URLSearchParams();
  params.set("section", section);
  if (section === "curriculum") {
    const tab =
      input.tab && TAB_SET.has(input.tab) ? (input.tab as AdminCurriculumTab) : "quizzes";
    params.set("tab", tab);
    if (tab === "quizzes" && input.quiz) {
      params.set("quiz", input.quiz);
    }
  }
  return `${ADMIN_CURRICULUM_PATH}?${params.toString()}`;
}

export function readAdminCurriculumSearch(location: string, search: string) {
  return parseAdminCurriculumSearch(
    searchStringFromLocation(
      location,
      search,
      typeof window === "undefined" ? "" : window.location.search,
    ),
  );
}
