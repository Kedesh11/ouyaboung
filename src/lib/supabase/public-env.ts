const sanitizeEnv = (value: string | undefined): string => value?.trim() || "";

export const getSupabasePublicEnv = () => {
  const url = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
};

