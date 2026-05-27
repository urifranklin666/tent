"use client";

import { useMemo, useState } from "react";
import type { VariableDef } from "@tent/core";

type Server = { id: string; name: string; provider: string; ipv4: string };
type Template = {
  id: string;
  name: string;
  version: string;
  description: string;
  variables: Record<string, VariableDef>;
};

export function NewSiteForm({
  servers,
  templates,
  action,
}: {
  servers: Server[];
  templates: Template[];
  action: (formData: FormData) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );

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
      style={{ maxWidth: 640 }}
    >
      <div className="field">
        <label htmlFor="domain">domain</label>
        <input
          id="domain"
          name="domain"
          placeholder="hello.example.com"
          required
          pattern="^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$"
        />
        <div className="field-hint">public domain whose zone is in cloudflare</div>
      </div>

      <div className="field">
        <label htmlFor="serverId">server</label>
        <select id="serverId" name="serverId" required>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.provider} {s.ipv4 ? `(${s.ipv4})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="templateId">template</label>
        <select
          id="templateId"
          name="templateId"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          required
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.version} — {t.description}
            </option>
          ))}
        </select>
      </div>

      {selected && Object.keys(selected.variables).length > 0 ? (
        <div className="panel mt-3 mb-3">
          <div className="panel-title">template variables</div>
          {Object.entries(selected.variables).map(([key, def]) => (
            <VariableField key={key} name={key} def={def} />
          ))}
        </div>
      ) : null}

      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? "enqueuing deploy…" : "deploy site"}
      </button>
    </form>
  );
}

function VariableField({ name, def }: { name: string; def: VariableDef }) {
  const label = `${name}${def.secret ? " (secret)" : ""}`;
  const defaultStr =
    def.default === undefined || def.default === null ? "" : String(def.default);

  if (def.type === "boolean") {
    return (
      <div className="field">
        <label htmlFor={`var_${name}`}>{label}</label>
        <select
          id={`var_${name}`}
          name={`var_${name}`}
          defaultValue={def.default === true ? "true" : "false"}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        {def.description ? <div className="field-hint">{def.description}</div> : null}
      </div>
    );
  }

  if (def.type === "enum" && def.values) {
    return (
      <div className="field">
        <label htmlFor={`var_${name}`}>{label}</label>
        <select id={`var_${name}`} name={`var_${name}`} defaultValue={defaultStr}>
          {def.values.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        {def.description ? <div className="field-hint">{def.description}</div> : null}
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor={`var_${name}`}>{label}</label>
      <input
        id={`var_${name}`}
        name={`var_${name}`}
        type={def.secret ? "password" : def.type === "number" ? "number" : "text"}
        defaultValue={defaultStr}
        required={!def.optional && !def.secret}
        autoComplete={def.secret ? "off" : undefined}
      />
      {def.description ? <div className="field-hint">{def.description}</div> : null}
    </div>
  );
}
