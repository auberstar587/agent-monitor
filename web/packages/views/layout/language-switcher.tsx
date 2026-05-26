"use client";

import { useI18n } from "@multica/core/i18n";
import { Globe } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
      onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}
    >
      <Globe className="h-4 w-4" />
      <span>{locale === "en" ? "中文" : "English"}</span>
    </Button>
  );
}
