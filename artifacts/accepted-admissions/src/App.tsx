import { type ReactNode, useEffect, useRef } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
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
import { ClerkProvider, Show, SignIn, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import {
  getGetCurrentUserQueryKey,
  setBaseUrl,
  useGetCurrentUser,
} from '@workspace/api-client-react';

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
import TutorAttempt from '@/pages/tutor/attempt';
import AdminDashboard from '@/pages/admin/dashboard';
import AdminCurriculum from '@/pages/admin/curriculum';
import AdminClientPreview from '@/pages/admin/client-preview';
import { AdminFinancialsPanel } from '@/pages/admin/financials-panel';
import { PublicContentPanel } from '@/pages/admin/public-content-panel';
import SatOfferings from '@/pages/public/sat-offerings';
import OurTeam from '@/pages/public/our-team';
import PastSuccess from '@/pages/public/past-success';
import ClientRequest from '@/pages/public/client-request';
import { Shell } from '@/components/shell';
import { SignInRecoveryButton } from '@/components/sign-in-recovery-button';
import { ProvisioningReference } from '@/components/provisioning-reference';
import { safeReturnPath } from '@/lib/safe-return-path';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

setBaseUrl(basePath || null);

const queryClient = new QueryClient();

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        previousUserId.current !== undefined &&
        previousUserId.current !== userId
      ) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function SignedIn({ children }: { children: ReactNode }) {
  return <Show when="signed-in">{children}</Show>;
}

function SignedOut({ children }: { children: ReactNode }) {
  return <Show when="signed-out">{children}</Show>;
}

function SignInPage() {
  const requestedReturnTo = new URLSearchParams(window.location.search).get("returnTo");
  const safeReturnTo = safeReturnPath({
    requested: requestedReturnTo,
    basePath,
    origin: window.location.origin,
    fallback: `${basePath}/portal`,
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50 p-4">
      <div className="w-full max-w-[400px] mb-4">
        <a
          href={`${basePath || '/'}`}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back to Home
        </a>
      </div>
      <SignIn
        routing="path"
        path={`${basePath}/login`}
        forceRedirectUrl={safeReturnTo}
        fallbackRedirectUrl={safeReturnTo}
        withSignUp={false}
        appearance={{
          elements: {
            footerAction: { display: 'none' },
            footer: { display: 'none' },
            socialButtonsBlockButton: { display: 'none' },
            socialButtonsBlockButtonText: { display: 'none' },
            socialButtonsProviderIcon: { display: 'none' },
            dividerRow: { display: 'none' },
          },
        }}
      />
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/sat" component={SatOfferings} />
        <Route path="/our-team" component={OurTeam} />
        <Route path="/past-success" component={PastSuccess} />
        <Route path="/client-request" component={ClientRequest} />
        
        <Route path="/login/*?" component={SignInPage} />

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

        <Route path="/portal/curriculum">
          <SignedIn>
            <Shell>
              <PortalDashboard />
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
                <Route path="/portal/curriculum" component={PortalDashboard} />
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

        <Route path="/tutor/attempts/:attemptId">
          <SignedIn>
            <RoleBoundary roles={["tutor", "administrator"]}>
              <Shell>
                <TutorAttempt />
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
                <Route path="/tutor/attempts/:attemptId" component={TutorAttempt} />
                <Route component={NotFound} />
              </Switch>
              </Shell>
            </RoleBoundary>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/admin/clients/:clientId/preview">
          <SignedIn>
            <RoleBoundary roles={["administrator"]}>
              <Shell>
                <AdminClientPreview />
              </Shell>
            </RoleBoundary>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/admin/curriculum">
          <SignedIn>
            <RoleBoundary roles={["administrator"]}>
              <Shell>
                <AdminCurriculum />
              </Shell>
            </RoleBoundary>
          </SignedIn>
          <SignedOut>
            <Redirect to="/login" />
          </SignedOut>
        </Route>

        <Route path="/admin/content">
          <SignedIn>
            <RoleBoundary roles={["administrator"]}>
              <Shell>
                <div className="mx-auto max-w-7xl"><PublicContentPanel /></div>
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
                <Route path="/admin/clients/:clientId/preview" component={AdminClientPreview} />
                <Route path="/admin/curriculum" component={AdminCurriculum} />
                <Route path="/admin/financials">
                  <div className="mx-auto max-w-7xl"><AdminFinancialsPanel /></div>
                </Route>
                <Route path="/admin/content">
                  <div className="mx-auto max-w-7xl"><PublicContentPanel /></div>
                </Route>
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
  const { data: user, isLoading, error } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
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
  roles: Array<"administrator" | "tutor" | "student" | "viewer">;
  children: ReactNode;
}) {
  const { data: user, isLoading, error } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });
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
        {forbidden ? <ProvisioningReference /> : null}
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
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/login`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function Root() {
  return (
    <WouterRouter base={basePath}>
      <App />
    </WouterRouter>
  );
}

export default Root;
