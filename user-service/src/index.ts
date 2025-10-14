import "dotenv/config";
import express from "express";
import { StatusCodes } from "http-status-codes";
import UserRoutes from "./route/user.r";

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

const startServer = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`User service is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error starting the server:", error);
    process.exit(1); // Exit the process with a failure code
  }
};

startServer();
