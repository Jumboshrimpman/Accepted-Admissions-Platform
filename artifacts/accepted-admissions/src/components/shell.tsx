import { Link, useLocation } from "wouter";
import { UserButton, useUser, useClerk } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
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
  
  // Using the API user to know the role, though we might not have it yet if loading
  const { data: apiUser } = useGetCurrentUser();

  const role = apiUser?.role || "student";

  const getLinks = () => {
    switch(role) {
      case "tutor":
        return [
          { href: "/tutor", label: "Dashboard", icon: LayoutDashboard },
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
              <img src="/logo.svg" alt="Accepted Admissions" className="w-8 h-8 rounded-lg" />
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