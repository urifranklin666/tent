import { spawn } from "node:child_process";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "../env.js";
import { progressEvent, type JobProgressEvent } from "@tent/shared";

export interface AnsibleHost {
  name: string;
  host: string;
  port?: number;
  user: string;
  privateKeyPath: string;
  vars?: Record<string, string | number | boolean>;
}

export interface RunPlaybookInput {
  playbookPath: string;
  host: AnsibleHost;
  extraVars?: Record<string, unknown>;
  envOverrides?: Record<string, string>;
  onEvent?: (event: JobProgressEvent) => void;
}

export interface RunPlaybookResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run an Ansible playbook against a single host. Writes a one-shot inventory file
 * to a temp dir and cleans it up on exit. Streams stdout/stderr as job progress events.
 */
export async function runPlaybook(input: RunPlaybookInput): Promise<RunPlaybookResult> {
  const stateDir = getEnv().TENT_STATE_DIR;
  const runDir = path.join(stateDir, "ansible-runs", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(runDir, { recursive: true });

  try {
    const inventoryPath = path.join(runDir, "inventory.ini");
    const inventory = buildInventory(input.host);
    await writeFile(inventoryPath, inventory, { mode: 0o600 });

    let extraVarsArgs: string[] = [];
    if (input.extraVars && Object.keys(input.extraVars).length > 0) {
      const extraVarsPath = path.join(runDir, "vars.json");
      await writeFile(extraVarsPath, JSON.stringify(input.extraVars), { mode: 0o600 });
      extraVarsArgs = ["--extra-vars", `@${extraVarsPath}`];
    }

    const args = ["-i", inventoryPath, ...extraVarsArgs, input.playbookPath];

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ANSIBLE_HOST_KEY_CHECKING: "False",
      ANSIBLE_STDOUT_CALLBACK: "default",
      ANSIBLE_NOCOLOR: "1",
      ANSIBLE_PRIVATE_KEY_FILE: input.host.privateKeyPath,
      ...input.envOverrides,
    };

    return await new Promise<RunPlaybookResult>((resolve, reject) => {
      const child = spawn("ansible-playbook", args, { env });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          input.onEvent?.(progressEvent("stdout", line));
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        for (const line of text.split(/\r?\n/)) {
          if (!line.trim()) continue;
          input.onEvent?.(progressEvent("stderr", line));
        }
      });

      child.on("error", (err) => reject(err));
      child.on("close", (code) => {
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  } finally {
    await rm(runDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildInventory(host: AnsibleHost): string {
  const lines: string[] = [];
  lines.push("[managed]");
  const vars: string[] = [
    `ansible_host=${host.host}`,
    `ansible_user=${host.user}`,
    `ansible_port=${host.port ?? 22}`,
    `ansible_ssh_private_key_file=${host.privateKeyPath}`,
    `ansible_python_interpreter=/usr/bin/python3`,
  ];
  if (host.vars) {
    for (const [k, v] of Object.entries(host.vars)) {
      vars.push(`${k}=${quoteIfNeeded(String(v))}`);
    }
  }
  lines.push(`${host.name} ${vars.join(" ")}`);
  return lines.join("\n") + "\n";
}

function quoteIfNeeded(s: string): string {
  if (/[\s"']/.test(s)) return JSON.stringify(s);
  return s;
}

