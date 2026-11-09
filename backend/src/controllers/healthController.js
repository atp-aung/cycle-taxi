import { testDatabaseConnection } from "../config/database.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const getHealth = async (req, res, next) => {
  try {
    await testDatabaseConnection();

    return sendSuccess(res, {
      statusCode: 200,
      message: "Application is running.",
      data: {
        server: "OK",
        database: "Connected",
      },
    });
  } catch (error) {
    next(error);
  }
};
