import { customFetch, type AdminAssignment } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";

export async function cloneAdminAssignmentToSession(
  assignmentId: string,
  sessionId: string,
  allowDuplicate = false,
): Promise<AdminAssignment> {
  return customFetch<AdminAssignment>(
    `/api/admin/assignments/${assignmentId}/clone-to-session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, allowDuplicate }),
    },
  );
}

export function useCloneAdminAssignmentToSession() {
  return useMutation({
    mutationFn: ({
      assignmentId,
      sessionId,
      allowDuplicate,
    }: {
      assignmentId: string;
      sessionId: string;
      allowDuplicate?: boolean;
    }) => cloneAdminAssignmentToSession(assignmentId, sessionId, allowDuplicate),
  });
}
