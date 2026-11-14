import { getDriverProfile } from "../services/driverProfileService.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const getDriverProfileController = async (req, res, next) => {
  try {
    const driver = await getDriverProfile(req.user.userId);

    return sendSuccess(res, "Driver profile retrieved successfully.", driver);
  } catch (error) {
    next(error);
  }
};
