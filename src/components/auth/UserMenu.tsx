"use client";

import React from 'react';
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Settings, LogOut, Store, Shield, Heart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const UserMenu: React.FC = () => {
  const { user, userRole, signOut, isAuthenticated } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  if (!isAuthenticated || !user) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      console.log('Initiating sign out in UserMenu...');

      // Set a safety timeout
      const safetyRedirect = setTimeout(() => {
        console.warn('Navigation hanging, forcing hard redirect...');
        window.location.href = '/';
      }, 2000);

      await signOut();

      clearTimeout(safetyRedirect);

      toast({
        title: "Déconnexion réussie",
        description: "À bientôt sur Oyaboung !",
      });

      // Force navigation to home page
      router.replace('/');
      router.refresh();
    } catch (error) {
      console.error('Logout error in UserMenu:', error);
      // Fallback: Clear local storage and force redirect to /auth
      if (typeof window !== 'undefined') {
        localStorage.clear();
        window.location.href = '/auth';
      }
    }
  };

  const getUserInitials = (email: string, fullName?: string) => {
    if (fullName) {
      return fullName
        .split(' ')
        .map(name => name.charAt(0))
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email.charAt(0).toUpperCase();
  };

  const getRoleIcon = () => {
    switch (userRole) {
      case 'admin':
        return <Shield className="h-4 w-4" />;
      case 'merchant':
        return <Store className="h-4 w-4" />;
      case 'user':
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleLabel = () => {
    switch (userRole) {
      case 'admin':
        return 'Administrateur';
      case 'merchant':
        return 'Commerçant';
      case 'user':
      default:
        return 'Utilisateur';
    }
  };

  const getDashboardPath = () => {
    switch (userRole) {
      case 'admin':
        return '/admin';
      case 'merchant':
        return '/merchant';
      case 'user':
      default:
        return '/user';
    }
  };

  const getProfilePath = () => {
    switch (userRole) {
      case 'admin':
        return '/admin/settings';
      case 'merchant':
        return '/merchant/profile';
      case 'user':
      default:
        return '/user/profile';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.user_metadata?.avatar_url} alt={user.email || ''} />
            <AvatarFallback>
              {getUserInitials(user.email || '', user.user_metadata?.full_name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.user_metadata?.full_name || user.email}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {getRoleIcon()}
              {getRoleLabel()}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={getDashboardPath()} className="cursor-pointer flex w-full items-center">
            <User className="mr-2 h-4 w-4" />
            <span>Tableau de bord</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={getProfilePath()} className="cursor-pointer flex w-full items-center">
            <Settings className="mr-2 h-4 w-4" />
            <span>Profil</span>
          </Link>
        </DropdownMenuItem>
        {userRole === 'user' && (
          <DropdownMenuItem asChild>
            <Link href="/user/favorites" className="cursor-pointer flex w-full items-center">
              <Heart className="mr-2 h-4 w-4" />
              <span>Favoris</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Se déconnecter</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};