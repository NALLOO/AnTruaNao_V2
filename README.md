# 🍜 An Trua Nao - Ứng dụng chia tiền đặt đồ ăn

Ứng dụng full stack React Router v7 để quản lý và chia tiền đặt đồ ăn theo nhóm.

## ✨ Tính năng

- ✅ Thêm các lần đặt đồ ăn với nhiều người tham gia
- ✅ Tự động chia phần giảm giá theo tỷ lệ giá từng món
- ✅ Dashboard xem tổng quát số tiền từng người phải trả theo tuần
- ✅ Quản lý người dùng tự động (tự tạo khi nhập tên mới)
- ✅ Giao diện đẹp với Tailwind CSS

## 🛠️ Công nghệ

- **Frontend & Backend**: React Router v7
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Styling**: Tailwind CSS
- **Containerization**: Docker & Docker Compose

## 📋 Yêu cầu

- Node.js 20+
- Docker & Docker Compose
- npm hoặc yarn

## 🚀 Cài đặt và chạy

### Cách 1: Sử dụng Docker (Khuyến nghị)

1. Clone repository và vào thư mục:
```bash
cd antruanao_app
```

2. Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```

3. Chạy với Docker Compose:
```bash
docker-compose up -d
```

4. Chạy migration database:
```bash
docker-compose exec app npm run db:migrate
```

5. Truy cập ứng dụng tại: `http://localhost:3000`

### Cách 2: Chạy local (không dùng Docker)

1. Cài đặt dependencies:
```bash
npm install
```

2. Tạo file `.env`:
```bash
DATABASE_URL="postgresql://antruanao:antruanao123@localhost:5432/antruanao_db"
```

3. Chạy PostgreSQL (hoặc dùng Docker chỉ cho DB):
```bash
docker-compose up -d postgres
```

4. Chạy Prisma migration:
```bash
npm run db:migrate
```

5. Generate Prisma Client:
```bash
npm run db:generate
```

6. Chạy development server:
```bash
npm run dev
```

## 📁 Cấu trúc dự án

```
app/
├── routes/           # React Router routes
│   ├── _index.tsx    # Dashboard
│   ├── orders.new.tsx # Thêm đơn hàng
│   └── api.users.tsx # API quản lý users
├── lib/              # Utilities
│   ├── db.server.ts  # Prisma client
│   └── order.utils.ts # Logic tính toán chia tiền
└── root.tsx          # Root layout
prisma/
└── schema.prisma     # Database schema
```

## 🗄️ Database Schema

- **User**: Thông tin người dùng
- **Order**: Đơn hàng (tổng tiền, giảm giá, ngày đặt)
- **OrderItem**: Món ăn trong đơn hàng (người đặt, tên món, giá, phần giảm giá)

## 💡 Cách sử dụng

### Thêm đơn hàng mới

1. Vào trang "Thêm đơn hàng"
2. Nhập mô tả đơn hàng
3. Nhập tổng tiền và số tiền giảm giá (nếu có)
4. Thêm các món ăn:
   - Nhập tên người đặt (sẽ tự động tạo user mới nếu chưa có)
   - Nhập tên món
   - Nhập giá món
5. Click "Lưu đơn hàng"

Hệ thống sẽ tự động:
- Chia phần giảm giá theo tỷ lệ giá từng món
- Tính giá cuối cùng cho từng món sau khi trừ phần giảm giá

### Xem Dashboard

- Dashboard hiển thị tổng quát theo tuần hiện tại
- Xem số tiền từng người phải trả
- Xem chi tiết các đơn hàng trong tuần

## 🔧 Scripts

- `npm run dev` - Chạy development server
- `npm run build` - Build cho production
- `npm run start` - Chạy production server
- `npm run db:migrate` - Chạy database migration
- `npm run db:generate` - Generate Prisma Client
- `npm run db:studio` - Mở Prisma Studio (GUI cho database)

## 🐳 Docker Commands

```bash
# Build và chạy tất cả services
docker-compose up -d

# Xem logs
docker-compose logs -f app

# Dừng services
docker-compose down

# Dừng và xóa volumes (xóa data)
docker-compose down -v

# Rebuild containers
docker-compose up -d --build
```

## 📝 Notes

- Phần giảm giá được chia theo tỷ lệ: `(giá món / tổng tiền) * số tiền giảm giá`
- Giá được làm tròn đến 2 chữ số thập phân
- Dashboard mặc định hiển thị tuần hiện tại (Chủ nhật đến Thứ bảy)

## 🚧 Cải tiến có thể thêm

- [ ] Filter dashboard theo tuần/tháng
- [ ] Export báo cáo Excel/PDF
- [ ] Thống kê chi tiết hơn (biểu đồ, xu hướng)
- [ ] Quản lý nhóm người dùng
- [ ] Thông báo khi có đơn hàng mới
- [ ] Xác thực người dùng (authentication)

---

Built with ❤️ using React Router v7
