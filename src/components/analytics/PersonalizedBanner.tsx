"use client";

import { useCustomerIntelligence } from '@/hooks/useCustomerIntelligence';
import { Sparkles } from 'lucide-react';

const BANNER_STYLES: Record<string, string> = {
  discount_focus: 'border-amber-200 bg-amber-50/50 text-amber-900 shadow-sm shadow-amber-100',
  high_intent: 'border-emerald-200 bg-emerald-50/50 text-emerald-900 shadow-sm shadow-emerald-100',
  retention: 'border-rose-200 bg-rose-50/50 text-rose-900 shadow-sm shadow-rose-100',
  exploration: 'border-sky-200 bg-sky-50/50 text-sky-900 shadow-sm shadow-sky-100',
  default: 'border-slate-200 bg-slate-50/50 text-slate-900 shadow-sm shadow-slate-100',
};

export function PersonalizedBanner() {
  const { status, recommendation } = useCustomerIntelligence();

  if (status === 'idle' || status === 'loading') return null;

  const bannerType = recommendation.banner in BANNER_STYLES ? recommendation.banner : 'default';

  return (
    <div className={`rounded-2xl border px-5 py-4 transition-all duration-300 hover:shadow-md ${BANNER_STYLES[bannerType]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-white/50 p-1.5 shadow-sm">
          <Sparkles className="h-4 w-4 text-current" />
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-medium leading-relaxed">
            {recommendation.message}
          </p>
        </div>
      </div>
    </div>
  );
}
