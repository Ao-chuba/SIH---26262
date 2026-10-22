import { tick } from "../src/lib/engine/tick";

async function main() {
  console.log("⏱️ Running AICTE Flow Engine Tick...");
  const result = await tick();
  console.log("✅ Engine Tick completed successfully:");
  console.log(`   - Reminders Fired: ${result.remindersFired}`);
  console.log(`   - Overdue Marked:  ${result.overdueMarked}`);
  console.log(`   - Escalations:     ${result.escalations}`);
  console.log(`   - Ticked At:       ${result.tickedAt.toISOString()}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Tick failed:", err);
  process.exit(1);
});
