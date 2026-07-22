import multer from 'multer';
import { env } from '../config/env';
import { ApiError } from '../common/api-error';

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Files are buffered in memory and streamed straight to S3, so no disk
 * writes happen on the application server (important for ECS/Fargate/Lambda).
 */
const storage = multer.memoryStorage();

export const productImageUpload = multer({
  storage,
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      callback(
        ApiError.unprocessable(
          `Unsupported file type "${file.mimetype}". Allowed types: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}.`,
          'UNSUPPORTED_FILE_TYPE',
        ),
      );
      return;
    }
    callback(null, true);
  },
}).single('image');
