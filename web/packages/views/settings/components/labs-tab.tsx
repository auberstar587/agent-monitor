"use client";

import { useTranslation } from "@multica/core/i18n";

import { FlaskConical } from "lucide-react";
import { Card, CardContent } from "@multica/ui/components/ui/card";

export function LabsTab() {
  const t = useTranslation();  return (
    <div className="space-y-4">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t("settings.labs")}</h2>

        <Card>
          <CardContent>
            <div className="flex items-start gap-3">
              <div className="rounded-md border bg-muted/50 p-2 text-muted-foreground">
                <FlaskConical className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("settings.noLabs")}</p>
                <p className="text-sm text-muted-foreground">
                  Beta features that require manual opt-in will appear here.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
