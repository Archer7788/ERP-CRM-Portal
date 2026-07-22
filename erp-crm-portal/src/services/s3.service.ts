import path from 'path';
import { randomUUID } from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ObjectCannedACL,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { ApiError } from '../common/api-error';
import { logger } from '../common/logger';

let cachedClient: S3Client | null = null;

export const isS3Configured = (): boolean => Boolean(env.AWS_S3_BUCKET && env.AWS_REGION);

/**
 * Lazily creates the S3 client.
 * When AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are omitted, the SDK falls back to
 * the default credential provider chain (EC2 instance profile, ECS task role, or
 * an IRSA role on EKS), which is the recommended way to run this on AWS.
 */
export const getS3Client = (): S3Client => {
  if (!isS3Configured()) {
    throw ApiError.serviceUnavailable(
      'AWS S3 is not configured on this server. Set AWS_S3_BUCKET and AWS_REGION in the environment to enable image uploads.',
      'S3_NOT_CONFIGURED',
    );
  }
  if (cachedClient) return cachedClient;

  cachedClient = new S3Client({
    region: env.AWS_REGION,
    ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
  return cachedClient;
};

const buildPublicUrl = (key: string): string => {
  if (env.AWS_S3_PUBLIC_BASE_URL) {
    return `${env.AWS_S3_PUBLIC_BASE_URL.replace(/\/+$/, '')}/${key}`;
  }
  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
};

export interface UploadedObject {
  key: string;
  url: string;
  bucket: string;
  contentType: string;
  sizeInBytes: number;
}

/** Uploads a product image buffer to S3 and returns its key and URL. */
export const uploadProductImage = async (
  file: Express.Multer.File,
  productId: string,
): Promise<UploadedObject> => {
  const client = getS3Client();
  const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
  const key = `products/${productId}/${Date.now()}-${randomUUID()}${extension}`;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET as string,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: { productId, originalName: encodeURIComponent(file.originalname || 'image') },
        // Public-read is only applied when the bucket is intentionally public.
        ...(env.AWS_S3_PRIVATE_OBJECTS ? {} : { ACL: 'public-read' as ObjectCannedACL }),
      }),
    );
  } catch (error) {
    logger.error('Failed to upload product image to S3', error);
    throw ApiError.serviceUnavailable(
      'The image could not be uploaded to AWS S3. Please verify the bucket name, region and IAM permissions.',
      'S3_UPLOAD_FAILED',
      { key },
    );
  }

  const url = env.AWS_S3_PRIVATE_OBJECTS ? await getProductImageSignedUrl(key) : buildPublicUrl(key);

  return {
    key,
    url,
    bucket: env.AWS_S3_BUCKET as string,
    contentType: file.mimetype,
    sizeInBytes: file.size,
  };
};

/** Returns a time-limited signed URL, used when the bucket keeps objects private. */
export const getProductImageSignedUrl = async (key: string): Promise<string> => {
  const client = getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET as string, Key: key }),
    { expiresIn: env.AWS_S3_SIGNED_URL_EXPIRY_SECONDS },
  );
};

/** Removes an object, e.g. when a product image is replaced. */
export const deleteObject = async (key: string): Promise<void> => {
  const client = getS3Client();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: env.AWS_S3_BUCKET as string, Key: key }));
  } catch (error) {
    logger.warn(`Failed to delete S3 object "${key}"`, error);
  }
};
