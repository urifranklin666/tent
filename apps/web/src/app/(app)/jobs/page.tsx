import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, jobs } from "@tent/core";
import { jobStateTone, relativeTime } from "@/lib/format";

export default async function JobsPage() {
  const rows = await getDb()
    .select()
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(50);

  return (
    <>
      <div className="crumb">queue</div>
      <h1 className="mb-3">jobs</h1>

      {rows.length === 0 ? (
        <div className="panel dim">no jobs yet</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>kind</th>
              <th>state</th>
              <th>attempt</th>
              <th>started</th>
              <th>id</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id}>
                <td className="mono">{j.kind}</td>
                <td><span className={`badge ${jobStateTone(j.state)}`}>{j.state}</span></td>
                <td className="muted">{j.attempts}</td>
                <td className="muted">{relativeTime(j.claimedAt ?? j.createdAt)}</td>
                <td><Link href={`/jobs/${j.id}`} className="mono" style={{ fontSize: "0.8rem" }}>{j.id.slice(0, 14)}…</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
