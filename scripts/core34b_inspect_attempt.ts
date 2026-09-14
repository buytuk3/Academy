import { desc, eq } from "drizzle-orm";
import { db } from "../packages/database/src/client.ts";
import { attemptsTable } from "../packages/database/src/schema/reading.ts";

const sessionId = process.env.SESSION_ID;
if (!sessionId) throw new Error("SESSION_ID is required");

async function main() {
  const rows = await db.select().from(attemptsTable)
    .where(eq(attemptsTable.sessionId, sessionId))
    .orderBy(desc(attemptsTable.createdAt))
    .limit(1);

  if (!rows.length) {
    console.log(JSON.stringify({ found: false }));
    return;
  }
  const row = rows[0];
  console.log(JSON.stringify({
    found: true,
    id: row.id,
    sessionId: row.sessionId,
    studentId: row.studentId,
    passageId: row.passageId,
    audioKey: row.audioKey,
    jobId: row.jobId,
    jobStatus: row.jobStatus,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
