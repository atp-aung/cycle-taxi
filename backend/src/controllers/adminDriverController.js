import { unbanDriver } from "../services/driverBanService.js";
import { sendSuccess } from "../utils/apiResponse.js";

// Admin unbans a Driver
export const unbanDriverController = async (req, res, next) => {
  try {
    const driverId = Number(req.params.driverId);
    const adminId = req.user.id;

    // Validate Driver ID
    if (!Number.isSafeInteger(driverId) || driverId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid Driver ID.",
        data: null,
      });
    }

    // Call Unban Service
    await unbanDriver({
      driverId,
      adminId,
    });

    return sendSuccess(res, "Driver has been unbanned successfully.", {
      driverId,
      banType: "none",
      availabilityStatus: "offline",
    });
  } catch (error) {
    if (error.message === "Driver not found.") {
      return res.status(404).json({
        success: false,
        message: error.message,
        data: null,
      });
    }

    if (
      error.message === "Driver is not currently banned." ||
      error.message === "Active ban history record not found."
    ) {
      return res.status(409).json({
        success: false,
        message: error.message,
        data: null,
      });
    }

    next(error);
  }
};
