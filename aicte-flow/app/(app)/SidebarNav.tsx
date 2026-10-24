"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string;
  label: string;
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
      <div className="nav-section-label">Workspace</div>
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive ? "active" : ""}`}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isActive ? "var(--highlighter-yellow)" : "var(--border-strong)",
                opacity: isActive ? 1 : 0.35,
                flexShrink: 0,
              }}
            />
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
