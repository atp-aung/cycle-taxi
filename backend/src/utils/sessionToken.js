import { randomBytes, createHash } from "node:crypto";

export const generateSessionToken = () => {
  return randomBytes(32).toString("hex");
};

export const hashSessionToken = (token) => {
  return createHash("sha256").update(token).digest("hex");
};
