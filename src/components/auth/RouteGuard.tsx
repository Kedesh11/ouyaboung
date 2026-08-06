"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles: Array<"user" | "merchant" | "admin" | "farmer">;
    redirectTo?: string;
}

export function ProtectedRoute({ children, allowedRoles, redirectTo = "/auth" }: ProtectedRouteProps) {
    const { isAuthenticated, userRole, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (!isAuthenticated) {
                router.push(redirectTo);
            } else if (userRole && !allowedRoles.includes(userRole)) {
                router.push("/");
            }
        }
    }, [isAuthenticated, userRole, loading, router, allowedRoles, redirectTo]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isAuthenticated || !userRole || !allowedRoles.includes(userRole)) {
        return null;
    }

    return <>{children}</>;
}

// Specific role guards
export function UserRoute({ children }: { children: React.ReactNode }) {
    return <ProtectedRoute allowedRoles={["user"]}>{children}</ProtectedRoute>;
}

export function MerchantRoute({ children }: { children: React.ReactNode }) {
    return <ProtectedRoute allowedRoles={["merchant"]} redirectTo="/auth?role=merchant">{children}</ProtectedRoute>;
}

export function FarmerRoute({ children }: { children: React.ReactNode }) {
    return <ProtectedRoute allowedRoles={["farmer"]} redirectTo="/auth?role=farmer">{children}</ProtectedRoute>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
    return <ProtectedRoute allowedRoles={["admin"]}>{children}</ProtectedRoute>;
}
