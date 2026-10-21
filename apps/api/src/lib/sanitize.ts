import { z } from "zod";

/** Strip null bytes and control chars often used in injection attempts. */
export function cleanText(value: string, max = 500) {
  return value
    .replace(/\0/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, max);
}

export function zText(max = 500, min = 1) {
  return z
    .string()
    .transform((s) => cleanText(s, max))
    .refine((s) => s.length >= min, { message: "Required" })
    .refine((s) => s.length <= max, { message: `Max ${max} characters` });
}

export function zOptionalText(max = 500) {
  return z
    .string()
    .optional()
    .transform((s) => (s == null ? undefined : cleanText(s, max) || undefined));
}

export function zEntityId() {
  return z
    .string()
    .trim()
    .min(8)
    .max(40)
    .regex(/^[a-z0-9_-]+$/i, "Invalid id");
}

export function zEmail() {
  return z
    .string()
    .trim()
    .email()
    .max(120)
    .transform((s) => s.toLowerCase());
}

export function zPassword(min = 8, max = 128) {
  return z.string().min(min).max(max);
}

export function zSearchQuery(max = 80) {
  return z
    .string()
    .optional()
    .transform((s) => (s ? cleanText(s, max).toLowerCase() : ""));
}

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown) {
  return schema.safeParse(body);
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, query: unknown) {
  return schema.safeParse(query);
}
