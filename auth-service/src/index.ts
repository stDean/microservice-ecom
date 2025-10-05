import express from "express";
import { StatusCodes } from "http-status-codes";
import db from "./db/index";
import AuthRoute from "./route/auth.r";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(StatusCodes.OK).send({
    status: "OK",
    timestamp: new Date(),
    service: "auth-service",
    message: `Service is up and running on port ${PORT}`,
  });
});

// ROUTING
app.use("/api/v1/auth", AuthRoute);

const startServer = async () => {
  try {
    // Check database connection here if needed
    await db.execute("SELECT 1"); // or use your database's connection method (e.g. authenticate())
    console.log("Database connected successfully");

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to Drizzle MySQL database:", error);
    console.error("Error starting the server:", error);
    process.exit(1); // Exit the process with a failure code
  }
};

startServer();