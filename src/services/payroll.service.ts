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

    const transfers = [];
    let failures = 0;

    // Process each transfer
    for (const item of items) {
      try {
        const result = await TransferService.prepareSend(businessId, item.phone, item.amount, payroll.id);
        transfers.push({
          phone: item.phone,
          status: "SUCCESS",
          transferId: result.transferId,
          unsignedTx: result.unsignedTx
        });
      } catch (error: any) {
        failures++;
        transfers.push({
          phone: item.phone,
          status: "FAILED",
          error: error.message
        });
      }
    }

    // Determine final status based on failures
    let finalStatus: "PROCESSING" | "PARTIAL" = "PROCESSING";
    if (failures === items.length) {
       // All failed, we'll mark as DRAFT so they can retry, or PARTIAL. Let's just use PARTIAL for simplicity.
       finalStatus = "PARTIAL"; 
    } else if (failures > 0) {
       finalStatus = "PARTIAL";
    }

    // Update payroll status if there were failures
    if (finalStatus !== "PROCESSING") {
      await prisma.payroll.update({
        where: { id: payroll.id },
        data: { status: finalStatus }
      });
    }

    return {
      payrollId: payroll.id,
      label: payroll.label,
      totalAmountMicroSbtc: payroll.totalAmountMicroSbtc.toString(),
      recipientCount: payroll.recipientCount,
      status: finalStatus,
      transfers
    };
  }
}
