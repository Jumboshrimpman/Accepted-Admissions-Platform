import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SignInRecoveryButton } from "@/components/sign-in-recovery-button";
import { ProvisioningReference } from "@/components/provisioning-reference";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  WalletCards,
  X,
} from "lucide-react";
import {
  getGetCurrentUserQueryKey,
  useGetCurrentUser,
} from "@workspace/api-client-react";

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: apiUser, isLoading, error } = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
  });

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

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const role = apiUser.role;

  const getLinks = () => {
    switch (role) {
      case "tutor":
        return [
          { href: "/tutor", label: "Dashboard", icon: LayoutDashboard },
        ];
      case "administrator":
        return [
          { href: "/admin", label: "Overview", icon: Settings },
          { href: "/admin/curriculum", label: "Curriculum", icon: BookOpen },
          { href: "/admin/financials", label: "Finance", icon: WalletCards },
          { href: "/admin/content", label: "Content", icon: FileText },
          { href: "/tutor", label: "Tutor view", icon: BookOpen },
        ];
      default:
        return [
          { href: "/portal/curriculum", label: "Curriculum", icon: BookOpen },
        ];
    }
  };

  const links = getLinks();
  const linkActive = (href: string) =>
    location === href ||
    (href !== "/portal" &&
      href !== "/admin" &&
      href !== "/tutor" &&
      location.startsWith(href)) ||
    (href === "/admin" && location === "/admin") ||
    (href === "/tutor" && (location === "/tutor" || location.startsWith("/tutor/"))) ||
    (href === "/portal/curriculum" && location.startsWith("/portal"));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 w-full border-b bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                alt="Accepted Admissions"
                className="w-8 h-8 dark:invert"
              />
              <span className="font-bold text-lg tracking-tight text-foreground hidden sm:inline-block">
                Accepted Admissions
              </span>
            </Link>
            <nav className="hidden md:flex gap-1" aria-label="Portal navigation">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    linkActive(link.href)
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
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls="portal-mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
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
        {menuOpen && (
          <nav
            id="portal-mobile-navigation"
            className="border-t bg-card px-4 py-3 md:hidden"
            aria-label="Mobile portal navigation"
          >
            <div className="container mx-auto grid gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium ${
                    linkActive(link.href)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
