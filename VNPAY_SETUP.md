# Hướng dẫn Setup VNPay

Hướng dẫn chi tiết để tích hợp VNPay vào ứng dụng An Trua Nao.

## 📋 Mục lục

1. [Đăng ký tài khoản VNPay](#1-đăng-ký-tài-khoản-vnpay)
2. [Lấy thông tin Merchant](#2-lấy-thông-tin-merchant)
3. [Cấu hình Environment Variables](#3-cấu-hình-environment-variables)
4. [Cấu hình Webhook](#4-cấu-hình-webhook)
5. [Test với Sandbox](#5-test-với-sandbox)
6. [Deploy Production](#6-deploy-production)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Đăng ký tài khoản VNPay

### Bước 1: Truy cập VNPay
- **Website**: https://www.vnpay.vn/
- Click vào **"Đăng ký"** hoặc **"Đăng nhập"** nếu đã có tài khoản

### Bước 2: Đăng ký Merchant
1. Điền thông tin doanh nghiệp/cá nhân
2. Cung cấp các giấy tờ cần thiết:
   - Giấy phép kinh doanh (nếu là doanh nghiệp)
   - CMND/CCCD (nếu là cá nhân)
   - Giấy ủy quyền (nếu có)
3. Chờ VNPay xét duyệt (thường 3-5 ngày làm việc)

### Bước 3: Kích hoạt tài khoản
- Sau khi được duyệt, bạn sẽ nhận email kích hoạt
- Đăng nhập vào **VNPay Merchant Portal**

---

## 2. Lấy thông tin Merchant

Sau khi đăng nhập vào VNPay Merchant Portal:

### 2.1. Merchant Code (vnp_TmnCode)
1. Vào **"Thông tin tài khoản"** hoặc **"Cấu hình"**
2. Tìm **"Merchant Code"** hoặc **"Mã Merchant"**
3. Copy và lưu lại (ví dụ: `YOUR_MERCHANT_CODE`)

### 2.2. Secret Key (vnp_HashSecret)
1. Vào **"Bảo mật"** hoặc **"API Keys"**
2. Tìm **"Secret Key"** hoặc **"Hash Secret"**
3. Copy và lưu lại (ví dụ: `YOUR_SECRET_KEY`)
4. ⚠️ **Lưu ý**: Secret Key chỉ hiển thị 1 lần, hãy lưu cẩn thận!

### 2.3. Xác định môi trường
- **Sandbox (Test)**: https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
- **Production**: https://www.vnpayment.vn/paymentv2/vpcpay.html

---

## 3. Cấu hình Environment Variables

### 3.1. Tạo file `.env`

Tạo hoặc cập nhật file `.env` trong thư mục gốc của project:

```env
# VNPay Configuration
VNPAY_TMN_CODE=your_merchant_code_here
VNPAY_SECRET_KEY=your_secret_key_here
VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3000/payment/return

# Database (nếu chưa có)
DATABASE_URL=postgresql://antruanao:antruanao123@localhost:5432/antruanao_db
```

### 3.2. Giải thích các biến:

- **VNPAY_TMN_CODE**: Merchant Code từ VNPay Portal
- **VNPAY_SECRET_KEY**: Secret Key để tạo secure hash
- **VNPAY_URL**: 
  - Sandbox: `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`
  - Production: `https://www.vnpayment.vn/paymentv2/vpcpay.html`
- **VNPAY_RETURN_URL**: URL redirect sau khi thanh toán
  - **Mục đích**: VNPay sẽ redirect người dùng về URL này sau khi họ hoàn tất thanh toán (thành công hoặc thất bại)
  - **Khác với Webhook**: 
    - **Return URL**: Người dùng được redirect về (GET request) → Hiển thị kết quả cho người dùng
    - **Webhook**: VNPay gửi thông báo tự động đến server (POST request) → Cập nhật database
  - **Route đã tạo**: `/payment/return` - Hiển thị kết quả thanh toán cho người dùng
  - **Ví dụ**: 
    - Local: `http://localhost:3000/payment/return`
    - Production: `https://yourdomain.com/payment/return`

### 3.3. Cấu hình cho Docker

Nếu sử dụng Docker, cập nhật `docker-compose.yml`:

```yaml
services:
  app:
    environment:
      # ... các biến khác
      VNPAY_TMN_CODE: ${VNPAY_TMN_CODE}
      VNPAY_SECRET_KEY: ${VNPAY_SECRET_KEY}
      VNPAY_URL: ${VNPAY_URL:-https://sandbox.vnpayment.vn/paymentv2/vpcpay.html}
      VNPAY_RETURN_URL: ${VNPAY_RETURN_URL:-http://localhost:4000/payment/return}
```

---

## 4. Cấu hình Webhook

### 4.1. Tạo Webhook URL

Webhook endpoint đã được tạo tại: `/api/vnpay/webhook`

**URL đầy đủ:**
- Local: `http://localhost:3000/api/vnpay/webhook`
- Production: `https://yourdomain.com/api/vnpay/webhook`

### 4.2. Cấu hình trong VNPay Portal

1. Đăng nhập vào **VNPay Merchant Portal**
2. Vào **"Cấu hình"** → **"Webhook"** hoặc **"IPN (Instant Payment Notification)"**
3. Thêm Webhook URL:
   - **URL**: `https://yourdomain.com/api/vnpay/webhook`
   - **Method**: `POST`
   - **Status**: `Active`

### 4.3. Lưu ý về Webhook

- ⚠️ VNPay yêu cầu webhook URL phải là HTTPS (trong production)
- ⚠️ Webhook URL phải accessible từ internet (không thể dùng localhost)
- ⚠️ Có thể cần whitelist IP của VNPay (nếu có firewall)

---

## 5. Test với Sandbox

### 5.1. Sử dụng Sandbox Account

VNPay cung cấp tài khoản sandbox để test:
- **Merchant Code**: Thường có prefix `TEST` hoặc được cung cấp riêng
- **Secret Key**: Key riêng cho sandbox
- **Test Cards**: VNPay cung cấp thẻ test để thanh toán

### 5.2. Test Flow

1. **Start ứng dụng:**
   ```bash
   npm run dev
   # hoặc
   docker-compose up
   ```

2. **Truy cập trang thanh toán:**
   - Vào `/payment`
   - Tìm kiếm user và xem QR code

3. **Test QR Code:**
   - Click vào QR code để mở payment URL
   - Sử dụng thẻ test từ VNPay để thanh toán
   - Kiểm tra webhook có nhận được request không

4. **Kiểm tra Database:**
   - Sau khi thanh toán thành công, kiểm tra bảng `payments`
   - `paid` phải là `true`
   - `paidAt` phải có giá trị

### 5.3. Test Webhook Locally

Để test webhook trên localhost, có thể dùng:
- **ngrok**: `ngrok http 3000` → lấy public URL
- **localtunnel**: `npx localtunnel --port 3000`
- Cấu hình webhook URL trong VNPay = public URL từ ngrok/localtunnel

---

## 6. Deploy Production

### 6.1. Cập nhật Environment Variables

Trong production, cập nhật `.env` hoặc environment variables:

```env
VNPAY_TMN_CODE=your_production_merchant_code
VNPAY_SECRET_KEY=your_production_secret_key
VNPAY_URL=https://www.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://yourdomain.com/payment/return
```

### 6.2. Cấu hình Webhook Production

1. Cập nhật webhook URL trong VNPay Portal:
   - URL: `https://yourdomain.com/api/vnpay/webhook`
   - Đảm bảo SSL certificate hợp lệ

2. Test webhook:
   - VNPay có thể gửi test webhook
   - Kiểm tra logs để đảm bảo webhook hoạt động

### 6.3. Security Checklist

- ✅ Sử dụng HTTPS cho webhook URL
- ✅ Validate secure hash trong webhook handler
- ✅ Không expose secret key trong code
- ✅ Sử dụng environment variables
- ✅ Logging đầy đủ cho debugging
- ✅ Rate limiting cho webhook endpoint (nếu cần)

---

## 7. Troubleshooting

### 7.1. QR Code không hiển thị

**Nguyên nhân:**
- Environment variables chưa được set
- Merchant Code hoặc Secret Key sai
- Payment URL không hợp lệ

**Giải pháp:**
- Kiểm tra console logs
- Verify environment variables
- Test payment URL trực tiếp trong browser

### 7.2. Webhook không nhận được request

**Nguyên nhân:**
- Webhook URL không accessible từ internet
- Firewall block request
- SSL certificate không hợp lệ

**Giải pháp:**
- Sử dụng ngrok/localtunnel để test
- Kiểm tra firewall rules
- Verify SSL certificate

### 7.3. Payment status không được cập nhật

**Nguyên nhân:**
- Webhook parse nội dung chuyển khoản sai
- User hoặc Week không tìm thấy
- Số tiền không khớp

**Giải pháp:**
- Kiểm tra logs trong webhook handler
- Verify format nội dung chuyển khoản
- Kiểm tra database để tìm user/week

### 7.4. Secure Hash không hợp lệ

**Nguyên nhân:**
- Secret Key sai
- Thứ tự params không đúng
- Encoding không đúng

**Giải pháp:**
- Verify Secret Key
- Kiểm tra logic tạo hash trong code
- So sánh với VNPay documentation

---

## 8. Tài liệu tham khảo

- **VNPay Documentation**: https://sandbox.vnpayment.vn/apis/
- **VNPay Merchant Portal**: https://sandbox.vnpayment.vn/merchant/
- **VNPay Support**: support@vnpay.vn

---

## 9. Checklist Setup

- [ ] Đăng ký tài khoản VNPay
- [ ] Lấy Merchant Code
- [ ] Lấy Secret Key
- [ ] Cấu hình environment variables
- [ ] Test với sandbox
- [ ] Cấu hình webhook URL
- [ ] Test webhook với ngrok/localtunnel
- [ ] Deploy production
- [ ] Cập nhật webhook URL production
- [ ] Test end-to-end flow

---

## 10. Lưu ý quan trọng

⚠️ **Bảo mật:**
- Không commit Secret Key vào git
- Sử dụng `.env` và thêm vào `.gitignore`
- Rotate Secret Key định kỳ

⚠️ **Testing:**
- Luôn test kỹ với sandbox trước khi deploy production
- Test các edge cases (số tiền sai, user không tồn tại, etc.)

⚠️ **Monitoring:**
- Monitor webhook logs
- Set up alerts cho failed payments
- Track payment success rate

---

Chúc bạn setup thành công! 🎉

