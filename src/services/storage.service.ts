import { requireSupabaseClient, isSupabaseConfigured } from '@/api/supabaseClient';
import type { ApiResponse } from '@/types';

export interface UploadResult {
  publicUrl: string;
  path: string;
}

export const uploadToBucket = async (
  bucket: string,
  filePath: string,
  file: Blob | File
): Promise<ApiResponse<UploadResult>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { error: uploadError } = await client.storage.from(bucket).upload(filePath, file);

  if (uploadError) {
    return {
      data: null,
      error: { code: uploadError.name || 'UPLOAD_ERROR', message: uploadError.message },
      success: false,
    };
  }

  const { data } = client.storage.from(bucket).getPublicUrl(filePath);

  return {
    data: { publicUrl: data.publicUrl, path: filePath },
    error: null,
    success: true,
  };
};

export const uploadAvatar = async (
  userId: string,
  file: Blob | File,
  extension = 'jpg'
): Promise<ApiResponse<UploadResult>> => {
  const filePath = `${userId}/avatar-${Date.now()}.${extension}`;
  return uploadToBucket('avatars', filePath, file);
};

export const uploadMerchantAsset = async (
  folder: string,
  file: Blob | File
): Promise<ApiResponse<UploadResult>> => {
  const fileExt = file instanceof File ? file.name.split('.').pop() : 'bin';
  const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;
  return uploadToBucket('avatars', filePath, file);
};

export const uploadMerchantDocument = async (
  folder: string,
  file: Blob | File
): Promise<ApiResponse<UploadResult>> => {
  const fileExt = file instanceof File ? file.name.split('.').pop() : 'bin';
  const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;
  return uploadToBucket('merchant-documents', filePath, file);
};
