import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@tent/core";
import { JobTail } from "@/components/job-tail";
import { jobStateTone, shortDate } from "@/lib/format";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <>
      <div className="crumb"><Link href="/jobs">jobs</Link> / {id.slice(0, 14)}…</div>
      <div className="row between mb-3">
        <h1 className="mono">{job.kind}</h1>
        <span className={`badge ${jobStateTone(job.state)}`}>{job.state}</span>
      </div>

      <div className="panel mb-3">
        <table className="table">
          <tbody>
            <tr><td className="muted" style={{ width: "12rem" }}>id</td><td className="mono">{job.id}</td></tr>
            <tr><td className="muted">attempt</td><td className="mono">{job.attempts} / {job.maxAttempts}</td></tr>
            <tr><td className="muted">created</td><td>{shortDate(job.createdAt)}</td></tr>
            <tr><td className="muted">claimed</td><td>{shortDate(job.claimedAt)}</td></tr>
            <tr><td className="muted">finished</td><td>{shortDate(job.finishedAt)}</td></tr>
            {job.error ? <tr><td className="muted">error</td><td className="mono" style={{ color: "var(--bad)" }}>{job.error}</td></tr> : null}
          </tbody>
        </table>
      </div>

      <JobTail
        jobId={job.id}
        initialEvents={job.progress ?? []}
        initialState={job.state}
      />
    </>
  );
}
