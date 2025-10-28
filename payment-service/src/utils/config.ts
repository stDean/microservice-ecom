export const config = {
  POSTGRES_IP: process.env.POSTGRES_IP || "payment-db",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || "example",
  POSTGRES_USER: process.env.POSTGRES_USER || "user",
  POSTGRES_DB: process.env.POSTGRES_DB || "payment_db",
  POSTGRES_PORT: process.env.POSTGRES_PORT || 5432,
};
