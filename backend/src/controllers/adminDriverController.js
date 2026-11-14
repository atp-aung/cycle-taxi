import { unbanDriver, banDriver } from "../services/driverBanService.js";

import {
  reassignDriverTaxiGate,
  getAdminDrivers,
  getAdminDriverDetails,
  updateAdminDriver,
} from "../services/adminDriverService.js";

import { sendSuccess } from "../utils/apiResponse.js";
import ApiError from "../utils/ApiError.js";

// Admin unbans a Driver
export const unbanDriverController = async (req, res, next) => {
  try {
    const driverId = Number(req.params.driverId);
    const adminId = req.user.userId;

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
    next(error);
  }
};

// Admin temporarily bans a Driver
export const temporaryBanDriverController = async (req, res, next) => {
  try {
    const driverId = Number(req.params.driverId);
    const adminId = req.user.userId;

    const { banExpiresAt, reason = null } = req.body ?? {};

    if (
      typeof banExpiresAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?\+06:30$/.test(
        banExpiresAt,
      ) ||
      !Number.isFinite(new Date(banExpiresAt).getTime())
    ) {
      throw new ApiError(
        400,
        "Ban expiry must be a valid Myanmar local date and time with +06:30 timezone.",
      );
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
    next(error);
  }
};

// Admin permanently bans a Driver
export const permanentBanDriverController = async (req, res, next) => {
  try {
    const driverId = Number(req.params.driverId);
    const adminId = req.user.userId;

    const { reason = null } = req.body ?? {};

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

// Admin retrieves Driver list

export const getAdminDriversController = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      registrationStatus,
      availabilityStatus,
      banType,
    } = req.query;

    const result = await getAdminDrivers({
      page: Number(page),
      limit: Number(limit),
      search,
      registrationStatus,
      availabilityStatus,
      banType,
    });

    return sendSuccess(res, {
      message: "Drivers retrieved successfully.",
      data: result.drivers,
      meta: {
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminDriverDetailsController = async (req, res, next) => {
  try {
    const driverId = Number(req.params.driverId);

    const driver = await getAdminDriverDetails(driverId);

    return sendSuccess(res, {
      message: "Driver details retrieved successfully.",
      data: driver,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminDriverController = async (req, res, next) => {
  try {
    const driverId = Number(req.params.driverId);

    const { fullName, phoneNumber } = req.body ?? {};

    const result = await updateAdminDriver({
      driverId,
      fullName,
      phoneNumber,
    });

    return sendSuccess(res, {
      message: "Driver updated successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
