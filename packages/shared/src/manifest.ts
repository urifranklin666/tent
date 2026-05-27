import { z } from "zod";

const VariableDef = z.object({
  type: z.enum(["string", "number", "boolean", "enum"]),
  description: z.string().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  optional: z.boolean().default(false),
  secret: z.boolean().default(false),
  values: z.array(z.string()).optional(), // for enum
  pattern: z.string().optional(), // regex for strings
});
export type VariableDef = z.infer<typeof VariableDef>;

export const TemplateManifest = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,32}$/, "lowercase letters, digits, hyphens; starts with letter; ≤33 chars"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "semver MAJOR.MINOR.PATCH"),
  description: z.string().min(1),
  variables: z.record(z.string(), VariableDef).default({}),
  requires: z
    .object({
      docker: z.boolean().default(false),
      postgres: z.boolean().default(false),
      nodejs: z.boolean().default(false),
    })
    .default({}),
  ports: z
    .object({
      internal: z.number().int().positive(),
    })
    .optional(),
  healthCheckPath: z.string().default("/healthz"),
});
export type TemplateManifest = z.infer<typeof TemplateManifest>;
