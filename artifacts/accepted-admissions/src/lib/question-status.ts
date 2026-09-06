export function questionStatusLabel(status: string): string {
  if (status === "approved" || status === "reviewed") return "Ready for quiz";
  if (status === "rejected") return "Not using";
  return "Draft";
}

export function questionStatusHelp(status: string): string {
  if (status === "approved" || status === "reviewed") {
    return "Ready for quiz — it can stay on one quiz, or be added from a quiz workspace.";
  }
  if (status === "rejected") {
    return "Not using — this draft will not be added to a quiz.";
  }
  return "Draft — edit it, then add it to a quiz. Adding marks it ready.";
}
