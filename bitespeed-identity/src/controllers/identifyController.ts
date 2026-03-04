import { Request, Response, NextFunction } from 'express';
import { identifyContact, IdentifyRequest } from '../services/identityService';
import { AppError } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';

export const identify = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, phoneNumber } = req.body as IdentifyRequest;

    // Validation
    if (!email && !phoneNumber) {
      throw new AppError(
        'At least one of "email" or "phoneNumber" must be provided.',
        400
      );
    }

    if (email !== undefined && email !== null && typeof email !== 'string') {
      throw new AppError('"email" must be a string.', 400);
    }

    if (
      phoneNumber !== undefined &&
      phoneNumber !== null &&
      typeof phoneNumber !== 'string'
    ) {
      throw new AppError('"phoneNumber" must be a string.', 400);
    }

    // Sanitise
    const sanitised: IdentifyRequest = {
      email: email ? email.trim().toLowerCase() : null,
      phoneNumber: phoneNumber ? phoneNumber.trim() : null,
    };

    const result = await identifyContact(sanitised);
    sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
};
