"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "./Button";

/** Wissel tussen lichte en donkere modus; de keuze wordt onthouden. */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const explicit = document.documentElement.dataset.theme;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- eenmalig lezen na laden
    setDark(
      explicit ? explicit === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    const t = next ? "dark" : "light";
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("thema", t);
    } catch {}
  };

  return (
    <IconButton label={dark ? "Lichte modus" : "Donkere modus"} onClick={toggle}>
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </IconButton>
  );
}
