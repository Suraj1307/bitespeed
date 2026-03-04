import { Response } from 'express';

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200): void => {
  res.status(statusCode).json(data);
};

export const sendError = (res: Response, message: string, statusCode = 500): void => {
  res.status(statusCode).json({ error: message });
};
