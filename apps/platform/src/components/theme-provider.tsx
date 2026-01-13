import { useRouter } from "@tanstack/react-router";
import { createContext, use, useEffect, useState } from "react";
import { setThemeServerFn, type Theme } from "@/lib/theme";

type ThemeContextVal = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (val: Theme) => void;
};

const ThemeContext = createContext<ThemeContextVal | null>(null);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({
  children,
  theme: initialTheme,
}: {
  children: React.ReactNode;
  theme: Theme;
}) {
  const router = useRouter();
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(
    initialTheme === "system" ? getSystemTheme() : initialTheme
  );

  useEffect(() => {
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        const newResolved = mediaQuery.matches ? "dark" : "light";
        setResolvedTheme(newResolved);
        document.documentElement.className = newResolved;
      };
      handleChange();
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    setResolvedTheme(theme);
    document.documentElement.className = theme;
  }, [theme]);

  function setTheme(val: Theme) {
    setThemeState(val);
    setThemeServerFn({ data: val }).then(() => router.invalidate());
  }

  return (
    <ThemeContext value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  const val = use(ThemeContext);
  if (!val) throw new Error("useTheme called outside of ThemeProvider!");
  return val;
}
