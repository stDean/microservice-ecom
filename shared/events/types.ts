// Base event interface
export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

// Auth events
export interface UserRegisteredEvent extends BaseEvent {
  type: "USER_REGISTERED";
  data: {
    userId: string;
    email: string;
    name: string;
    verificationToken: string;
  };
}

export interface PasswordResetEvent extends BaseEvent {
  type: "PASSWORD_RESET_REQUESTED";
  data: {
    email: string;
    resetToken: string;
    expiresAt: Date;
  };
}

export interface UserLoggedInEvent extends BaseEvent {
  type: "USER_LOGGED_IN";
  data: {
    userId: string;
    ipAddress: string;
    userAgent: string;
  };
}

// Notification events (if other services need to trigger notifications)
export interface NotificationEvent extends BaseEvent {
  type: "NOTIFICATION_SENT";
  data: {
    userId: string;
    type: "EMAIL" | "SMS" | "PUSH";
    status: "SENT" | "FAILED";
  };
}

// Union type for all events
export type AppEvent =
  | UserRegisteredEvent
  | PasswordResetEvent
  | UserLoggedInEvent
  | NotificationEvent;
