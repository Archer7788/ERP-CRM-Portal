import { AuthUser, ValidatedRequestData } from '../common/types';

declare global {
  namespace Express {
    interface Request {
      /** Populated by the `authenticate` middleware. */
      user?: AuthUser;
      /** Populated by `initValidatedRequest` and overwritten by `validate`. */
      validated: ValidatedRequestData;
      /** Populated by multer for multipart/form-data uploads. */
      file?: Express.Multer.File;
      files?: Express.Multer.File[];
    }
  }
}

export {};
