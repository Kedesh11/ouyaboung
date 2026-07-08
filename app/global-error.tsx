"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="text-center space-y-4 max-w-md">
            <h1 className="text-2xl font-semibold text-foreground">
              Une erreur inattendue est survenue
            </h1>
            <p className="text-muted-foreground">
              L&apos;équipe a été notifiée. Réessayez ou revenez à l&apos;accueil.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
