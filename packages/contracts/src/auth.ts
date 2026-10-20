import { z } from 'zod';

export const loginBodySchema = z.object({
  login: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(256),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
