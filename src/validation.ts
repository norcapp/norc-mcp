import { z } from 'zod'

// Mirrors the vault API limits so bad input fails before any upstream call.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const noControl = (s: string) => !CONTROL.test(s)

export const MAX_NAME = 256
export const MAX_COMMAND = 4096
export const MAX_SCHEDULE = 256

export const id = z.string().regex(/^[0-9a-fA-F-]{36}$/, 'must be an id returned by list_jobs / list_machines')
export const name = z.string().trim().min(1).max(MAX_NAME).refine(noControl, 'must not contain control characters')
export const command = z
  .string()
  .trim()
  .min(1)
  .max(MAX_COMMAND)
  .refine(noControl, 'must be a single line without control characters')

const MACROS = /^@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)$/
const FIELD = /^[0-9A-Za-z*/,\-?#]+$/
// Shape only (5 fields or an @macro); the vault API does the full cron validation.
export function looksLikeCron(s: string): boolean {
  if (MACROS.test(s)) return true
  const fields = s.split(/\s+/)
  return fields.length === 5 && fields.every((f) => FIELD.test(f))
}
export const schedule = z
  .string()
  .trim()
  .max(MAX_SCHEDULE)
  .refine(looksLikeCron, 'must be a 5-field cron expression such as "0 * * * *"')

export const cursor = z.string().max(255).refine(noControl, 'invalid cursor')
