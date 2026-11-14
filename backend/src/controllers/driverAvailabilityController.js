import { updateDriverAvailability } from "../services/driverAvailabilityService.js";

import { sendSuccess } from "../utils/apiResponse.js";

export const updateDriverAvailabilityController = async (req, res, next) => {
  try {
    const { availabilityStatus } = req.body ?? {};

    const result = await updateDriverAvailability({
      driverId: req.user.userId,
      availabilityStatus,
    });

    return sendSuccess(
      res,
      "Driver availability updated successfully.",
      result,
    );
  } catch (error) {
    next(error);
  }
};
