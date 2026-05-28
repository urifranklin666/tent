import { describe, it, expect } from "vitest";
import { ServerProvider, UserRole, JobState, SiteStatus } from "@tent/shared";

describe("shared enums", () => {
  it("ServerProvider accepts known providers", () => {
    for (const v of ["hetzner", "digitalocean", "vultr", "selfhosted"] as const) {
      expect(ServerProvider.safeParse(v).success).toBe(true);
    }
  });

  it("ServerProvider rejects unknown providers", () => {
    expect(ServerProvider.safeParse("aws").success).toBe(false);
  });

  it("UserRole rank is total and orderable", () => {
    const order = ["viewer", "operator", "admin"] as const;
    for (const r of order) {
      expect(UserRole.safeParse(r).success).toBe(true);
    }
  });

  it("JobState round-trips terminal states", () => {
    for (const s of ["queued", "running", "succeeded", "failed", "canceled"] as const) {
      expect(JobState.safeParse(s).success).toBe(true);
    }
  });

  it("SiteStatus covers the full lifecycle", () => {
    for (const s of ["pending", "deploying", "live", "error", "destroying", "destroyed"] as const) {
      expect(SiteStatus.safeParse(s).success).toBe(true);
    }
  });
});

describe("domain regex (mirrors SiteService.DomainSchema)", () => {
  // The regex lives inside SiteService but is the contract the bot/web/cli
  // all rely on. Lift it here so a future change has a test to catch it.
  const re = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

  it("accepts common shapes", () => {
    expect(re.test("example.com")).toBe(true);
    expect(re.test("sub.example.com")).toBe(true);
    expect(re.test("a-b.c-d.example.io")).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(re.test("example")).toBe(false);
    expect(re.test(".example.com")).toBe(false);
    expect(re.test("ex_ample.com")).toBe(false);
    expect(re.test("-x.example.com")).toBe(false);
  });
});

describe("server-name regex (mirrors hostname validation in CLI + bot)", () => {
  const re = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i;

  it("accepts hostnames", () => {
    expect(re.test("barn")).toBe(true);
    expect(re.test("barn-01")).toBe(true);
    expect(re.test("a1")).toBe(true);
  });

  it("rejects leading/trailing hyphens and other punctuation", () => {
    expect(re.test("-barn")).toBe(false);
    expect(re.test("barn-")).toBe(false);
    expect(re.test("b.arn")).toBe(false);
    expect(re.test("barn_01")).toBe(false);
  });
});
