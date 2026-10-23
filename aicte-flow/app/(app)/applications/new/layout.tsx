import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function NewApplicationLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "INSTITUTION" && user.role !== "ADMIN") redirect("/applications");
  return children;
}
