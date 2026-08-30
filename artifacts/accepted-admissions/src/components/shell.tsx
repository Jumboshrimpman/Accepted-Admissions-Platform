import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { SignInRecoveryButton } from "@/components/sign-in-recovery-button";
import { ProvisioningReference } from "@/components/provisioning-reference";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, BookOpen, LayoutDashboard, Settings } from "lucide-react";
import { useGetCurrentUser } from "@workspace/api-client-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  
  const { data: apiUser, isLoading, error } = useGetCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Checking portal access…
      </div>
    );
  }
  if (error || !apiUser) {
    const status = (error as { status?: number } | null)?.status;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">Portal access unavailable</h1>
          <p className="mt-3 text-muted-foreground">
            {status === 403
              ? "Your Clerk sign-in succeeded, but this development account is not on the portal access list."
              : "We could not confirm portal access. Please sign in again or contact an administrator."}
          </p>
          {status === 403 ? <ProvisioningReference /> : null}
          <SignInRecoveryButton />
        </div>
      </div>
    );
  }

  const role = apiUser.role;

  const getLinks = () => {
    switch(role) {
      case "tutor":
        return [
          { href: "/tutor", label: "Dashboard", icon: LayoutDashboard },
          { href: "/portal", label: "Client preview", icon: BookOpen },
        ];
      case "administrator":
        return [
          { href: "/admin", label: "Admin", icon: Settings },
          { href: "/tutor", label: "Tutor View", icon: BookOpen },
        ];
      default:
        return [
          { href: "/portal", label: "Dashboard", icon: LayoutDashboard },
        ];
    }
  };

  const links = getLinks();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 w-full border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                alt="Accepted Admissions"
                className="w-8 h-8 rounded-lg"
              />
              <span className="font-bold text-lg tracking-tight text-foreground hidden sm:inline-block">
                Accepted Admissions
              </span>
            </Link>
            <nav className="hidden md:flex gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location === link.href || (link.href !== "/portal" && location.startsWith(link.href))
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-2">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent overflow-hidden">
                    {user?.imageUrl ? (
                      <img src={user.imageUrl} alt={user.fullName || ""} className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-medium text-xs">
                        {user?.firstName?.charAt(0) || "U"}
                      </span>
                    )}
                  </div>
                  <div className="hidden sm:flex flex-col items-start text-left">
                    <span className="text-sm font-medium leading-none">{user?.fullName}</span>
                    <span className="text-xs text-muted-foreground capitalize leading-none">{role}</span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => signOut()} className="text-destructive cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}