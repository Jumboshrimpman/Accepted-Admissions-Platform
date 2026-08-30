import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from 'wouter';
import { ClerkProvider, SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';
import { useGetCurrentUser } from '@workspace/api-client-react';

// Pages
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import PortalDashboard from '@/pages/portal/dashboard';
import PortalCourse from '@/pages/portal/course';
import PortalSession from '@/pages/portal/session';
import PortalAssignment from '@/pages/portal/assignment';
import TutorDashboard from '@/pages/tutor/dashboard';
import TutorCourse from '@/pages/tutor/course';
import TutorSession from '@/pages/tutor/session';
import AdminDashboard from '@/pages/admin/dashboard';
import { Shell } from '@/components/shell';
import { SignInRecoveryButton } from '@/components/sign-in-recovery-button';

// Ensure you have this environment variable available
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_placeholder';
const CLERK_PROXY_URL = import.meta.env.VITE_CLERK_PROXY_URL;

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Landing} />
        
        <Route path="/login/*?">
          <div className="min-h-screen flex items-center justify-center bg-gray-50/50 p-4">
            <SignIn
              routing="path"
              path="/login"
              forceRedirectUrl="/portal"
              withSignUp={false}
              appearance={{
                elements: {
                  footerAction: { display: "none" },
                  footer: { display: "none" },
                },
              }}
            />
          </div>
        </Route>

        <Route path="/sign-in/*?">
          <Redirect to="/login" />
        </Route>

        <Route path="/t-g">
          <Redirect to="/portal" />
        </Route>

        <Route path="/portal/courses/:courseId">
          <SignedIn>
            <Shell>
              <PortalCourse />
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/portal/courses/:courseId/sessions/:sessionId">
          <SignedIn>
            <Shell>
              <PortalSession />
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/portal/assignments/:assignmentId">
          <SignedIn>
            <Shell>
              <PortalAssignment />
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/portal*">
          <SignedIn>
            <Shell>
              <Switch>
                <Route path="/portal" component={PortalEntry} />
                <Route path="/portal/courses/:courseId" component={PortalCourse} />
                <Route path="/portal/courses/:courseId/sessions/:sessionId" component={PortalSession} />
                <Route path="/portal/assignments/:assignmentId" component={PortalAssignment} />
                <Route component={NotFound} />
              </Switch>
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/tutor/courses/:courseId">
          <SignedIn>
            <RoleBoundary roles={["tutor", "administrator"]}>
              <Shell>
              <TutorCourse />
              </Shell>
            </RoleBoundary>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/tutor/sessions/:sessionId">
          <SignedIn>
            <RoleBoundary roles={["tutor", "administrator"]}>
              <Shell>
              <TutorSession />
              </Shell>
            </RoleBoundary>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/tutor*">
          <SignedIn>
            <RoleBoundary roles={["tutor", "administrator"]}>
              <Shell>
              <Switch>
                <Route path="/tutor" component={TutorDashboard} />
                <Route path="/tutor/courses/:courseId" component={TutorCourse} />
                <Route path="/tutor/sessions/:sessionId" component={TutorSession} />
                <Route component={NotFound} />
              </Switch>
              </Shell>
            </RoleBoundary>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/admin*">
          <SignedIn>
            <RoleBoundary roles={["administrator"]}>
              <Shell>
              <Switch>
                <Route path="/admin" component={AdminDashboard} />
                <Route component={NotFound} />
              </Switch>
              </Shell>
            </RoleBoundary>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function PortalEntry() {
  const { data: user, isLoading, error } = useGetCurrentUser();
  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground">
        Loading your workspace…
      </div>
    );
  }
  if (error) {
    return <AccessMessage forbidden={(error as { status?: number }).status === 403} />;
  }
  if (user?.role === "administrator") return <Redirect to="/admin" />;
  if (user?.role === "tutor") return <Redirect to="/tutor" />;
  return <PortalDashboard />;
}

function RoleBoundary({
  roles,
  children,
}: {
  roles: Array<"administrator" | "tutor" | "student">;
  children: ReactNode;
}) {
  const { data: user, isLoading, error } = useGetCurrentUser();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Checking portal access…
      </div>
    );
  }
  if (error) {
    const status = (error as { status?: number }).status;
    return <AccessMessage forbidden={status === 403} />;
  }
  if (!user || !roles.includes(user.role)) {
    return <AccessMessage forbidden />;
  }
  return <>{children}</>;
}

function AccessMessage({ forbidden }: { forbidden: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">
          {forbidden ? "You don’t have access to this workspace" : "Sign in required"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {forbidden
            ? "This account is not assigned to the requested role or portal area."
            : "Sign in with your invited Accepted Admissions account to continue."}
        </p>
        <SignInRecoveryButton />
      </div>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      proxyUrl={CLERK_PROXY_URL}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
