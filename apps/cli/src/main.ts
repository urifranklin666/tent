#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("tent")
  .description("self-hosted deployment control plane")
  .version("0.1.0");

program
  .command("init")
  .description("first-time setup of the tent control plane on this box")
  .action(() => {
    console.log("tent init — not yet implemented (Phase 2)");
  });

const server = program.command("server").description("manage servers");

server
  .command("add")
  .description("provision or attach a server")
  .action(() => {
    console.log("tent server add — not yet implemented (Phase 2)");
  });

server
  .command("list")
  .description("list managed servers")
  .action(() => {
    console.log("tent server list — not yet implemented (Phase 2)");
  });

server
  .command("bootstrap <id>")
  .description("re-run bootstrap on an existing server")
  .action((id: string) => {
    console.log(`tent server bootstrap ${id} — not yet implemented (Phase 2)`);
  });

server
  .command("destroy <id>")
  .description("destroy a server (and the cloud VM behind it, if applicable)")
  .action((id: string) => {
    console.log(`tent server destroy ${id} — not yet implemented (Phase 2)`);
  });

const site = program.command("site").description("manage sites");

site
  .command("new <domain>")
  .description("create a new site for the given domain")
  .action((domain: string) => {
    console.log(`tent site new ${domain} — not yet implemented (Phase 2)`);
  });

site
  .command("list")
  .description("list all sites")
  .action(() => {
    console.log("tent site list — not yet implemented (Phase 2)");
  });

site
  .command("deploy <slug>")
  .description("redeploy a site after template or env changes")
  .action((slug: string) => {
    console.log(`tent site deploy ${slug} — not yet implemented (Phase 2)`);
  });

site
  .command("destroy <slug>")
  .description("destroy a site (DNS, tunnel route, app, and database)")
  .action((slug: string) => {
    console.log(`tent site destroy ${slug} — not yet implemented (Phase 2)`);
  });

program
  .command("doctor")
  .description("sanity-check the control plane and all managed servers")
  .action(() => {
    console.log("tent doctor — not yet implemented (Phase 6)");
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
