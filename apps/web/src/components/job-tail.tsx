"use client";

import { useEffect, useRef, useState } from "react";
import type { JobProgressEvent, JobState } from "@tent/core";

const TERMINAL = new Set<JobState>(["succeeded", "failed", "canceled"]);

export function JobTail({
  jobId,
  initialEvents,
  initialState,
}: {
  jobId: string;
  initialEvents: JobProgressEvent[];
  initialState: JobState;
}) {
  const [events, setEvents] = useState<JobProgressEvent[]>(initialEvents);
  const [state, setState] = useState<JobState>(initialState);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (TERMINAL.has(initialState)) return;
    const es = new EventSource(`/api/jobs/${jobId}/stream?cursor=${initialEvents.length}`);
    es.addEventListener("event", (msg) => {
      const ev = JSON.parse((msg as MessageEvent).data) as JobProgressEvent;
      setEvents((prev) => [...prev, ev]);
    });
    es.addEventListener("state", (msg) => {
      const s = JSON.parse((msg as MessageEvent).data) as JobState;
      setState(s);
      if (TERMINAL.has(s)) es.close();
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId, initialEvents.length, initialState]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <>
      <div className="panel-title">progress</div>
      <div className="tail" ref={containerRef}>
        {events.length === 0 ? (
          <span className="info">waiting for output…</span>
        ) : (
          events.map((ev, i) => (
            <span key={i} className={`line ${lineClass(ev.kind)}`}>
              {paint(ev)}
            </span>
          ))
        )}
      </div>
      {!TERMINAL.has(state) ? (
        <div className="dim mt-2 mono" style={{ fontSize: "0.8rem" }}>live · auto-refreshing</div>
      ) : (
        <div className="mt-2 mono" style={{ fontSize: "0.8rem" }}>job {state}</div>
      )}
    </>
  );
}

function lineClass(kind: JobProgressEvent["kind"]): string {
  switch (kind) {
    case "step.start": return "step-start";
    case "step.end":   return "step-end";
    case "info":       return "info";
    case "warn":       return "warn";
    case "error":      return "error";
    case "stderr":     return "error";
    case "stdout":     return "stdout";
    case "result":     return "result";
    default:           return "";
  }
}

function paint(ev: JobProgressEvent): string {
  switch (ev.kind) {
    case "error":
    case "stderr":   return `✗ ${ev.message}`;
    case "warn":     return `! ${ev.message}`;
    case "step.start": return `▸ ${ev.message}`;
    case "step.end":   return `✓ ${ev.message}`;
    case "result":     return `◆ ${ev.message}`;
    case "info":       return `· ${ev.message}`;
    case "stdout":     return `  ${ev.message}`;
    default:           return `  ${ev.message}`;
  }
}
