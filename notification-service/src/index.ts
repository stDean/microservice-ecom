import "dotenv/config";
import express from "express";
import { StatusCodes } from "http-status-codes";
import NotificationRouter from "./routes/notification.r";
import { emailConsumer } from "./consumers/emailConsumer";
import { rabbitMQService } from "./config/rabbitmq";
import { redisEventConsumer } from "./consumers/redisEventConsumer";

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

app.get("/api/v1/notification/health", (req, res) => {
  res.status(StatusCodes.OK).send({
    status: "OK",
    timestamp: new Date(),
    service: "notification-service",
    message: `Service is up and running on port ${PORT}`,
  });
});

app.use("/api/v1/notification", NotificationRouter);

const startServer = async () => {
  try {
    const server = app.listen(PORT, () => {
      console.log(`Notification service running on port ${PORT}`);
      console.log(
        `Health check: http://localhost:${PORT}/api/v1/notification/health`
      );
    });

    // Start RabbitMQ consumer (processes email queues)
    console.log("Starting RabbitMQ email consumer...");
    await emailConsumer.start();

    // Start Redis event consumer (listens for auth events)
    console.log("Starting Redis event consumer...");
    await redisEventConsumer.start();

    console.log("All consumers started successfully");

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, starting graceful shutdown...`);

      // Stop accepting new requests
      server.close(() => {
        console.log("HTTP server closed.");
      });

      // Close RabbitMQ connections
      await emailConsumer.stop();
      await rabbitMQService.close();

      console.log("Graceful shutdown completed.");
      process.exit(0);
    };

    // Handle different shutdown signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("Error starting the server:", error);
    process.exit(1); // Exit the process with a failure code
  }
};

startServer();
