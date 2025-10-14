export const config = {
  MONGO_USER: process.env.MONGO_USER,
  MONGO_PASSWORD: process.env.MONGO_PASSWORD,
  MONGO_IP: process.env.MONGO_IP || "user-db",
  MONGO_PORT: process.env.MONGO_PORT || 27017,
  REDIS_URL: process.env.REDIS_URL || "user-cache",
  REDIS_PORT: process.env.REDIS_PORT || 6379,
};
