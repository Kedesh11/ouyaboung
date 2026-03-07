"use client";

import { useCustomerIntelligence } from '@/hooks/useCustomerIntelligence';
import { Badge } from '@/components/ui/badge';

const BANNER_STYLES: Record<string, string> = {
  discount_focus: 'border-amber-300 bg-amber-50 text-amber-900',
  high_intent: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  retention: 'border-rose-300 bg-rose-50 text-rose-900',
  exploration: 'border-sky-300 bg-sky-50 text-sky-900',
  default: 'border-slate-300 bg-slate-50 text-slate-900',
};

export function PersonalizedBanner() {
  const { intelligence, status, recommendation } = useCustomerIntelligence();

  if (status === 'idle' || status === 'loading') return null;

  const bannerType = recommendation.banner in BANNER_STYLES ? recommendation.banner : 'default';

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${BANNER_STYLES[bannerType]}`}>
      <div className="mb-1 flex items-center gap-2">
        <Badge variant="outline" className="border-current text-current">
          Personnalisation
        </Badge>
        <span className="font-medium">Segment: {intelligence?.dynamic_segment || 'Regular'}</span>
      </div>
      <p>{recommendation.message}</p>
    </div>
  );
}
