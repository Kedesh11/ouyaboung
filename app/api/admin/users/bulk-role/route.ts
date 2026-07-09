import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminAuth, getSupabaseAdmin, authErrorResponseBody } from '@/lib/admin/auth';
import { DB_TABLES } from '@/api/routes';

export const runtime = 'nodejs';

const VALID_ROLES = ['user', 'merchant', 'admin'] as const;
type Role = (typeof VALID_ROLES)[number];

const MAX_TARGETS = 200;

interface BulkResult {
  userId: string;
  email: string;
  ok: boolean;
  reason?: string;
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
    const body = (await req.json()) as { userIds?: unknown; role?: unknown };
    const rawUserIds: unknown[] = Array.isArray(body.userIds) ? body.userIds : [];
    const role = typeof body.role === 'string' ? body.role : '';

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

    if (!VALID_ROLES.includes(role as Role)) {
      return NextResponse.json(
        { success: false, request_id: requestId, error: { code: 'INVALID_ROLE', message: 'Rôle invalide' } },
        { status: 400 }
      );
    }

    if (userIds.includes(auth.userId as string)) {
      return NextResponse.json(
        { success: false, request_id: requestId, error: { code: 'SELF_TARGET_FORBIDDEN', message: 'Vous ne pouvez pas modifier votre propre rôle depuis cet outil' } },
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

    // Last-admin guard: reject the whole request if it would bring the
    // platform's admin count to zero.
    if (role !== 'admin') {
      const { count: totalAdmins, error: countError } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');

      if (countError) throw countError;

      const adminsInBatch = userIds.filter((id) => profileByUserId.get(id)?.role === 'admin').length;

      if (adminsInBatch > 0 && adminsInBatch >= (totalAdmins ?? 0)) {
        return NextResponse.json(
          { success: false, request_id: requestId, error: { code: 'LAST_ADMIN_GUARD', message: 'Impossible : au moins un administrateur doit rester actif sur la plateforme' } },
          { status: 409 }
        );
      }
    }

    const results: BulkResult[] = [];

    for (const userId of userIds) {
      const profile = profileByUserId.get(userId);
      if (!profile) {
        results.push({ userId, email: '', ok: false, reason: 'USER_NOT_FOUND' });
        continue;
      }

      const { error: updateError } = await adminClient
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (updateError) {
        results.push({ userId, email: profile.email, ok: false, reason: 'DB_UPDATE_FAILED' });
        continue;
      }

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { role },
        app_metadata: { role },
      });

      if (authUpdateError) {
        console.error('Failed to sync auth metadata:', authUpdateError);
      }

      results.push({ userId, email: profile.email, ok: true });
    }

    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    if (succeeded.length > 0) {
      await adminClient.from(DB_TABLES.ADMIN_ACTIVITIES).insert({
        type: 'role_changed',
        description: `Changement de rôle en masse : ${succeeded.length} utilisateur(s) -> ${role}`,
        metadata: {
          admin_id: auth.userId,
          new_role: role,
          user_ids: succeeded.map((r) => r.userId),
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
    console.error('Error in bulk role update:', error);
    return NextResponse.json(
      { success: false, request_id: requestId, error: { code: 'INTERNAL_ERROR', message: error.message || 'An internal error occurred' } },
      { status: 500 }
    );
  }
}
