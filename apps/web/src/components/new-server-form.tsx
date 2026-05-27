"use client";

import { useEffect, useState } from "react";
import type { ServerProvider, Region, Size } from "@tent/core";

export function NewServerForm({
  availableProviders,
  action,
}: {
  availableProviders: ServerProvider[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [provider, setProvider] = useState<ServerProvider>(availableProviders[0] ?? "selfhosted");
  const [regions, setRegions] = useState<Region[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [regionId, setRegionId] = useState<string>("");
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingSizes, setLoadingSizes] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (provider === "selfhosted") {
      setRegions([]);
      setSizes([]);
      setRegionId("");
      return;
    }
    setLoadingRegions(true);
    fetch(`/api/providers/${provider}/regions`)
      .then((r) => r.json())
      .then((rs: Region[]) => {
        setRegions(rs);
        const first = rs[0]?.id ?? "";
        setRegionId(first);
      })
      .catch(() => setRegions([]))
      .finally(() => setLoadingRegions(false));
  }, [provider]);

  useEffect(() => {
    if (provider === "selfhosted" || !regionId) {
      setSizes([]);
      return;
    }
    setLoadingSizes(true);
    fetch(`/api/providers/${provider}/sizes?region=${encodeURIComponent(regionId)}`)
      .then((r) => r.json())
      .then((ss: Size[]) => setSizes(ss))
      .catch(() => setSizes([]))
      .finally(() => setLoadingSizes(false));
  }, [provider, regionId]);

  return (
    <form
      action={async (fd) => {
        setSubmitting(true);
        try {
          await action(fd);
        } finally {
          setSubmitting(false);
        }
      }}
      style={{ maxWidth: 560 }}
    >
      <div className="field">
        <label htmlFor="provider">provider</label>
        <select
          id="provider"
          name="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as ServerProvider)}
        >
          {availableProviders.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        <div className="field-hint">cloud providers are listed if their api token is set</div>
      </div>

      <div className="field">
        <label htmlFor="name">name</label>
        <input
          id="name"
          name="name"
          placeholder="barn"
          required
          pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
        />
        <div className="field-hint">alphanumeric + hyphens; used as hostname</div>
      </div>

      {provider === "selfhosted" ? (
        <>
          <div className="field">
            <label htmlFor="host">ipv4 address</label>
            <input id="host" name="host" placeholder="203.0.113.10" required pattern="^\d{1,3}(\.\d{1,3}){3}$" />
          </div>
          <div className="field">
            <label htmlFor="sshUser">ssh user</label>
            <input id="sshUser" name="sshUser" defaultValue="root" />
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="regionId">region</label>
            <select
              id="regionId"
              name="regionId"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              disabled={loadingRegions || regions.length === 0}
              required
            >
              {loadingRegions ? <option>loading…</option> : null}
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sizeId">size</label>
            <select id="sizeId" name="sizeId" disabled={loadingSizes || sizes.length === 0} required>
              {loadingSizes ? <option>loading…</option> : null}
              {sizes.slice(0, 30).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.cpuCores}c / {(s.memoryMb / 1024).toFixed(0)}gb / {s.diskGb}gb · ~${s.monthlyPriceUsd.toFixed(2)}/mo
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? "enqueuing…" : "add server"}
      </button>
    </form>
  );
}
