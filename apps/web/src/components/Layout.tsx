import { Outlet, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import {
  BookOpen,
  Home,
  RefreshCw,
  BookA,
  History,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { AuthProvider } from "@/hooks/useAuth";

function NavItem({
  to,
  icon: Icon,
  children,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          isActive
            ? "bg-primary text-primary-foreground"
            : "hover:bg-accent hover:text-accent-foreground"
        }`
      }
    >
      <Icon className="h-5 w-5" />
      <span>{children}</span>
    </NavLink>
  );
}

function Sidebar() {
  return (
    <aside className="w-64 bg-card border-r min-h-screen p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-8">
        <span className="text-2xl">🐵</span>
        <h1 className="text-xl font-bold">Monke Say</h1>
      </div>

      <nav className="space-y-1 flex-1">
        <NavItem to="/" icon={Home}>
          Dashboard
        </NavItem>
        <NavItem to="/story" icon={BookOpen}>
          New Story
        </NavItem>
        <NavItem to="/review" icon={RefreshCw}>
          Review
        </NavItem>
        <NavItem to="/vocabulary" icon={BookA}>
          Vocabulary
        </NavItem>
        <NavItem to="/history" icon={History}>
          History
        </NavItem>
        <NavItem to="/settings" icon={Settings}>
          Settings
        </NavItem>
      </nav>
    </aside>
  );
}

function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <header className="lg:hidden bg-card border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐵</span>
          <h1 className="text-xl font-bold">Monke Say</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Menu className="h-6 w-6" />
        </Button>
      </header>

      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed right-0 top-0 h-full w-64 bg-card p-4 shadow-lg">
            <div className="flex justify-end mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
            <nav className="space-y-1">
              <NavItem to="/" icon={Home}>
                Dashboard
              </NavItem>
              <NavItem to="/story" icon={BookOpen}>
                New Story
              </NavItem>
              <NavItem to="/review" icon={RefreshCw}>
                Review
              </NavItem>
              <NavItem to="/vocabulary" icon={BookA}>
                Vocabulary
              </NavItem>
              <NavItem to="/history" icon={History}>
                History
              </NavItem>
              <NavItem to="/settings" icon={Settings}>
                Settings
              </NavItem>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

export function Layout() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-background">
        <MobileNav />
        <div className="flex">
          <div className="hidden lg:block">
            <Sidebar />
          </div>
          <div className="flex-1 flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1 p-4 lg:p-8">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </AuthProvider>
  );
}
