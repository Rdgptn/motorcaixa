// Session boundary: auth is an httpOnly cookie the backend owns. On account
// changes, discard protected data and seed the authenticated user deterministically.
import { queryClient } from "./queryClient";
import { apiPost } from "./api-client";
import { ME_KEY } from "./data-hooks";
import type { UserOut } from "./types";

// Cancel pre-login requests so an unauthenticated response cannot race with login.
export async function beginSession(user: UserOut): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
  queryClient.setQueryData(ME_KEY, user);
}

// Call from every sign-out control; the hard redirect resets all in-memory state.
export async function endSession(redirectTo: string = "/login"): Promise<void> {
  try {
    await apiPost("/auth/logout");
  } finally {
    queryClient.clear();
    window.location.assign(redirectTo);
  }
}
