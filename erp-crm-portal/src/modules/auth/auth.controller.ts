import { Request, Response } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { sendCreated, sendSuccess } from '../../common/api-response';
import { requireUser } from '../../middleware/auth.middleware';
import * as authService from './auth.service';
import { ChangePasswordInput, LoginInput, RegisterUserInput } from './auth.validation';

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.validated.body as LoginInput);
  sendSuccess(res, { data: result, message: 'Login successful' });
});

export const registerController = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.registerUser(req.validated.body as RegisterUserInput);
  sendCreated(res, user, 'User account created successfully');
});

export const profileController = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const profile = await authService.getProfile(user.id);
  sendSuccess(res, { data: profile, message: 'Profile fetched successfully' });
});

export const changePasswordController = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await authService.changePassword(user, req.validated.body as ChangePasswordInput);
  sendSuccess(res, { data: null, message: 'Password updated successfully' });
});

export const listUsersController = asyncHandler(async (_req: Request, res: Response) => {
  const users = await authService.listUsers();
  sendSuccess(res, { data: users, message: 'Users fetched successfully' });
});
