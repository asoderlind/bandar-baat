import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Flame,
  BookA,
  RefreshCw,
  CircleUser,
  Settings,
  LogOut,
} from "lucide-react";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["user-stats"],
    queryFn: () => api.getStats(),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  const { data: reviewSummary } = useQuery({
    queryKey: ["review-summary"],
    queryFn: () => api.getReviewSummary(),
    staleTime: 1000 * 60 * 2,
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <nav className="h-14 border-b bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6">
      {/* Stats */}
      <div className="flex items-center gap-4 lg:gap-6 text-sm">
        <div className="flex items-center gap-1.5" title="Current streak">
          <Flame
            className={`h-4 w-4 ${
              (stats?.streakDays ?? 0) > 0
                ? "text-orange-500 fill-orange-500"
                : "text-muted-foreground"
            }`}
          />
          <span className="font-medium">{stats?.streakDays ?? 0}</span>
          <span className="text-muted-foreground hidden sm:inline">streak</span>
        </div>

        <div className="flex items-center gap-1.5" title="Reviews due">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{reviewSummary?.dueCount ?? 0}</span>
          <span className="text-muted-foreground hidden sm:inline">due</span>
        </div>

        <div className="flex items-center gap-1.5" title="Words known">
          <BookA className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{stats?.wordsKnown ?? 0}</span>
          <span className="text-muted-foreground hidden sm:inline">words</span>
        </div>
      </div>

      {/* Profile dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full h-9 w-9">
            <CircleUser className="h-5 w-5" />
            <span className="sr-only">Profile menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user?.name || "User"}
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => navigate("/settings")}
          >
            <Settings className="h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
