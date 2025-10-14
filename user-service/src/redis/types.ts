export interface BaseEvent {
  type: string;
  source: string;
  timestamp: Date;
  version: string;
}

export interface EmailVerified extends BaseEvent {
  type: "EMAIL_VERIFIED";
  data: {
    userId: string;
    email: string;
  };
}

export type UserEvent = EmailVerified;
