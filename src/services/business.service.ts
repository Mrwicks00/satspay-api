import prisma from "../config/database.js";

export class BusinessService {
  /** Registers a new business account for a user */
  static async registerBusiness(userId: string, businessName: string, rcNumber?: string) {
    const existing = await prisma.businessAccount.findUnique({
      where: { userId }
    });

    if (existing) throw new Error("User already has a business account");

    return prisma.businessAccount.create({
      data: {
        userId,
        businessName,
        rcNumber
      }
    });
  }

  /** Gets business profile */
  static async getProfile(userId: string) {
    return prisma.businessAccount.findUnique({
      where: { userId },
      include: { payrolls: true }
    });
  }
}
