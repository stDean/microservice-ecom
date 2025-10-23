import { StatusCodes } from "http-status-codes";
import CustomAPIError from "./custom-api.e";

export default class UnauthenticatedError extends CustomAPIError {
  constructor(message: string) {
    super(message, StatusCodes.UNAUTHORIZED);
  }
}
