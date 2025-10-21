import "dotenv/config";
import express from "express";
import { StatusCodes } from "http-status-codes";
import { logger } from "./utils/logger";
import ProductRoutes from "./route/product.r";
import CategoryRoutes from "./route/category.r";
import ProductVariantRoutes from "./route/prodVariant.r";
import RedisService from "./redis/client";
import { redisEventConsumer } from "./consumer/redisConsumer";
import { errorHandlerMiddleware } from "./middleware/errorHandling.m";

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

app.get("/api/v1/productCatalog/health", (req, res) => {
  res.status(StatusCodes.OK).send({
    status: "OK",
    timestamp: new Date(),
    service: "product-catalog-service",
    message: `Service is up and running on port ${PORT}`,
  });
});

app.use("/api/v1/productCatalog/products", ProductRoutes);
app.use("/api/v1/productCatalog/categories", CategoryRoutes);
app.use("/api/v1/productCatalog/variants", ProductVariantRoutes);

app.use(errorHandlerMiddleware);

const redisService = RedisService.getInstance();

const startServer = async () => {
  try {
    // connect DB

    redisService
      .connect()
      .then(() => {
        logger.info("✅ Product Catalog Service Redis connected");
      })
      .catch((error) => {
        logger.error(
          "❌ Product Catalog Service Redis connection failed:",
          error
        );
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
