import "dotenv/config";
import express from "express";
import { StatusCodes } from "http-status-codes";
import UserRoutes from "./route/user.r";
import { connectDB } from "./db/connect";
import { config } from "./utils/config";
import ErrorHandlerMiddleware from "./middleware/errorHandling.m";
import { redisClient } from "./db/redis";

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

app.get("/api/v1/users/health", (req, res) => {
  res.status(StatusCodes.OK).send({
    status: "OK",
    timestamp: new Date(),
    service: "user-service",
    message: `Service is up and running on port ${PORT}`,
  });
});

app.use("/api/v1/users", UserRoutes);

// ERROR HANDLING MIDDLEWARE
app.use(ErrorHandlerMiddleware);

const startServer = async () => {
  try {
    await connectDB(
      `mongodb://${config.MONGO_USER}:${config.MONGO_PASSWORD}@${config.MONGO_IP}:${config.MONGO_PORT}/?authSource=admin`
    );

    await redisClient
      .on("error", (err) => console.log("Redis Client Error", err))
      .connect();
    console.log("Redis connected successfully");

    app.listen(PORT, () => {
      console.log(`User service is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error starting the server:", error);
    process.exit(1); // Exit the process with a failure code
  }
};

startServer();
