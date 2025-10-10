import "dotenv/config";
import express from "express";
import { StatusCodes } from "http-status-codes";
import cookieParser from "cookie-parser";
import db from "./db/index";
import AuthRoute from "./route/auth.r";
import { errorHandlerMiddleware } from "./middleware/errorHandling.m";

const app = express();
const PORT = process.env.PORT || 3001;

// MIDDLEWARE
app.use(express.json());
app.use(cookieParser());

// HEALTH CHECK
app.get("/api/v1/auth/health", (req, res) => {
  res.status(StatusCodes.OK).send({
    status: "OK",
    timestamp: new Date(),
    service: "auth-service",
    message: `Service is up and running on port ${PORT}`,
  });
});

// ROUTING
app.use("/api/v1/auth", AuthRoute);

// ERROR HANDLING MIDDLEWARE
app.use(errorHandlerMiddleware);

// START THE SERVER
const startServer = async () => {
  try {
    // Check database connection here if needed
    await db.execute("SELECT 1"); // or use your database's connection method (e.g. authenticate())
    console.log("Database connected successfully");

    app.listen(PORT, () => {
      console.log(`Auth service is running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/v1/auth/health`);
    });
  } catch (error) {
    console.error("Failed to connect to Drizzle MySQL database:", error);
    console.error("Error starting the server:", error);
    process.exit(1); // Exit the process with a failure code
  }
};

startServer();
