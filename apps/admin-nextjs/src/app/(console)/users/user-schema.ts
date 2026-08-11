import { z } from "zod";

/**
 * Shared between the create and edit forms — everything `CreateUserInput` and `UpdateUserInput`
 * have in common. `email` and `password` are appended only on the create schema: email isn't in
 * `UpdateUserInput` at all (not editable once the account exists), and there is no way to change a
 * password from this admin form — `UpdateUserInput` has no `password` field either.
 */
const userFieldsSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  phone: z.string().optional(),
  username: z.string().optional(),
  photo: z.string().nullable().optional(),
  roles: z.array(z.string()).optional(),
});

export const createUserSchema = userFieldsSchema.extend({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type CreateUserFormValues = z.infer<typeof createUserSchema>;

export const editUserSchema = userFieldsSchema;
export type EditUserFormValues = z.infer<typeof editUserSchema>;
