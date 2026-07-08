export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_activities: {
        Row: {
          created_at: string | null
          description: string
          id: string
          metadata: Json | null
          type: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          metadata?: Json | null
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          metadata?: Json | null
          type?: string
        }
        Relationships: []
      }
      admin_payout_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          disbursement_id: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          msisdn: string
          normalized_msisdn: string
          operator: string
          provider: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          disbursement_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          msisdn: string
          normalized_msisdn: string
          operator: string
          provider?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          disbursement_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          msisdn?: string
          normalized_msisdn?: string
          operator?: string
          provider?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_payout_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "admin_payout_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_payout_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_payout_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_payout_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "admin_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      auth_audit_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_data: Json | null
          event_type: string
          id: string
          ip_address: unknown
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          status: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "auth_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "auth_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "auth_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "auth_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      auth_mfa_factors: {
        Row: {
          backup_codes: string[] | null
          created_at: string | null
          email: string | null
          factor_type: string
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          last_used_at: string | null
          phone_number: string | null
          secret: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          backup_codes?: string[] | null
          created_at?: string | null
          email?: string | null
          factor_type: string
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_used_at?: string | null
          phone_number?: string | null
          secret?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          backup_codes?: string[] | null
          created_at?: string | null
          email?: string | null
          factor_type?: string
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_used_at?: string | null
          phone_number?: string | null
          secret?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "auth_mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "auth_mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "auth_mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "auth_mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      auth_sessions: {
        Row: {
          created_at: string | null
          device_info: Json | null
          expires_at: string
          id: string
          ip_address: unknown
          is_active: boolean | null
          last_activity: string | null
          token_hash: string
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_info?: Json | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          last_activity?: string | null
          token_hash: string
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_info?: Json | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          last_activity?: string | null
          token_hash?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "auth_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "auth_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "auth_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "auth_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          status: string
          subject: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          status?: string
          subject: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          status?: string
          subject?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "contact_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contact_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contact_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contact_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      failed_login_attempts: {
        Row: {
          attempt_count: number | null
          created_at: string | null
          email: string
          id: string
          ip_address: unknown
          locked_until: string | null
          updated_at: string | null
        }
        Insert: {
          attempt_count?: number | null
          created_at?: string | null
          email: string
          id?: string
          ip_address: unknown
          locked_until?: string | null
          updated_at?: string | null
        }
        Update: {
          attempt_count?: number | null
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: unknown
          locked_until?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          merchant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          merchant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          merchant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "favorites_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      food_items: {
        Row: {
          badges: string[] | null
          category: string
          contents: Json | null
          created_at: string
          description: string | null
          discount_percentage: number
          discounted_price: number
          expiry_date: string | null
          id: string
          image_url: string | null
          images: string[] | null
          is_available: boolean
          merchant_id: string
          name: string
          original_price: number
          pickup_end: string
          pickup_start: string
          quantity_available: number
          quantity_initial: number
          slug: string
          updated_at: string
        }
        Insert: {
          badges?: string[] | null
          category: string
          contents?: Json | null
          created_at?: string
          description?: string | null
          discount_percentage: number
          discounted_price: number
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_available?: boolean
          merchant_id: string
          name: string
          original_price: number
          pickup_end: string
          pickup_start: string
          quantity_available: number
          quantity_initial: number
          slug: string
          updated_at?: string
        }
        Update: {
          badges?: string[] | null
          category?: string
          contents?: Json | null
          created_at?: string
          description?: string | null
          discount_percentage?: number
          discounted_price?: number
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_available?: boolean
          merchant_id?: string
          name?: string
          original_price?: number
          pickup_end?: string
          pickup_start?: string
          quantity_available?: number
          quantity_initial?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "food_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_logs: {
        Row: {
          co2_avoided_kg: number | null
          created_at: string
          food_item_id: string | null
          food_saved_kg: number | null
          id: string
          merchant_id: string | null
          money_saved_xaf: number | null
          order_id: string | null
          revenue_xaf: number | null
          user_id: string | null
        }
        Insert: {
          co2_avoided_kg?: number | null
          created_at?: string
          food_item_id?: string | null
          food_saved_kg?: number | null
          id?: string
          merchant_id?: string | null
          money_saved_xaf?: number | null
          order_id?: string | null
          revenue_xaf?: number | null
          user_id?: string | null
        }
        Update: {
          co2_avoided_kg?: number | null
          created_at?: string
          food_item_id?: string | null
          food_saved_kg?: number | null
          id?: string
          merchant_id?: string | null
          money_saved_xaf?: number | null
          order_id?: string | null
          revenue_xaf?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impact_logs_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_logs_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "impact_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "impact_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "impact_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      impact_reports: {
        Row: {
          created_at: string
          end_date: string
          generated_by: string | null
          id: string
          merchant_id: string | null
          report: Json
          start_date: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          end_date: string
          generated_by?: string | null
          id?: string
          merchant_id?: string | null
          report: Json
          start_date: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string
          generated_by?: string | null
          id?: string
          merchant_id?: string | null
          report?: Json
          start_date?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impact_reports_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "impact_reports_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "impact_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      merchant_payout_accounts: {
        Row: {
          created_at: string
          disbursement_id: string | null
          id: string
          is_active: boolean
          is_default: boolean
          label: string
          merchant_id: string
          msisdn: string
          normalized_msisdn: string
          operator: string
          provider: string
          rejection_reason: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          disbursement_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label: string
          merchant_id: string
          msisdn: string
          normalized_msisdn: string
          operator: string
          provider?: string
          rejection_reason?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          disbursement_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string
          merchant_id?: string
          msisdn?: string
          normalized_msisdn?: string
          operator?: string
          provider?: string
          rejection_reason?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_payout_accounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "merchant_payout_accounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "merchant_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merchant_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merchant_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merchant_payout_accounts_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      merchants: {
        Row: {
          address: string
          business_name: string
          business_type: string
          city: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          email: string
          id: string
          is_active: boolean
          is_refused: boolean | null
          is_verified: boolean
          latitude: number | null
          location: unknown
          logo_url: string | null
          longitude: number | null
          opening_hours: Json | null
          phone: string
          quartier: string
          rating: number
          refusal_reason: string | null
          refused_at: string | null
          slug: string
          total_reviews: number
          updated_at: string
          user_id: string | null
          validated_at: string | null
        }
        Insert: {
          address: string
          business_name: string
          business_type: string
          city: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          email: string
          id?: string
          is_active?: boolean
          is_refused?: boolean | null
          is_verified?: boolean
          latitude?: number | null
          location?: unknown
          logo_url?: string | null
          longitude?: number | null
          opening_hours?: Json | null
          phone: string
          quartier: string
          rating?: number
          refusal_reason?: string | null
          refused_at?: string | null
          slug: string
          total_reviews?: number
          updated_at?: string
          user_id?: string | null
          validated_at?: string | null
        }
        Update: {
          address?: string
          business_name?: string
          business_type?: string
          city?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          is_active?: boolean
          is_refused?: boolean | null
          is_verified?: boolean
          latitude?: number | null
          location?: unknown
          logo_url?: string | null
          longitude?: number | null
          opening_hours?: Json | null
          phone?: string
          quartier?: string
          rating?: number
          refusal_reason?: string | null
          refused_at?: string | null
          slug?: string
          total_reviews?: number
          updated_at?: string
          user_id?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "merchants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merchants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merchants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "merchants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      monthly_aggregates: {
        Row: {
          co2_avoided_kg: number
          created_at: string
          id: string
          meals: number
          month: number
          updated_at: string
          user_id: string | null
          year: number
        }
        Insert: {
          co2_avoided_kg?: number
          created_at?: string
          id?: string
          meals?: number
          month: number
          updated_at?: string
          user_id?: string | null
          year: number
        }
        Update: {
          co2_avoided_kg?: number
          created_at?: string
          id?: string
          meals?: number
          month?: number
          updated_at?: string
          user_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_aggregates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "monthly_aggregates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_aggregates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_aggregates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_aggregates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          consumed_at: string | null
          consumed_by: string | null
          created_at: string
          food_item_id: string
          id: string
          merchant_id: string
          original_total: number
          picked_up_at: string | null
          pickup_code: string
          pickup_code_normalized: string | null
          pickup_time: string | null
          quantity: number
          rating: number | null
          review: string | null
          savings: number
          status: string
          total_price: number
          tracking_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          food_item_id: string
          id?: string
          merchant_id: string
          original_total: number
          picked_up_at?: string | null
          pickup_code: string
          pickup_code_normalized?: string | null
          pickup_time?: string | null
          quantity: number
          rating?: number | null
          review?: string | null
          savings: number
          status: string
          total_price: number
          tracking_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          food_item_id?: string
          id?: string
          merchant_id?: string
          original_total?: number
          picked_up_at?: string | null
          pickup_code?: string
          pickup_code_normalized?: string | null
          pickup_time?: string | null
          quantity?: number
          rating?: number | null
          review?: string | null
          savings?: number
          status?: string
          total_price?: number
          tracking_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      password_reset_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          is_used: boolean | null
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean | null
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean | null
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payment_settlements: {
        Row: {
          admin_payout_account_id: string | null
          created_at: string
          currency: string
          disbursement_id: string | null
          fee_amount: number
          gross_amount: number
          id: string
          merchant_id: string | null
          merchant_payout_account_id: string | null
          net_amount: number
          order_id: string
          paid_at: string | null
          payment_transaction_id: string
          provider_transfer_reference: string | null
          provider_transfer_status: string | null
          raw_transfer_request: Json | null
          raw_transfer_response: Json | null
          recipient_type: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_payout_account_id?: string | null
          created_at?: string
          currency?: string
          disbursement_id?: string | null
          fee_amount?: number
          gross_amount: number
          id?: string
          merchant_id?: string | null
          merchant_payout_account_id?: string | null
          net_amount: number
          order_id: string
          paid_at?: string | null
          payment_transaction_id: string
          provider_transfer_reference?: string | null
          provider_transfer_status?: string | null
          raw_transfer_request?: Json | null
          raw_transfer_response?: Json | null
          recipient_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_payout_account_id?: string | null
          created_at?: string
          currency?: string
          disbursement_id?: string | null
          fee_amount?: number
          gross_amount?: number
          id?: string
          merchant_id?: string | null
          merchant_payout_account_id?: string | null
          net_amount?: number
          order_id?: string
          paid_at?: string | null
          payment_transaction_id?: string
          provider_transfer_reference?: string | null
          provider_transfer_status?: string | null
          raw_transfer_request?: Json | null
          raw_transfer_response?: Json | null
          recipient_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlements_admin_payout_account_id_fkey"
            columns: ["admin_payout_account_id"]
            isOneToOne: false
            referencedRelation: "admin_payout_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "payment_settlements_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_merchant_payout_account_id_fkey"
            columns: ["merchant_payout_account_id"]
            isOneToOne: false
            referencedRelation: "merchant_payout_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payment_settlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          currency: string
          food_item_id: string | null
          id: string
          internal_reference: string
          legacy_transaction_id: string | null
          merchant_id: string
          operator: string
          order_id: string
          platform_wallet_id: string
          provider: string
          provider_result: string | null
          provider_status: string | null
          provider_transaction_id: string | null
          raw_callback: Json | null
          raw_request: Json | null
          raw_response: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          food_item_id?: string | null
          id?: string
          internal_reference: string
          legacy_transaction_id?: string | null
          merchant_id: string
          operator: string
          order_id: string
          platform_wallet_id: string
          provider?: string
          provider_result?: string | null
          provider_status?: string | null
          provider_transaction_id?: string | null
          raw_callback?: Json | null
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          food_item_id?: string | null
          id?: string
          internal_reference?: string
          legacy_transaction_id?: string | null
          merchant_id?: string
          operator?: string
          order_id?: string
          platform_wallet_id?: string
          provider?: string
          provider_result?: string | null
          provider_status?: string | null
          provider_transaction_id?: string | null
          raw_callback?: Json | null
          raw_request?: Json | null
          raw_response?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "payment_transactions_legacy_transaction_id_fkey"
            columns: ["legacy_transaction_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "payment_transactions_legacy_transaction_id_fkey"
            columns: ["legacy_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "payment_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payment_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_platform_wallet_id_fkey"
            columns: ["platform_wallet_id"]
            isOneToOne: false
            referencedRelation: "platform_payment_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      platform_payment_wallets: {
        Row: {
          airtel_merchant_code_encrypted: string | null
          airtel_merchant_number: string | null
          callback_url: string | null
          client_id: string | null
          client_secret_encrypted: string | null
          created_at: string
          id: string
          is_active: boolean
          moov_merchant_number: string | null
          provider: string
          provider_metadata: Json
          updated_at: string
          wallet_id: string
        }
        Insert: {
          airtel_merchant_code_encrypted?: string | null
          airtel_merchant_number?: string | null
          callback_url?: string | null
          client_id?: string | null
          client_secret_encrypted?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          moov_merchant_number?: string | null
          provider?: string
          provider_metadata?: Json
          updated_at?: string
          wallet_id: string
        }
        Update: {
          airtel_merchant_code_encrypted?: string | null
          airtel_merchant_number?: string | null
          callback_url?: string | null
          client_id?: string | null
          client_secret_encrypted?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          moov_merchant_number?: string | null
          provider?: string
          provider_metadata?: Json
          updated_at?: string
          wallet_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pricing_history: {
        Row: {
          created_at: string
          discount_percentage: number
          discounted_price: number
          food_item_id: string
          id: string
          original_price: number
          recommendation: Json | null
        }
        Insert: {
          created_at?: string
          discount_percentage: number
          discounted_price: number
          food_item_id: string
          id?: string
          original_price: number
          recommendation?: Json | null
        }
        Update: {
          created_at?: string
          discount_percentage?: number
          discounted_price?: number
          food_item_id?: string
          id?: string
          original_price?: number
          recommendation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_history_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_history_food_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["product_id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          email: string
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          preferences: Json | null
          quartier: string | null
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          preferences?: Json | null
          quartier?: string | null
          role: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          preferences?: Json | null
          quartier?: string | null
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          merchant_id: string
          order_id: string | null
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          order_id?: string | null
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          order_id?: string | null
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "reviews_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_code: string
          agent: string
          airtel_fees: number
          amount: number
          amount_credited: number | null
          app_fees: number
          charge_owner: string | null
          completed_at: string | null
          created_at: string
          customer_id: string | null
          fees: number | null
          id: string
          merchant_id: string
          merchant_operation_account_code: string | null
          merchant_reference_id: string | null
          message: string | null
          operator: string | null
          operator_fees: number | null
          operator_owner_charge: string | null
          order_id: string
          payment_transaction_id: string | null
          phone: string
          product: string
          provider: string | null
          provider_result: string | null
          provider_status: string | null
          pvit_fees: number
          q_gabon_response: Json | null
          reference: string | null
          settlement_status: string | null
          status: string
          status_code: string | null
          total_amount: number
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_code: string
          agent: string
          airtel_fees: number
          amount: number
          amount_credited?: number | null
          app_fees: number
          charge_owner?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          fees?: number | null
          id?: string
          merchant_id: string
          merchant_operation_account_code?: string | null
          merchant_reference_id?: string | null
          message?: string | null
          operator?: string | null
          operator_fees?: number | null
          operator_owner_charge?: string | null
          order_id: string
          payment_transaction_id?: string | null
          phone: string
          product?: string
          provider?: string | null
          provider_result?: string | null
          provider_status?: string | null
          pvit_fees: number
          q_gabon_response?: Json | null
          reference?: string | null
          settlement_status?: string | null
          status?: string
          status_code?: string | null
          total_amount: number
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_code?: string
          agent?: string
          airtel_fees?: number
          amount?: number
          amount_credited?: number | null
          app_fees?: number
          charge_owner?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          fees?: number | null
          id?: string
          merchant_id?: string
          merchant_operation_account_code?: string | null
          merchant_reference_id?: string | null
          message?: string | null
          operator?: string | null
          operator_fees?: number | null
          operator_owner_charge?: string | null
          order_id?: string
          payment_transaction_id?: string | null
          phone?: string
          product?: string
          provider?: string | null
          provider_result?: string | null
          provider_status?: string | null
          pvit_fees?: number
          q_gabon_response?: Json | null
          reference?: string | null
          settlement_status?: string | null
          status?: string
          status_code?: string | null
          total_amount?: number
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_events: {
        Row: {
          created_at: string
          device_type: string | null
          event_type: string
          id: string
          metadata: Json
          referrer: string | null
          route: string
          session_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          event_type: string
          id?: string
          metadata?: Json
          referrer?: string | null
          route: string
          session_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          referrer?: string | null
          route?: string
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_intelligence_scores: {
        Row: {
          churn_risk_score: number | null
          dynamic_segment: string | null
          engagement_score: number | null
          intent_score: number | null
          price_sensitivity_score: number | null
          source: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          churn_risk_score?: number | null
          dynamic_segment?: string | null
          engagement_score?: number | null
          intent_score?: number | null
          price_sensitivity_score?: number | null
          source?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          churn_risk_score?: number | null
          dynamic_segment?: string | null
          engagement_score?: number | null
          intent_score?: number | null
          price_sensitivity_score?: number | null
          source?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_intelligence_scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "user_intelligence_scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_intelligence_scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_intelligence_scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_intelligence_scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_intelligence_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "user_intelligence_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_intelligence_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_intelligence_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_intelligence_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          headers: Json | null
          id: string
          ip_address: string | null
          payload: Json
          processed: boolean | null
          provider: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          headers?: Json | null
          id?: string
          ip_address?: string | null
          payload: Json
          processed?: boolean | null
          provider: string
        }
        Update: {
          created_at?: string
          error?: string | null
          headers?: Json | null
          id?: string
          ip_address?: string | null
          payload?: Json
          processed?: boolean | null
          provider?: string
        }
        Relationships: []
      }
    }
    Views: {
      merchant_impact_summary: {
        Row: {
          co2_avoided_kg: number | null
          food_saved_kg: number | null
          merchant_id: string | null
          orders_count: number | null
          revenue_xaf: number | null
        }
        Relationships: [
          {
            foreignKeyName: "impact_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "impact_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_transactions: {
        Row: {
          airtel_fees: number | null
          app_fees: number | null
          base_amount: number | null
          business_type: string | null
          consumed_at: string | null
          consumed_by: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          disbursement_id: string | null
          discounted_price: number | null
          merchant_id: string | null
          merchant_name: string | null
          merchant_reference_id: string | null
          merchant_revenue: number | null
          message: string | null
          operator: string | null
          operator_fees: number | null
          operator_owner_charge: string | null
          order_id: string | null
          order_quantity: number | null
          order_status: string | null
          original_price: number | null
          payment_phone_number: string | null
          payment_status: string | null
          pickup_code: string | null
          platform_commission: number | null
          product_category: string | null
          product_id: string | null
          product_name: string | null
          provider: string | null
          provider_reference: string | null
          provider_result: string | null
          provider_status: string | null
          provider_transaction_id: string | null
          provider_transfer_reference: string | null
          provider_transfer_status: string | null
          pvit_fees: number | null
          q_gabon_fees: number | null
          q_gabon_reference: string | null
          q_gabon_transaction_id: string | null
          settlement_status: string | null
          status_code: string | null
          total_amount: number | null
          transaction_date: string | null
          transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mv_product_performance_base: {
        Row: {
          last_event_at: string | null
          product_id: string | null
          total_add_to_carts: number | null
          total_dwell_ms: number | null
          total_purchases: number | null
          total_views: number | null
        }
        Relationships: []
      }
      mv_user_behavior_summary: {
        Row: {
          last_active_at: string | null
          price_sort_clicks: number | null
          total_add_to_carts: number | null
          total_dwell_time_s: number | null
          total_page_views: number | null
          total_purchases: number | null
          total_sessions: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      mv_user_intelligence_base: {
        Row: {
          first_seen_at: string | null
          last_active_at: string | null
          total_add_to_carts: number | null
          total_checkout_intents: number | null
          total_page_views: number | null
          total_price_hesitations: number | null
          total_product_dwell_ms: number | null
          total_product_views: number | null
          total_purchases: number | null
          total_search_events: number | null
          total_sessions: number | null
          total_time_on_page_ms: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      product_performance: {
        Row: {
          avg_view_time_ms: number | null
          conversion_rate: number | null
          conversion_rate_per_view_time: number | null
          last_event_at: string | null
          product_id: string | null
          total_add_to_carts: number | null
          total_dwell_ms: number | null
          total_purchases: number | null
          total_views: number | null
        }
        Relationships: []
      }
      user_impact_summary: {
        Row: {
          co2_avoided_kg: number | null
          food_saved_kg: number | null
          money_saved_xaf: number | null
          orders_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_transactions"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_segments"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_intelligence_scoring"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_segments"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_scoring: {
        Row: {
          churn_risk_score: number | null
          engagement_score: number | null
          first_seen_at: string | null
          intent_score: number | null
          last_active_at: string | null
          price_sensitivity_score: number | null
          total_add_to_carts: number | null
          total_checkout_intents: number | null
          total_page_views: number | null
          total_price_hesitations: number | null
          total_product_dwell_ms: number | null
          total_product_views: number | null
          total_purchases: number | null
          total_search_events: number | null
          total_sessions: number | null
          total_time_on_page_ms: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_segments: {
        Row: {
          churn_risk_score: number | null
          dynamic_segment: string | null
          engagement_score: number | null
          first_seen_at: string | null
          intent_score: number | null
          last_active_at: string | null
          price_sensitivity_score: number | null
          total_add_to_carts: number | null
          total_checkout_intents: number | null
          total_page_views: number | null
          total_price_hesitations: number | null
          total_product_dwell_ms: number | null
          total_product_views: number | null
          total_purchases: number | null
          total_search_events: number | null
          total_sessions: number | null
          total_time_on_page_ms: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_user_intelligence_scoring: {
        Row: {
          churn_risk_score: number | null
          engagement_score: number | null
          intent_score: number | null
          price_sensitivity_score: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_user_segments: {
        Row: {
          churn_risk_score: number | null
          dynamic_segment: string | null
          engagement_score: number | null
          intent_score: number | null
          price_sensitivity_score: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_order_savings: {
        Args: { p_original_total: number; p_total_price: number }
        Returns: number
      }
      calculate_recency_score: { Args: { last_date: string }; Returns: number }
      cancel_user_order: {
        Args: { p_cancellation_reason?: string; p_order_id: string }
        Returns: Json
      }
      check_password_strength: { Args: { password: string }; Returns: Json }
      cleanup_expired_auth_data: { Args: never; Returns: undefined }
      create_order_atomic: {
        Args: { p_food_item_id: string; p_quantity?: number }
        Returns: Json
      }
      current_user_is_admin: { Args: never; Returns: boolean }
      generate_pickup_code: { Args: never; Returns: string }
      generate_slug: { Args: { t: string }; Returns: string }
      get_admin_clients: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          city: string
          created_at: string
          email: string
          full_name: string
          orders_count: number
          phone: string
          profile_id: string
          quartier: string
          role: string
          total_spent: number
          user_id: string
        }[]
      }
      get_admin_contacts: {
        Args: never
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      get_admin_dashboard_kpis: {
        Args: never
        Returns: {
          active_merchants: number
          active_products: number
          pending_merchants: number
          refused_merchants: number
          total_clients: number
          total_merchants: number
          total_revenue: number
          total_sales: number
        }[]
      }
      get_admin_geo_distribution: {
        Args: never
        Returns: {
          city: string
          merchant_count: number
        }[]
      }
      get_admin_sales_stats: {
        Args: { p_days?: number }
        Returns: {
          day_date: string
          orders_count: number
          revenue: number
        }[]
      }
      get_admin_top_merchants: {
        Args: { p_limit?: number }
        Returns: {
          business_name: string
          id: string
          orders_count: number
          products_count: number
          rating: number
          revenue: number
        }[]
      }
      get_admin_traffic_daily: {
        Args: { p_window_days?: number }
        Returns: {
          authenticated_visitors: number
          page_views: number
          period_date: string
          pwa_installs: number
          sessions: number
          visitors: number
        }[]
      }
      get_admin_traffic_summary: {
        Args: never
        Returns: {
          pwa_installs_30d: number
          recurring_visitors_7d: number
          total_pwa_installs: number
          unique_visitors_30d: number
        }[]
      }
      get_my_intelligence: {
        Args: never
        Returns: {
          churn_risk_score: number
          dynamic_segment: string
          engagement_score: number
          intent_score: number
          price_sensitivity_score: number
        }[]
      }
      get_user_role: { Args: { user_uuid: string }; Returns: string }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { user_uuid: string }; Returns: boolean }
      is_admin_email: { Args: { p_email: string }; Returns: boolean }
      is_merchant: { Args: { user_uuid: string }; Returns: boolean }
      is_rate_limited: {
        Args: { p_email: string; p_ip_address: unknown }
        Returns: boolean
      }
      log_auth_event: {
        Args: {
          p_error_message?: string
          p_event_data?: Json
          p_event_type: string
          p_status?: string
          p_user_id: string
        }
        Returns: string
      }
      nearby_available_merchants: {
        Args: { p_latitude: number; p_longitude: number; p_radius_km?: number }
        Returns: {
          available_items_count: number
          distance_km: number
          merchant_id: string
          total_quantity: number
        }[]
      }
      record_failed_login: {
        Args: { p_email: string; p_ip_address: unknown }
        Returns: undefined
      }
      refresh_intelligence_materialized_views: {
        Args: never
        Returns: undefined
      }
      reset_failed_login_attempts: {
        Args: { p_email: string; p_ip_address: unknown }
        Returns: undefined
      }
      revoke_all_sessions: { Args: { p_user_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

