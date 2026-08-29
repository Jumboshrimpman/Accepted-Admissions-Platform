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

// Ensure you have this environment variable available
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_placeholder';
const CLERK_PROXY_URL = import.meta.env.VITE_CLERK_PROXY_URL;

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Landing} />
        
        <Route path="/sign-in/*?">
          <div className="min-h-screen flex items-center justify-center bg-gray-50/50 p-4">
            <SignIn routing="path" path="/sign-in" forceRedirectUrl="/portal" />
          </div>
        </Route>

        <Route path="/portal/courses/:courseId">
          <SignedIn>
            <Shell>
              <PortalCourse />
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/sign-in" />
          </SignedOut>
        </Route>

        <Route path="/portal/courses/:courseId/sessions/:sessionId">
          <SignedIn>
            <Shell>
              <PortalSession />
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/sign-in" />
          </SignedOut>
        </Route>

        <Route path="/portal/assignments/:assignmentId">
          <SignedIn>
            <Shell>
              <PortalAssignment />
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/sign-in" />
          </SignedOut>
        </Route>

        <Route path="/portal*">
          <SignedIn>
            <Shell>
              <Switch>
                <Route path="/portal" component={PortalDashboard} />
                <Route path="/portal/courses/:courseId" component={PortalCourse} />
                <Route path="/portal/courses/:courseId/sessions/:sessionId" component={PortalSession} />
                <Route path="/portal/assignments/:assignmentId" component={PortalAssignment} />
                <Route component={NotFound} />
              </Switch>
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/sign-in" />
          </SignedOut>
        </Route>

        <Route path="/tutor/courses/:courseId">
          <SignedIn>
            <Shell>
              <TutorCourse />
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/sign-in" />
          </SignedOut>
        </Route>

        <Route path="/tutor/sessions/:sessionId">
          <SignedIn>
            <Shell>
              <TutorSession />
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/sign-in" />
          </SignedOut>
        </Route>

        <Route path="/tutor*">
          <SignedIn>
            <Shell>
              <Switch>
                <Route path="/tutor" component={TutorDashboard} />
                <Route path="/tutor/courses/:courseId" component={TutorCourse} />
                <Route path="/tutor/sessions/:sessionId" component={TutorSession} />
                <Route component={NotFound} />
              </Switch>
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/sign-in" />
          </SignedOut>
        </Route>

        <Route path="/admin*">
          <SignedIn>
            <Shell>
              <Switch>
                <Route path="/admin" component={AdminDashboard} />
                <Route component={NotFound} />
              </Switch>
            </Shell>
          </SignedIn>
          <SignedOut>
            <Redirect to="/sign-in" />
          </SignedOut>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
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
