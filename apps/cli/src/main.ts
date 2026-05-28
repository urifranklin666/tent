#!/usr/bin/env node
import { Command } from "commander";
import { cmdInit } from "./commands/init.js";
import { cmdServerAdd, cmdServerList, cmdServerDestroy } from "./commands/server.js";
import { cmdSiteNew, cmdSiteList, cmdSiteDestroy } from "./commands/site.js";
import { cmdJobTail, cmdJobList } from "./commands/job.js";
import { cmdTemplateList, cmdTemplateSync } from "./commands/template.js";
import { cmdBackupRun } from "./commands/backup.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdWorker } from "./commands/worker.js";

const program = new Command();

program
  .name("tent")
  .description("self-hosted deployment control plane")
  .version("0.1.0");

program
  .command("init")
  .description("first-time setup of the tent control plane on this box")
  .action(cmdInit);

program
  .command("worker")
  .description("run the job worker in the foreground (Ctrl-C to stop)")
  .action(cmdWorker);

const server = program.command("server").description("manage servers");
server
  .command("add")
  .description("provision (cloud) or attach (self-hosted) a server")
  .option("--no-wait", "return immediately, don't tail bootstrap progress")
  .action((opts) => cmdServerAdd(opts));
server.command("list").alias("ls").description("list managed servers").action(cmdServerList);
server.command("destroy <id-or-name>").description("destroy a server (DESTRUCTIVE)").action(cmdServerDestroy);

program
  .command("new-site <domain>")
  .alias("ns")
  .description("create + deploy a new site at the given domain")
  .option("--no-wait", "return immediately, don't tail deploy progress")
  .action((domain, opts) => cmdSiteNew(domain, opts));

const site = program.command("site").description("manage sites");
site
  .command("new <domain>")
  .description("alias of `tent new-site <domain>`")
  .option("--no-wait", "return immediately, don't tail deploy progress")
  .action((domain, opts) => cmdSiteNew(domain, opts));
site.command("list").alias("ls").description("list all sites").action(cmdSiteList);
site
  .command("destroy <slug-or-domain>")
  .description("destroy a site (DESTRUCTIVE)")
  .action(cmdSiteDestroy);

const job = program.command("job").description("inspect jobs");
job.command("tail <id>").description("stream a job's progress events").action(cmdJobTail);
job.command("list").alias("ls").description("list recent jobs").action(cmdJobList);

const template = program.command("template").description("manage stack templates");
template.command("list").alias("ls").description("list registered templates").action(cmdTemplateList);
template.command("sync").description("re-scan packages/templates/ and upsert into the DB").action(cmdTemplateSync);

const backup = program.command("backup").description("snapshot a site's state");
backup
  .command("run <slug-or-domain>")
  .description("enqueue a backup job for the given site")
  .option("--no-wait", "return immediately, don't tail backup progress")
  .action((target, opts) => cmdBackupRun(target, opts));

program
  .command("doctor")
  .description("sanity-check the control plane")
  .action(cmdDoctor);

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
