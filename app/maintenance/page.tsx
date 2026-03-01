import type { Metadata } from "next";
import { Wrench, Leaf } from "lucide-react";
import MaintenanceTimer from "@/components/maintenance/MaintenanceTimer";

export const metadata: Metadata = {
  title: "Maintenance en cours",
  description:
    "La plateforme Ouyaboung est temporairement en maintenance. Revenez très bientôt.",
};

export default function MaintenancePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-secondary/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-lg w-full gap-8">
        {/* Icon */}
        <div className="relative flex items-center justify-center w-24 h-24 rounded-3xl bg-card border border-border shadow-xl">
          <Leaf className="absolute w-10 h-10 text-primary/20 -top-3 -right-3 rotate-12" />
          <Wrench className="w-10 h-10 text-primary" strokeWidth={1.5} />
        </div>

        {/* Headline */}
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-gradient">Maintenance</span> en cours
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Nous améliorons la plateforme{" "}
            <strong className="text-foreground">Ouyaboung</strong> pour vous offrir
            une meilleure expérience. Nous serons de retour dans&nbsp;:
          </p>
        </div>

        {/* Countdown */}
        <div className="w-full rounded-3xl bg-card/60 backdrop-blur-md border border-border shadow-lg p-8">
          <MaintenanceTimer />
        </div>

        {/* Contact */}
        <p className="text-sm text-muted-foreground">
          Des questions ?{" "}
          <a
            href="mailto:oyaboug@gmail.com"
            className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
          >
            Contactez-nous
          </a>
        </p>
      </div>
    </main>
  );
}
