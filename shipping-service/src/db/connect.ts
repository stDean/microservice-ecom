import { connect } from "mongoose";

export const connectDB = (uri: string) =>
  connect(uri)
    .then(() => {
      console.log("Database connected successfully");
    })
    .catch((e) => {
      console.log(`Failed to connect to DB`);

      setTimeout(() => {
        console.log("Retrying database connection...");
        connectDB(uri);
      }, 5000);
    });
