import { Request, Response } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { sendCreated, sendPaginated, sendSuccess } from '../../common/api-response';
import { requireUser } from '../../middleware/auth.middleware';
import * as customerService from './customer.service';
import {
  CreateCustomerInput,
  CreateFollowUpInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customer.validation';

/** GET /customers */
export const listCustomersController = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await customerService.listCustomers(req.validated.query as ListCustomersQuery);
  sendPaginated(res, items, meta, 'Customers fetched successfully');
});

/** POST /customers */
export const createCustomerController = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const customer = await customerService.createCustomer(req.validated.body as CreateCustomerInput, user);
  sendCreated(res, customer, 'Customer created successfully');
});

/** PUT /customers/:id */
export const updateCustomerController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validated.params as { id: string };
  const customer = await customerService.updateCustomer(id, req.validated.body as UpdateCustomerInput);
  sendSuccess(res, { data: customer, message: 'Customer updated successfully' });
});

/** GET /customers/:id */
export const getCustomerController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validated.params as { id: string };
  const customer = await customerService.getCustomerById(id);
  sendSuccess(res, { data: customer, message: 'Customer details fetched successfully' });
});

/** POST /customers/:id/follow-ups */
export const addFollowUpController = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { id } = req.validated.params as { id: string };
  const result = await customerService.addFollowUpNote(id, req.validated.body as CreateFollowUpInput, user);
  sendCreated(res, result, 'Follow-up note added successfully');
});

/** GET /customers/:id/follow-ups */
export const listFollowUpsController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validated.params as { id: string };
  const followUps = await customerService.listFollowUps(id);
  sendSuccess(res, { data: followUps, message: 'Follow-up notes fetched successfully' });
});
