import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminAuth, getSupabaseAdmin, authErrorResponseBody } from '@/lib/admin/auth';
import { DB_TABLES } from '@/api/routes';

export const runtime = 'nodejs';

const MAX_TARGETS = 200;

interface BulkResult {
  userId: string;
  email: string;
  ok: boolean;
  reason?: 'HAS_TRANSACTIONS' | 'LAST_ADMIN_GUARD' | 'USER_NOT_FOUND' | 'AUTH_DELETE_FAILED';
  detail?: string;
}

interface ProfileRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const auth = await resolveAdminAuth(req);

  if (!auth.ok) {
    return NextResponse.json(authErrorResponseBody(auth, requestId), { status: auth.status });
  }

  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    return NextResponse.json(
      { success: false, request_id: requestId, error: { code: 'CONFIG_ERROR', message: 'Supabase service role is missing' } },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as { userIds?: unknown };
    const rawUserIds: unknown[] = Array.isArray(body.userIds) ? body.userIds : [];
    const userIds: string[] = Array.from(
      new Set(rawUserIds.filter((id): id is string => typeof id === 'string' && id.length > 0))
    );

    if (userIds.length === 0) {
      return NextResponse.json(
        { success: false, request_id: requestId, error: { code: 'INVALID_INPUT', message: 'Aucun utilisateur sélectionné' } },
        { status: 400 }
      );
    }

    if (userIds.length > MAX_TARGETS) {
      return NextResponse.json(
        { success: false, request_id: requestId, error: { code: 'TOO_MANY_TARGETS', message: `Veuillez sélectionner ${MAX_TARGETS} utilisateurs maximum à la fois` } },
        { status: 400 }
      );
    }

    if (userIds.includes(auth.userId as string)) {
      return NextResponse.json(
        { success: false, request_id: requestId, error: { code: 'SELF_TARGET_FORBIDDEN', message: 'Vous ne pouvez pas supprimer votre propre compte depuis cet outil' } },
        { status: 400 }
      );
    }

    const { data: profiles, error: fetchError } = await adminClient
      .from('profiles')
      .select('id, user_id, email, full_name, role')
      .in('user_id', userIds);

    if (fetchError) throw fetchError;

    const profileByUserId = new Map<string, ProfileRow>(
      ((profiles || []) as ProfileRow[]).map((p) => [p.user_id, p])
    );

    const { count: totalAdmins, error: countError } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (countError) throw countError;

    const adminsInBatch = userIds.filter((id) => profileByUserId.get(id)?.role === 'admin');
    // If the batch would wipe out every remaining admin, skip all of them
    // (which one to spare isn't a decision this tool should make silently)
    // rather than blocking the whole batch - the other, non-admin targets
    // still get processed normally.
    const blockAllAdmins = adminsInBatch.length > 0 && adminsInBatch.length >= (totalAdmins ?? 0);

    const results: BulkResult[] = [];

    for (const userId of userIds) {
      const profile = profileByUserId.get(userId);
      if (!profile) {
        results.push({ userId, email: '', ok: false, reason: 'USER_NOT_FOUND' });
        continue;
      }

      if (blockAllAdmins && profile.role === 'admin') {
        results.push({ userId, email: profile.email, ok: false, reason: 'LAST_ADMIN_GUARD', detail: 'Au moins un administrateur doit rester actif' });
        continue;
      }

      const [{ count: txCount }, { count: paymentTxCount }] = await Promise.all([
        adminClient.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        adminClient.from('payment_transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);

      const totalTx = (txCount ?? 0) + (paymentTxCount ?? 0);
      if (totalTx > 0) {
        results.push({
          userId,
          email: profile.email,
          ok: false,
          reason: 'HAS_TRANSACTIONS',
          detail: `${totalTx} transaction(s) associée(s)`,
        });
        continue;
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

      if (deleteError) {
        results.push({ userId, email: profile.email, ok: false, reason: 'AUTH_DELETE_FAILED', detail: deleteError.message });
        continue;
      }

      results.push({ userId, email: profile.email, ok: true });
    }

    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    if (succeeded.length > 0) {
      await adminClient.from(DB_TABLES.ADMIN_ACTIVITIES).insert({
        type: 'user_deleted',
        description: `Suppression en masse : ${succeeded.length} utilisateur(s) supprimé(s)`,
        metadata: {
          admin_id: auth.userId,
          deleted_user_ids: succeeded.map((r) => r.userId),
          skipped: failed,
          request_id: requestId,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        request_id: requestId,
        results,
        summary: { total: results.length, succeeded: succeeded.length, failed: failed.length },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in bulk user deletion:', error);
    return NextResponse.json(
      { success: false, request_id: requestId, error: { code: 'INTERNAL_ERROR', message: error.message || 'An internal error occurred' } },
      { status: 500 }
    );
  }
}
