import { db } from "./db";
import type { CreditTxType } from "@prisma/client";

/** Get the current internal-credit balance for a user (sum of all tx amounts). */
export async function getBalance(userId: string): Promise<number> {
  const agg = await db.creditTx.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** Record a credit transaction atomically and return the new balance. */
export async function recordTx(params: {
  userId: string;
  type: CreditTxType;
  amount: number; // positive = credit added; negative = spent/removed
  reason?: string;
  taskId?: string;
  carouselId?: string;
}): Promise<{ balanceAfter: number; txId: string }> {
  return await db.$transaction(async (tx) => {
    const current = await tx.creditTx.aggregate({
      where: { userId: params.userId },
      _sum: { amount: true },
    });
    const balanceAfter = (current._sum.amount ?? 0) + params.amount;

    const created = await tx.creditTx.create({
      data: {
        userId: params.userId,
        type: params.type,
        amount: params.amount,
        balanceAfter,
        reason: params.reason ?? "",
        taskId: params.taskId,
        carouselId: params.carouselId,
      },
    });
    return { balanceAfter, txId: created.id };
  });
}

/** Check if the user has at least `amount` credits available. */
export async function hasBalance(userId: string, amount: number): Promise<boolean> {
  const balance = await getBalance(userId);
  return balance >= amount;
}
