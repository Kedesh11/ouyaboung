"use client";

import { useEffect, useState } from "react";

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
}

interface MaintenanceTimerProps {
  /** ISO 8601 date string for when maintenance ends. Defaults to 24 h from mount. */
  endTime?: string;
}

function getTimeLeft(endTime: Date): TimeLeft {
  const diff = Math.max(0, endTime.getTime() - Date.now());
  const total = Math.floor(diff / 1000);
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function MaintenanceTimer({ endTime }: MaintenanceTimerProps) {
  const [end] = useState<Date>(() => {
    if (endTime) return new Date(endTime);
    const d = new Date();
    d.setHours(d.getHours() + 24);
    return d;
  });

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => getTimeLeft(end));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTimeLeft(getTimeLeft(end)), 1000);
    return () => clearInterval(id);
  }, [end]);

  if (!mounted) {
    return (
      <div className="flex gap-4 justify-center">
        {["--", "--", "--"].map((v, i) => (
          <TimeUnit key={i} value={v} label={["heures", "minutes", "secondes"][i]} />
        ))}
      </div>
    );
  }

  const done =
    timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0;

  if (done) {
    return (
      <p className="text-primary font-semibold text-lg animate-pulse">
        Retour en ligne d&apos;un moment à l&apos;autre…
      </p>
    );
  }

  return (
    <div className="flex gap-4 justify-center">
      <TimeUnit value={pad(timeLeft.hours)} label="heures" />
      <Colon />
      <TimeUnit value={pad(timeLeft.minutes)} label="minutes" />
      <Colon />
      <TimeUnit value={pad(timeLeft.seconds)} label="secondes" />
    </div>
  );
}

function TimeUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-20 h-20 rounded-2xl bg-card border border-border shadow-md flex items-center justify-center">
        <span className="text-3xl font-bold text-primary tabular-nums">{value}</span>
      </div>
      <span className="text-xs text-muted-foreground uppercase tracking-widest">{label}</span>
    </div>
  );
}

function Colon() {
  return (
    <div className="flex items-center pb-5">
      <span className="text-2xl font-bold text-primary/50">:</span>
    </div>
  );
}
