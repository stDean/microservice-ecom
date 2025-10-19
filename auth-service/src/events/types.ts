// auth-service/src/events/types.ts
export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

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

export interface UserDeletedEvent extends BaseEvent {
  type: "USER_DELETED";
  data: { userId: string; email: string };
}

export type AuthEvent =
  | UserRegisteredEvent
  | PasswordResetEvent
  | UserLoggedInEvent;

export type UserEvent = UserDeletedEvent;
