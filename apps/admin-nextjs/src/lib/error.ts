import { AuthApiError } from "@easy-auth/auth-client";

export function errorMessage(err: unknown): string {
  if (err instanceof AuthApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
