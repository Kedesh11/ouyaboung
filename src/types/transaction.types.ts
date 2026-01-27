// ============================================
// Transaction & QR Code Types
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

export type TransactionStatus =
  | 'reserved'   // RÉSERVÉE - panier/produit bloqué, non payé
  | 'paid'       // PAYÉE - paiement confirmé, QR code généré
  | 'consumed'   // CONSOMMÉE - panier/produit récupéré
  | 'cancelled'  // ANNULÉE - transaction annulée
  | 'expired';   // EXPIRÉE - transaction expirée

export interface Transaction {
  id: string;
  user_id: string;
  merchant_id: string;
  item_id: string;
  item_type: 'product' | 'basket';
  item_name: string;
  quantity: number;
  total_amount: number;
  original_amount: number;
  savings: number;
  // Fees breakdown (9%)
  fees_airtel?: number; // 3%
  fees_pvit?: number;   // 3%
  fees_app?: number;    // 3%
  fees_total?: number;  // Total 9%
  original_base_amount?: number; // Amount before fees
  status: TransactionStatus;
  qr_code?: string;
  qr_code_data?: QRCodeData;
  payment_method?: string;
  payment_reference?: string;
  paid_at?: string;
  consumed_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface QRCodeData {
  transaction_id: string;
  user_id: string;
  item_id: string;
  item_type: 'product' | 'basket';
  merchant_id: string;
  status: TransactionStatus;
  created_at: string;
  expires_at: string;
  is_used: boolean;
  signature: string; // Hash pour validation
}

export interface CreateTransactionInput {
  item_id: string;
  item_type: 'product' | 'basket';
  quantity: number;
}

export interface QRCodeScanResult {
  success: boolean;
  message: string;
  transaction?: Transaction;
  error_code?: QRCodeErrorCode;
}

export type QRCodeErrorCode =
  | 'INVALID_QR'
  | 'QR_TAMPERED'
  | 'TRANSACTION_NOT_FOUND'
  | 'UNAUTHORIZED_USER'
  | 'NOT_PAID'
  | 'ALREADY_CONSUMED'
  | 'EXPIRED'
  | 'SCAN_ERROR';

export interface TransactionAuditLog {
  id: string;
  transaction_id: string;
  user_id: string;
  action: TransactionAction;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export type TransactionAction =
  | 'created'
  | 'reserved'
  | 'payment_initiated'
  | 'payment_completed'
  | 'qr_generated'
  | 'qr_scanned'
  | 'qr_validated'
  | 'qr_rejected'
  | 'consumed'
  | 'cancelled'
  | 'expired';
