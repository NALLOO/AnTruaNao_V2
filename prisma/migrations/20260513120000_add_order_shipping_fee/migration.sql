-- Thêm cột shippingFee (an toàn nếu đã có từ db push cũ)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shippingFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
