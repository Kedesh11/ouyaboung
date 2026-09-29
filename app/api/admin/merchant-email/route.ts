import { NextRequest, NextResponse } from 'next/server';
import { sendMerchantApprovalEmail, sendMerchantRejectionEmail } from '@/services/email.server';
import { resolveAdminAuth } from '@/lib/admin/auth';

export const runtime = 'nodejs';

type MerchantEmailPayload = {
  type: 'approval' | 'rejection';
  email: string;
  businessName: string;
  reason?: string;
};

const isValidPayload = (payload: unknown): payload is MerchantEmailPayload => {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Partial<MerchantEmailPayload>;
  return (
    (candidate.type === 'approval' || candidate.type === 'rejection') &&
    typeof candidate.email === 'string' &&
    candidate.email.length > 3 &&
    typeof candidate.businessName === 'string' &&
    candidate.businessName.length > 0
  );
};

const assertAdmin = async (
  request: NextRequest
): Promise<{ ok: true } | { ok: false; status: number; error: string }> => {
  const auth = await resolveAdminAuth(request);
  return auth.ok ? { ok: true } : { ok: false, status: auth.status, error: auth.reason || 'Unauthorized' };
};

export async function POST(request: NextRequest) {
  const auth = await assertAdmin(request);
  if (auth.ok === false) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  if (!isValidPayload(payload)) {
    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
  }

  const result =
    payload.type === 'approval'
      ? await sendMerchantApprovalEmail(payload.email, payload.businessName)
      : await sendMerchantRejectionEmail(payload.email, payload.businessName, payload.reason);

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error || 'Email send failed' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
