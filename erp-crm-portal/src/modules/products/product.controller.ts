import { Request, Response } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { sendCreated, sendPaginated, sendSuccess } from '../../common/api-response';
import { requireUser } from '../../middleware/auth.middleware';
import * as productService from './product.service';
import { CreateProductInput, ListProductsQuery, UpdateProductInput } from './product.validation';

/** GET /products */
export const listProductsController = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await productService.listProducts(req.validated.query as ListProductsQuery);
  sendPaginated(res, items, meta, 'Products fetched successfully');
});

/** POST /products */
export const createProductController = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const product = await productService.createProduct(req.validated.body as CreateProductInput, user);
  sendCreated(res, product, 'Product created successfully');
});

/** PUT /products/:id */
export const updateProductController = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { id } = req.validated.params as { id: string };
  const product = await productService.updateProduct(id, req.validated.body as UpdateProductInput, user);
  sendSuccess(res, { data: product, message: 'Product updated successfully' });
});

/** GET /products/:id */
export const getProductController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validated.params as { id: string };
  const product = await productService.getProductById(id);
  sendSuccess(res, { data: product, message: 'Product details fetched successfully' });
});

/** POST /products/:id/image */
export const uploadProductImageController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validated.params as { id: string };
  const product = await productService.attachProductImage(id, req.file);
  sendSuccess(res, { data: product, message: 'Product image uploaded to AWS S3 successfully' });
});

/** GET /products/meta/facets */
export const productFacetsController = asyncHandler(async (_req: Request, res: Response) => {
  const facets = await productService.getProductFacets();
  sendSuccess(res, { data: facets, message: 'Product facets fetched successfully' });
});
