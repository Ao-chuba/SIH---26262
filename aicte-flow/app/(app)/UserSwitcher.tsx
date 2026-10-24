"use client";

import { usePathname, useSearchParams } from "next/navigation";

type SwitchUser = { id: string; name: string; role: string };

export function UserSwitcher({
  users,
  currentUserId,
  action,
  roleLabels,
}: {
  users: SwitchUser[];
  currentUserId: string;
  action: (formData: FormData) => void | Promise<void>;
  roleLabels: Record<string, string>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const returnTo = `${pathname}${query ? `?${query}` : ""}`;

  return (
    <form action={action} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <select name="userId" defaultValue={currentUserId} aria-label="Switch user">
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {roleLabels[user.role] ?? user.role} ·{" "}
            {user.name.replace(/^Institution User\s*[–-]\s*/i, "").trim()}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-primary btn-sm">
        Switch
      </button>
    </form>
  );
}
