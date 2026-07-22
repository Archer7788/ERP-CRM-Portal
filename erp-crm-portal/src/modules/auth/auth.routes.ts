import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { validate } from '../../middleware/validate.middleware';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { UserRole } from '../../common/enums';
import { changePasswordSchema, loginSchema, registerUserSchema } from './auth.validation';
import {
  changePasswordController,
  listUsersController,
  loginController,
  profileController,
  registerController,
} from './auth.controller';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many login attempts from this IP. Please try again later.',
    error: { code: 'RATE_LIMITED' },
  },
});

/** POST /auth/login - public */
router.post('/login', loginLimiter, validate({ body: loginSchema }), loginController);

/** POST /auth/register - ADMIN only */
router.post(
  '/register',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ body: registerUserSchema }),
  registerController,
);

/** GET /auth/me - any authenticated role */
router.get('/me', authenticate, profileController);

/** POST /auth/change-password - any authenticated role */
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  changePasswordController,
);

/** GET /auth/users - ADMIN only */
router.get('/users', authenticate, authorize(UserRole.ADMIN), listUsersController);

export default router;
