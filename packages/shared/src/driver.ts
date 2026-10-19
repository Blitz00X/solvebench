import { z } from "zod"

export const Driver = z.enum(["human", "agent"])
export type Driver = z.infer<typeof Driver>

export const Mode = z.enum(["pair", "learning"])
export type Mode = z.infer<typeof Mode>
