import prisma from "../config/database.js";
import { TransferService } from "./transfer.service.js";

export class PayrollService {
  /** Creates a payroll batch and initiates all transfers */
  static async createPayroll(businessId: string, label: string, items: { phone: string, amount: bigint }[]) {
    const totalAmount = items.reduce((sum, item) => sum + item.amount, BigUint64Array.from([0n])[0]); // handling bigints

    const payroll = await prisma.payroll.create({
      data: {
        businessId,
        label,
        totalAmountMicroSbtc: totalAmount,
        recipientCount: items.length,
        status: "PROCESSING"
      }
    });

    // Process each transfer
    for (const item of items) {
       await TransferService.prepareSend(businessId, item.phone, item.amount);
       // In a real app, this would be more granular and handle failures
    }

    return payroll;
  }
}
