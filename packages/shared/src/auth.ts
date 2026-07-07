import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.email(),
  // bcrypt truncates beyond 72 bytes — cap it at the boundary.
  password: z.string().min(8).max(72),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(72),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const userDtoSchema = z.object({
  id: z.uuid(),
  email: z.email(),
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const authResponseSchema = z.object({ user: userDtoSchema });
