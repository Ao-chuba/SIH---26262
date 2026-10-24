"use client";

import { useEffect, useState } from "react";

/** Mobile hamburger + backdrop for the fixed sidebar (hidden ≤768px without this). */
export function SidebarToggle() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    if (sidebar) sidebar.classList.toggle("open", open);
    document.body.classList.toggle("sidebar-open", open);
    return () => {
      document.body.classList.remove("sidebar-open");
      sidebar?.classList.remove("open");
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onNavClick(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".sidebar-nav a, .sidebar-nav button")) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onNavClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onNavClick);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="mobile-menu-btn"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mobile-menu-bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="mobile-menu-label">Menu</span>
      </button>
      {open && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
