import "dotenv/config";
import express from "express";
import { StatusCodes } from "http-status-codes";
import { logger } from "./utils/logger";
import db from "./db";
import { errorHandlerMiddleware } from "./middleware/errorHandling.m";
import PaymentRoutes from "./routes/payment.r";
import RedisService from "./redis/client";
import { redisEventConsumer } from "./consumer/redisConsumer";

const app = express();
const PORT = process.env.PORT || 3007;

app.use(express.json());

app.get("/api/v1/payments/health", (req, res) => {
  res.status(StatusCodes.OK).send({
    status: "OK",
    timestamp: new Date(),
    service: "payment-service",
    message: `Service is up and running on port ${PORT}`,
  });
});

app.use("/api/v1/payments", PaymentRoutes);

// ERROR HANDLING MIDDLEWARE
app.use(errorHandlerMiddleware);

const redisService = RedisService.getInstance();

const startServer = async () => {
  try {
    await db.execute("SELECT 1");
    logger.info("✅ Payment Service Database connected");

    redisService
      .connect()
      .then(() => {
        logger.info("✅ User Service Redis connected");
      })
      .catch((error) => {
        logger.error("❌ Notification Service Redis connection failed:", error);
      });

    await redisEventConsumer.start();
    logger.info("Redis event consumer started");

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1); // Exit the process with a failure code
  }
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await redisEventConsumer.stop();

  const redis = RedisService.getInstance();
  await redis.disconnect();

  process.exit(0);
});

startServer();
