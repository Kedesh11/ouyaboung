export const OFFLINE_ACTION_TYPES = {
  CREATE_RESERVATION: 'create_reservation',
  CANCEL_ORDER: 'cancel_order',
} as const;

export type OfflineActionType =
  (typeof OFFLINE_ACTION_TYPES)[keyof typeof OFFLINE_ACTION_TYPES];

export interface CreateReservationOfflinePayload {
  userId: string;
  itemId: string;
  quantity: number;
}

export interface CancelOrderOfflinePayload {
  orderId: string;
  reason?: string;
}

