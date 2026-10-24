import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { EvcActionForm } from "./EvcActionForm";

export default async function EvcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["REGIONAL_OFFICER", "BUREAU_OFFICER", "EVC_COMMITTEE", "ADMIN"].includes(user.role)) {
    redirect("/dashboard");
  }

  const evc = await prisma.evcVisit.findUnique({
    where: { id },
    include: {
      application: {
        include: {
          institution: true,
          deadlineItems: { where: { state: "OPEN" } },
        },
      },
    },
  });

  if (!evc) notFound();

  if (user.role === "REGIONAL_OFFICER" && evc.application.regionId !== user.regionId) {
    notFound();
  }
  if (
    user.role === "EVC_COMMITTEE" &&
    evc.committeeId &&
    evc.committeeId !== user.id
  ) {
    notFound();
  }

  const committeeMembers = await prisma.user.findMany({
    where: { role: "EVC_COMMITTEE" },
    select: { id: true, name: true, email: true },
  });

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <EvcActionForm evc={evc} userRole={user.role} committeeMembers={committeeMembers} />
    </div>
  );
}
