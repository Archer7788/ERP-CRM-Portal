import PDFDocument from 'pdfkit';
import { env } from '../config/env';
import { Challan } from '../modules/challans/challan.types';

const CURRENCY = 'INR';

const formatMoney = (value: number): string =>
  `${CURRENCY} ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value: Date | string): string =>
  new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Renders a challan/invoice as a PDF and resolves with the complete buffer.
 * All printed values come from the snapshot stored on the challan, so a historic
 * invoice never changes when the underlying product or customer is later edited.
 */
export const generateChallanInvoicePdf = (challan: Challan): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Invoice ${challan.challanNumber}`,
        Author: env.COMPANY_NAME,
        Subject: `Sales challan invoice for ${challan.customer?.businessName ?? 'customer'}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    // ---------- Header -----------------------------------------------------
    doc.fontSize(18).font('Helvetica-Bold').text(env.COMPANY_NAME, left, 40);
    doc.fontSize(9).font('Helvetica').fillColor('#444444');
    if (env.COMPANY_ADDRESS) doc.text(env.COMPANY_ADDRESS, { width: pageWidth * 0.6 });
    const contactLine = [env.COMPANY_PHONE, env.COMPANY_EMAIL].filter(Boolean).join('  |  ');
    if (contactLine) doc.text(contactLine);
    if (env.COMPANY_GSTIN) doc.text(`GSTIN: ${env.COMPANY_GSTIN}`);

    doc.fillColor('#000000').fontSize(20).font('Helvetica-Bold')
      .text('TAX INVOICE / DELIVERY CHALLAN', left, 40, { width: pageWidth, align: 'right' });
    doc.fontSize(10).font('Helvetica')
      .text(`Challan No: ${challan.challanNumber}`, { width: pageWidth, align: 'right' })
      .text(`Status: ${challan.status}`, { width: pageWidth, align: 'right' })
      .text(`Created Date: ${formatDate(challan.createdAt)}`, { width: pageWidth, align: 'right' });
    if (challan.createdByName) {
      doc.text(`Created By: ${challan.createdByName}`, { width: pageWidth, align: 'right' });
    }

    doc.moveDown(1.5);
    let cursorY = Math.max(doc.y, 140);
    doc.moveTo(left, cursorY).lineTo(left + pageWidth, cursorY).strokeColor('#cccccc').stroke();
    cursorY += 15;

    // ---------- Draft / Cancelled banner -----------------------------------
    if (challan.status !== 'CONFIRMED') {
      doc.save();
      doc.fontSize(9).font('Helvetica-Bold').fillColor(challan.status === 'CANCELLED' ? '#b00020' : '#b06f00');
      doc.text(
        challan.status === 'CANCELLED'
          ? 'THIS CHALLAN HAS BEEN CANCELLED. STOCK WAS RETURNED TO INVENTORY.'
          : 'DRAFT COPY - NOT A VALID DISPATCH DOCUMENT. STOCK HAS NOT BEEN DEDUCTED.',
        left,
        cursorY,
        { width: pageWidth, align: 'center' },
      );
      doc.restore();
      cursorY = doc.y + 12;
    }

    // ---------- Bill To (from the customer snapshot) -----------------------
    const customer = challan.customer;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000').text('BILL TO', left, cursorY);
    doc.fontSize(10).font('Helvetica');
    doc.text(customer?.businessName ?? '-', left, doc.y + 2, { width: pageWidth * 0.55 });
    doc.font('Helvetica').fillColor('#444444');
    doc.text(`Contact: ${customer?.customerName ?? '-'}`, { width: pageWidth * 0.55 });
    doc.text(`Mobile: ${customer?.mobileNumber ?? '-'}`, { width: pageWidth * 0.55 });
    doc.text(`Email: ${customer?.email ?? '-'}`, { width: pageWidth * 0.55 });
    doc.text(`Address: ${customer?.address ?? '-'}`, { width: pageWidth * 0.55 });
    doc.text(`Customer Type: ${customer?.customerType ?? '-'}`, { width: pageWidth * 0.55 });
    doc.text(`GST Number: ${customer?.gstNumber ?? 'Not provided'}`, { width: pageWidth * 0.55 });

    cursorY = doc.y + 20;

    // ---------- Item table -------------------------------------------------
    const columns = [
      { label: '#', x: left, width: 22, align: 'left' as const },
      { label: 'Product', x: left + 24, width: 138, align: 'left' as const },
      { label: 'SKU', x: left + 164, width: 78, align: 'left' as const },
      { label: 'Category', x: left + 244, width: 72, align: 'left' as const },
      { label: 'Warehouse', x: left + 318, width: 78, align: 'left' as const },
      { label: 'Qty', x: left + 398, width: 34, align: 'right' as const },
      { label: 'Unit Price', x: left + 434, width: 62, align: 'right' as const },
      { label: 'Line Total', x: left + 498, width: 72, align: 'right' as const },
    ];

    const drawTableHeader = (y: number) => {
      doc.rect(left, y - 4, pageWidth, 20).fillColor('#f0f0f0').fill();
      doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold');
      columns.forEach((column) => {
        doc.text(column.label, column.x, y, { width: column.width, align: column.align });
      });
      return y + 18;
    };

    cursorY = drawTableHeader(cursorY);
    doc.font('Helvetica').fontSize(8.5).fillColor('#000000');

    challan.items.forEach((item, index) => {
      if (cursorY > doc.page.height - 130) {
        doc.addPage();
        cursorY = drawTableHeader(60);
        doc.font('Helvetica').fontSize(8.5);
      }

      const values = [
        String(index + 1),
        item.productName,
        item.sku,
        item.category,
        item.warehouseLocation,
        String(item.quantity),
        formatMoney(item.unitPrice),
        formatMoney(item.lineTotal),
      ];

      const rowHeight = Math.max(
        ...columns.map((column, columnIndex) =>
          doc.heightOfString(values[columnIndex], { width: column.width }),
        ),
        12,
      );

      columns.forEach((column, columnIndex) => {
        doc.text(values[columnIndex], column.x, cursorY, { width: column.width, align: column.align });
      });

      cursorY += rowHeight + 6;
      doc.moveTo(left, cursorY - 3).lineTo(left + pageWidth, cursorY - 3).strokeColor('#eeeeee').stroke();
    });

    // ---------- Totals -----------------------------------------------------
    cursorY += 10;
    if (cursorY > doc.page.height - 130) {
      doc.addPage();
      cursorY = 60;
    }

    const totalsX = left + pageWidth - 240;
    doc.fontSize(10).font('Helvetica');
    doc.text('Total Line Items:', totalsX, cursorY, { width: 140, align: 'right' });
    doc.text(String(challan.totalItems), totalsX + 145, cursorY, { width: 95, align: 'right' });
    cursorY += 16;
    doc.font('Helvetica-Bold');
    doc.text('Total Quantity:', totalsX, cursorY, { width: 140, align: 'right' });
    doc.text(String(challan.totalQuantity), totalsX + 145, cursorY, { width: 95, align: 'right' });
    cursorY += 16;
    doc.text('Total Amount:', totalsX, cursorY, { width: 140, align: 'right' });
    doc.text(formatMoney(challan.totalAmount), totalsX + 145, cursorY, { width: 95, align: 'right' });
    cursorY += 26;

    // ---------- Notes and footer ------------------------------------------
    if (challan.notes) {
      doc.font('Helvetica-Bold').fontSize(9).text('Notes:', left, cursorY);
      doc.font('Helvetica').fontSize(9).fillColor('#444444')
        .text(challan.notes, left, doc.y + 2, { width: pageWidth * 0.65 });
      cursorY = doc.y + 10;
    }

    if (challan.status === 'CANCELLED' && challan.cancellationReason) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#b00020').text('Cancellation Reason:', left, cursorY);
      doc.font('Helvetica').fontSize(9).text(challan.cancellationReason, left, doc.y + 2, { width: pageWidth * 0.65 });
      cursorY = doc.y + 10;
    }

    const footerY = doc.page.height - 90;
    doc.fontSize(8).fillColor('#666666').font('Helvetica')
      .text(
        'This is a computer generated document from the ERP + CRM Operations Portal and does not require a physical signature.',
        left,
        footerY,
        { width: pageWidth, align: 'center' },
      );
    doc.text(`Generated on ${formatDate(new Date())}`, left, footerY + 12, { width: pageWidth, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
      .text('Authorised Signatory', left + pageWidth - 160, footerY - 30, { width: 160, align: 'right' });

    doc.end();
  });
