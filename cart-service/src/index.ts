import "dotenv/config";
import express from "express";
import { StatusCodes } from "http-status-codes";
import { logger } from "./utils/logger";
import RedisService from "./redis/client";
import { redisEventConsumer } from "./consumer/redisConsumer";
import { redisErrorHandlerMiddleware } from "./middleware/errorHandler.m";
import CartRoutes from "./routes/cart.r";

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());

app.get("/api/v1/cart/health", (req, res) => {
  res.status(StatusCodes.OK).send({
    status: "OK",
    timestamp: new Date(),
    service: "cart-service",
    message: `Service is up and running on port ${PORT}`,
  });
});

app.use("/api/v1/carts", CartRoutes);

app.use(redisErrorHandlerMiddleware);

const redisService = RedisService.getInstance();

const startServer = async () => {
  try {
    redisService
      .connect()
      .then(() => {
        logger.info("✅ Cart Redis connected");
      })
      .catch((error) => {
        logger.error("❌ Cart Redis connection failed:", error);
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

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await redisEventConsumer.stop();

  const redis = RedisService.getInstance();
  await redis.disconnect();

  process.exit(0);
});

startServer();
