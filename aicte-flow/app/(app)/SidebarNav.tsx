"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Users,
  ShieldCheck,
  FolderOpen,
  AlertTriangle,
  Bell,
  BarChart3,
  History,
  Settings,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
};

const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/applications": FileText,
  "/evc": Users,
  "/undertakings": ShieldCheck,
  "/documents": FolderOpen,
  "/escalations": AlertTriangle,
  "/notifications": Bell,
  "/reports": BarChart3,
  "/audit": History,
  "/admin": Settings,
  "/demo": Waypoints,
};

export function SidebarNav({
  items,
  unreadCount,
}: {
  items: NavItem[];
  unreadCount: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

        const Icon = NAV_ICONS[item.href] || FileText;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive ? "active" : ""}`}
          >
            <Icon size={17} strokeWidth={2.2} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.85 }} />
            <span>{item.label}</span>
            {item.href === "/notifications" && unreadCount > 0 && (
              <span className="badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

