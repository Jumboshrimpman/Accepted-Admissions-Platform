/** SSR stand-in so legal pages can render without loading Clerk. */
export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    sessionId: null,
    getToken: async () => null,
  };
}
