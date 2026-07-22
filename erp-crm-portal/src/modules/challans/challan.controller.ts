import { Request, Response } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { sendCreated, sendPaginated, sendSuccess } from '../../common/api-response';
import { requireUser } from '../../middleware/auth.middleware';
import { generateChallanInvoicePdf } from '../../services/pdf.service';
import { findMovementsByReference } from '../inventory/inventory.repository';
import * as challanService from './challan.service';
import {
  CreateChallanInput,
  InvoiceQuery,
  ListChallansQuery,
  UpdateChallanStatusInput,
} from './challan.validation';

/** POST /challans */
export const createChallanController = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const challan = await challanService.createChallan(req.validated.body as CreateChallanInput, user);
  sendCreated(
    res,
    challan,
    challan.status === 'CONFIRMED'
      ? `Challan ${challan.challanNumber} created and confirmed. Inventory has been reduced.`
      : `Challan ${challan.challanNumber} saved as draft. Inventory is unchanged until it is confirmed.`,
  );
});

/** GET /challans */
export const listChallansController = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await challanService.listChallans(req.validated.query as ListChallansQuery);
  sendPaginated(res, items, meta, 'Challans fetched successfully');
});

/** GET /challans/:id */
export const getChallanController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validated.params as { id: string };
  const challan = await challanService.getChallanById(id);
  const stockMovements = await findMovementsByReference(id);
  sendSuccess(res, {
    data: { ...challan, stockMovements },
    message: 'Challan details fetched successfully',
  });
});

/** PATCH /challans/:id/status */
export const updateChallanStatusController = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { id } = req.validated.params as { id: string };
  const challan = await challanService.updateChallanStatus(
    id,
    req.validated.body as UpdateChallanStatusInput,
    user,
  );

  const messages: Record<string, string> = {
    CONFIRMED: `Challan ${challan.challanNumber} confirmed. Inventory has been reduced and stock movements were logged.`,
    CANCELLED: `Challan ${challan.challanNumber} cancelled.`,
  };

  sendSuccess(res, { data: challan, message: messages[challan.status] ?? 'Challan status updated successfully' });
});

/** GET /challans/:id/invoice - exports the challan as a PDF invoice. */
export const exportInvoiceController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validated.params as { id: string };
  const { download } = req.validated.query as InvoiceQuery;

  const challan = await challanService.getChallanById(id);
  const pdfBuffer = await generateChallanInvoicePdf(challan);

  const fileName = `invoice-${challan.challanNumber}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', pdfBuffer.length);
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${fileName}"`,
  );
  res.status(200).send(pdfBuffer);
});
