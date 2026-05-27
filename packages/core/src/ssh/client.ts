import { Client as SshClient, type ClientChannel, type ConnectConfig } from "ssh2";
import { sshFingerprint } from "./keys.js";

export interface SshConnectOptions {
  host: string;
  port?: number;
  username: string;
  privateKeyPem: string;
  expectedHostFingerprint?: string; // SHA256:... — if provided, must match
  onLearnHostFingerprint?: (fp: string) => void | Promise<void>;
  readyTimeoutMs?: number;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Open a single-shot SSH connection and run one command. Closes the connection on completion.
 */
export async function sshExec(opts: SshConnectOptions, command: string): Promise<ExecResult> {
  const conn = new SshClient();
  let stdout = "";
  let stderr = "";

  const config: ConnectConfig = {
    host: opts.host,
    port: opts.port ?? 22,
    username: opts.username,
    privateKey: opts.privateKeyPem,
    readyTimeout: opts.readyTimeoutMs ?? 20_000,
    hostVerifier: (keyBlob: Buffer | string) => {
      const blob = typeof keyBlob === "string" ? Buffer.from(keyBlob, "utf8") : keyBlob;
      const fp = sshFingerprint(blob);
      if (opts.expectedHostFingerprint) {
        if (fp !== opts.expectedHostFingerprint) {
          // ssh2 closes the connection if this returns false.
          return false;
        }
        return true;
      }
      // First-contact: accept and record.
      if (opts.onLearnHostFingerprint) {
        void opts.onLearnHostFingerprint(fp);
      }
      return true;
    },
  };

  return new Promise<ExecResult>((resolve, reject) => {
    conn
      .on("ready", () => {
        conn.exec(command, (err: Error | undefined, stream: ClientChannel) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }
          stream
            .on("close", (code: number | null) => {
              conn.end();
              resolve({ code: code ?? -1, stdout, stderr });
            })
            .on("data", (chunk: Buffer) => {
              stdout += chunk.toString("utf8");
            });
          stream.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString("utf8");
          });
        });
      })
      .on("error", (err: Error) => reject(err))
      .connect(config);
  });
}

/**
 * Wait until SSH is reachable on the given host. Polls up to `attempts` times,
 * sleeping `delayMs` between tries. Returns the host fingerprint observed.
 */
export async function waitForSsh(
  opts: SshConnectOptions,
  { attempts = 30, delayMs = 5_000 }: { attempts?: number; delayMs?: number } = {},
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    try {
      let observed: string | undefined;
      const probeOpts: SshConnectOptions = {
        ...opts,
        onLearnHostFingerprint: (fp) => {
          observed = fp;
        },
      };
      const result = await sshExec(probeOpts, "echo tent-ready");
      if (result.code === 0 && observed) return observed;
      if (result.code === 0) {
        // Fall through and try again — fingerprint should populate on next attempt.
      }
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`SSH did not become ready on ${opts.host}:${opts.port ?? 22} after ${attempts} attempts`);
}
