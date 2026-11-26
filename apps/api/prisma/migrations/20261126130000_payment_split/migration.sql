-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "splitId" UUID;

-- CreateIndex
CREATE INDEX "Payment_splitId_idx" ON "Payment"("splitId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "BillSplit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
