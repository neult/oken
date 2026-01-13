import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";

export type Theme = "light" | "dark" | "system";

const storageKey = "_preferred-theme";

export const getThemeServerFn = createServerFn().handler(
  async () => (getCookie(storageKey) || "system") as Theme
);

export const setThemeServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: Theme) => data)
  .handler(async ({ data }) => setCookie(storageKey, data));
