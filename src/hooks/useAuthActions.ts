// ============================================
// useAuth Hook - Enhanced Authentication Hook
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { login, register, loginWithOtp } from '@/services/auth.service';
import { useToast } from '@/hooks/use-toast';
import type { UserRole } from '@/types';

export const useAuthActions = () => {
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const signIn = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await login(email, password);

      if (response.success) {
        toast({
          title: "Connexion réussie",
          description: "Bienvenue sur Oyaboung !",
        });
        await refreshUser();

        return { success: true };
      } else {
        toast({
          title: "Erreur de connexion",
          description: response.error?.message || "Une erreur est survenue",
          variant: "destructive",
        });
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('Exception dans signIn:', error);
      toast({
        title: "Erreur de connexion",
        description: "Une erreur inattendue est survenue",
        variant: "destructive",
      });
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser, toast]);

  const signUp = useCallback(async (
    email: string,
    password: string,
    options: {
      fullName?: string;
      phone?: string;
      role?: UserRole;
      businessName?: string;
    } = {}
  ) => {
    setIsLoading(true);
    try {
      const response = await register(email, password, options);

      if (response.success) {
        toast({
          title: "Inscription réussie",
          description: "Vérifiez votre email pour confirmer votre compte",
        });
        return { success: true };
      } else {
        toast({
          title: "Erreur d'inscription",
          description: response.error?.message || "Une erreur est survenue",
          variant: "destructive",
        });
        return { success: false, error: response.error };
      }
    } catch (error) {
      toast({
        title: "Erreur d'inscription",
        description: "Une erreur inattendue est survenue",
        variant: "destructive",
      });
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const signInWithOTP = useCallback(async (identifier: string, type: 'email' | 'phone' = 'email') => {
    setIsLoading(true);
    try {
      const response = await loginWithOtp(identifier, type);

      if (response.success) {
        toast({
          title: "Code envoyé",
          description: `Un code de vérification a été envoyé à votre ${type}`,
        });
        return { success: true };
      } else {
        toast({
          title: "Erreur d'envoi",
          description: response.error?.message || "Une erreur est survenue",
          variant: "destructive",
        });
        return { success: false, error: response.error };
      }
    } catch (error) {
      toast({
        title: "Erreur d'envoi",
        description: "Une erreur inattendue est survenue",
        variant: "destructive",
      });
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return {
    signIn,
    signUp,
    signInWithOTP,
    isLoading,
  };
};
