import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "./api";
import type { UserOut } from "./types";

export const ME_KEY = ["me"] as const;

/** Usuário logado. 401 => não logado (data fica undefined, sem novas tentativas). */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiGet<UserOut>("/auth/me"),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    staleTime: 60_000,
  });
}
