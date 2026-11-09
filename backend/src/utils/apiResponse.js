export const sendSuccess = (
  res,
  {
    statusCode = 200,
    message = "Request successful",
    data = null,
    meta = undefined,
  } = {},
) => {
  const response = {
    success: true,
    message,
    data,
  };

  if (meta !== undefined) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

export const sendError = (
  res,
  {
    statusCode = 500,
    message = "Internal server error",
    errors = undefined,
  } = {},
) => {
  const response = {
    success: false,
    message,
  };

  if (errors !== undefined) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};
