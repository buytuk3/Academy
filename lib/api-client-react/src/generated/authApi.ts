/**
 * lib/api-client-react — auth API client (P4.7 / C-A5).
 * Companion to apiAuthTypes. Uses the same customFetch as the generated client.
 */
import { customFetch } from "../custom-fetch.js";
import type { LoginRequest, RefreshRequest, RegisterRequestT, TokenPairT, UserResponseT } from "@workspace/api-zod";

export async function login(payload: LoginRequest): Promise<{ user: UserResponseT; accessToken: string; refreshToken: string }> {
  return customFetch<{ user: UserResponseT; accessToken: string; refreshToken: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function register(payload: RegisterRequestT): Promise<{ user: UserResponseT; accessToken: string; refreshToken: string }> {
  return customFetch<{ user: UserResponseT; accessToken: string; refreshToken: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function refresh(payload: RefreshRequest): Promise<TokenPairT> {
  return customFetch<TokenPairT>("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout(refreshToken?: string): Promise<{ ok: boolean }> {
  return customFetch<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function me(): Promise<UserResponseT> {
  return customFetch<UserResponseT>("/api/auth/me");
}
