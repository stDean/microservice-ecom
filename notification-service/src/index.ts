import "dotenv/config";
import express from "express";
import { StatusCodes } from "http-status-codes";
import NotificationRouter from "./routes/notification.r";

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

const startServer = () => {
  try {
    app.listen(PORT, () => {
      console.log(`Notification service running on port ${PORT}`);
      console.log(
        `Health check: http://localhost:${PORT}/api/v1/notification/health`
      );
    });
  } catch (error) {
    console.error("Error starting the server:", error);
    process.exit(1); // Exit the process with a failure code
  }
};

startServer();
