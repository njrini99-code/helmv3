/**
 * Device-token mutation result — shared between server actions and the
 * native push-registration client (no app-layer imports from lib).
 */
export type DeviceTokenResult =
  | { success: true }
  | {
      success: false;
      error: string;
      code?: 'UNAUTHORIZED_RETRYABLE';
      retryable?: boolean;
    };
