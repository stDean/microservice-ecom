import "dotenv/config";
import express from "express";
import { StatusCodes } from "http-status-codes";
import { redisEventConsumer } from "./consumer/redisConsumer";
import { connectDB } from "./db/connect";
import ErrorHandlerMiddleware from "./middleware/errorHandling.m";
import RedisService from "./redis/client";
import ShippingRoutes from "./route/shipping.r";
import { config } from "./utils/config";
import { logger } from "./utils/logger";
import { DeliveryJob } from "./job/deliveryJob";
import { ShippingService } from "./services/ShippingService";

const app = express();
const PORT = process.env.PORT || 3008;

app.use(express.json());

app.get("/api/v1/shipping/health", (req, res) => {
  res.status(StatusCodes.OK).send({
    status: "OK",
    timestamp: new Date(),
    service: "shipping-service",
    message: `Service is up and running on port ${PORT}`,
  });
});

app.use("/api/v1/shipping", ShippingRoutes);

// ERROR HANDLING MIDDLEWARE
app.use(ErrorHandlerMiddleware); 

const redisService = RedisService.getInstance();
const shippingService = new ShippingService();
const deliveryJob = new DeliveryJob(shippingService);

const startServer = async () => {
  try {
    await connectDB(
      `mongodb://${config.MONGO_USER}:${config.MONGO_PASSWORD}@${config.MONGO_IP}:${config.MONGO_PORT}/?authSource=admin`
    );
    logger.info("✅ Shipping Service Database connected");

    redisService
      .connect()
      .then(() => {
        logger.info("✅ Shipping Service Redis connected");
      })
      .catch((error) => {
        logger.error("❌ Shipping Service Redis connection failed:", error);
      });

    await redisEventConsumer.start();
    logger.info("Redis event consumer started");

    deliveryJob.start();
    logger.info("Delivery job started");

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
