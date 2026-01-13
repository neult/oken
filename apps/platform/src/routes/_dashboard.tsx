import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Bot, Key, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth/client";

export const Route = createFileRoute("/_dashboard")({
  component: DashboardLayout,
});

const navItems = [
  { to: "/dashboard/agents", label: "Agents", icon: Bot },
  { to: "/dashboard/secrets", label: "Secrets", icon: Key },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

function DashboardLayout() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!session) {
    window.location.href = "/auth/login";
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/auth/login";
  };

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <Link to="/" className="text-xl font-bold text-white">
            Oken
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-300 hover:bg-slate-700 hover:text-white transition-colors"
              activeProps={{
                className:
                  "flex items-center gap-3 px-3 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700",
              }}
            >
              <item.icon size={20} />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-end px-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 text-gray-300 hover:text-white hover:bg-slate-700"
              >
                <User size={20} />
                <span>{session.user.name || session.user.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-slate-800 border-slate-700"
            >
              <DropdownMenuItem className="text-gray-300 focus:bg-slate-700 focus:text-white">
                <User size={16} className="mr-2" />
                {session.user.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-slate-700" />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-gray-300 focus:bg-slate-700 focus:text-white cursor-pointer"
              >
                <LogOut size={16} className="mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
