import { unbanDriver, banDriver } from "../services/driverBanService.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { reassignDriverTaxiGate } from "../services/adminDriverService.js";

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

// Admin temporarily bans a Driver
export const temporaryBanDriverController = async (req, res, next) => {
  try {
    const driverId = Number(req.params.driverId);
    const adminId = req.user.id;

    const { banExpiresAt, reason = null } = req.body ?? {};

    if (!Number.isSafeInteger(driverId) || driverId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid Driver ID.",
        data: null,
      });
    }

    if (
      typeof banExpiresAt !== "string" ||
      !banExpiresAt.trim() ||
      !Number.isFinite(new Date(banExpiresAt).getTime()) ||
      new Date(banExpiresAt).getTime() <= Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid future ban expiry date is required.",
        data: null,
      });
    }

    await banDriver({
      driverId,
      banType: "temporary",
      banExpiresAt,
      reason,
      adminId,
    });

    return sendSuccess(
      res,
      "Driver has been temporarily banned successfully.",
      {
        driverId,
        banType: "temporary",
        banExpiresAt,
        availabilityStatus: "offline",
      },
    );
  } catch (error) {
    if (error.message === "Driver not found.") {
      return res.status(404).json({
        success: false,
        message: error.message,
        data: null,
      });
    }

    next(error);
  }
};

// Admin permanently bans a Driver
export const permanentBanDriverController = async (req, res, next) => {
  try {
    const driverId = Number(req.params.driverId);
    const adminId = req.user.id;

    const { reason = null } = req.body ?? {};

    if (!Number.isSafeInteger(driverId) || driverId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid Driver ID.",
        data: null,
      });
    }

    await banDriver({
      driverId,
      banType: "permanent",
      banExpiresAt: null,
      reason,
      adminId,
    });

    return sendSuccess(
      res,
      "Driver has been permanently banned successfully.",
      {
        driverId,
        banType: "permanent",
        banExpiresAt: null,
        availabilityStatus: "offline",
      },
    );
  } catch (error) {
    if (error.message === "Driver not found.") {
      return res.status(404).json({
        success: false,
        message: error.message,
        data: null,
      });
    }

    next(error);
  }
};

// Admin reassigns a Driver to another Taxi Gate
export const reassignDriverTaxiGateController = async (req, res, next) => {
  try {
    const driverId = Number(req.params.driverId);
    const { newTaxiGateId } = req.body ?? {};
    const adminId = req.user.userId;

    const result = await reassignDriverTaxiGate({
      driverId,
      newTaxiGateId: Number(newTaxiGateId),
      adminId,
    });

    return sendSuccess(res, "Driver has been reassigned successfully.", result);
  } catch (error) {
    next(error);
  }
};
