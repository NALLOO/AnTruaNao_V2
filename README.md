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

2. Tạo file `.env` từ `.env.exammple`:
```bash
cp .env.exammple .env
```

3. Chạy với Docker Compose:
```bash
docker compose up -d --build
```

4. Migration + seed admin gốc:
```bash
docker compose exec app npm run db:migrate:deploy
docker compose exec app npm run db:seed
```

5. Truy cập: `http://localhost:4000/?admin=default` (đăng nhập `admin` / `admin123` nếu seed mặc định)

Thêm admin thứ 2 (local/Docker): xem mục **Deploy production → Thêm admin mới**.

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

4. Chạy Prisma migration và seed admin gốc:
```bash
npm run db:migrate
npm run db:seed
```

5. Generate Prisma Client:
```bash
npm run db:generate
```

6. Chạy development server:
```bash
npm run dev
```

7. Mở board công khai: `http://localhost:5173/?admin=default` (hoặc cổng dev của bạn)

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

### Multi-admin

- Mỗi admin có **slug** riêng: board `/?admin=<slug>`, đóng họ `/payment?admin=<slug>`.
- Trang `/payment`: chọn board (hoặc **Tất cả nhóm**) + chọn người. Nút xanh **Đóng họ** chỉ trên dashboard (main), không trên từng card ở màn chọn board ban đầu.
- Cấu hình hồ sơ và ngân hàng (VietQR, tùy chọn) tại **`/profile`** sau khi đăng nhập.
- Tuần/đơn chỉ thuộc admin tạo; admin khác không sửa được.
- Dữ liệu cũ sau migrate gán về admin seed (`DEFAULT_ADMIN_*` trong env, mặc định user `admin`, slug `default`).

Biến môi trường seed (tùy chọn):

```
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASSWORD=admin123
DEFAULT_ADMIN_SLUG=default
DEFAULT_BANK_CODE=vpbank
DEFAULT_ACCOUNT_NUMBER=2746520062001
DEFAULT_ACCOUNT_HOLDER=PHAM DINH NGHIA
```

Thêm admin mới (không ghi đè admin cũ):

```bash
SEED_ADMIN_USER=nhom_b \
SEED_ADMIN_PASSWORD=matkhau \
SEED_ADMIN_SLUG=nhom-b \
SEED_ADMIN_DISPLAY_NAME="Nhóm B" \
SEED_ADMIN_BANK_CODE=vpbank \
SEED_ADMIN_ACCOUNT_NUMBER=1234567890 \
SEED_ADMIN_ACCOUNT_HOLDER="TEN CHU TK" \
npm run db:seed:admin
```

`userName` và `slug` phải chưa tồn tại; nếu trùng script thoát lỗi. `npm run db:seed` chỉ tạo admin gốc một lần (chạy lại thì bỏ qua).

### Xem Dashboard

- Dashboard hiển thị tổng quát theo tuần của admin (query `?admin=slug` khi chưa đăng nhập)
- Xem số tiền từng người phải trả; QR khi đã cấu hình đủ ngân hàng trong Hồ sơ (`/profile`)
- Xem chi tiết các đơn hàng trong tuần

## 🔧 Scripts

- `npm run dev` - Chạy development server
- `npm run build` - Build cho production
- `npm run start` - Chạy production server
- `npm run db:migrate` - Migration dev (local)
- `npm run db:migrate:deploy` - Migration production (giữ dữ liệu)
- `npm run db:generate` - Generate Prisma Client
- `npm run db:studio` - Mở Prisma Studio (GUI cho database)
- `npm run db:seed` - Tạo admin gốc (một lần, không cập nhật khi chạy lại)
- `npm run db:seed:admin` - Tạo admin mới (bắt buộc `SEED_ADMIN_*` trong env)
- `npm run db:set-super-admin` - Cấp quyền super admin cho admin đã tồn tại (bắt buộc `SUPER_ADMIN_USER` trong env)

## 🚢 Deploy production (Docker trên server)

### Lần đầu

```bash
git clone <url-repo> antruanao_app && cd antruanao_app
cp .env.exammple .env
# Sửa .env: SESSION_SECRET, mật khẩu DB/admin (xem mục Multi-admin bên dưới)

docker compose up -d --build

# Schema DB — KHÔNG dùng db push trên DB đã có dữ liệu (sẽ hỏi reset = mất data)
docker compose exec app npm run db:migrate:deploy

# Admin gốc — chỉ tạo lần đầu (bỏ qua nếu đã có admin)
docker compose exec app npm run db:seed
```

Trên server nên đặt **HTTPS** (Nginx/Caddy → `127.0.0.1:4000`). Production không nên publish cổng Postgres `5432` ra internet.

### Thêm admin mới trên server (sau deploy)

Mỗi nhóm = 1 admin mới, **không** ghi đè admin cũ. Chạy trong container:

```bash
docker compose exec app sh -c '
  SEED_ADMIN_USER=admin2 \
  SEED_ADMIN_PASSWORD=matkhau_manh \
  SEED_ADMIN_SLUG=team-b \
  SEED_ADMIN_DISPLAY_NAME="Nhóm B" \
  npm run db:seed:admin
'
```

Tùy chọn ngân hàng (để trống = cấu hình sau tại `/profile`):

```bash
docker compose exec app sh -c '
  SEED_ADMIN_USER=nhom_b \
  SEED_ADMIN_PASSWORD=... \
  SEED_ADMIN_SLUG=nhom-b \
  SEED_ADMIN_DISPLAY_NAME="Nhóm B" \
  SEED_ADMIN_BANK_CODE=vpbank \
  SEED_ADMIN_ACCOUNT_NUMBER=1234567890 \
  SEED_ADMIN_ACCOUNT_HOLDER="TEN CHU TK" \
  npm run db:seed:admin
'
```

Link sau khi tạo:

- Board: `https://<domain>/?admin=team-b`
- Đóng họ: `https://<domain>/payment?admin=team-b`

Nếu lỡ có board `default` trống (trùng seed cũ):

```bash
docker compose exec app npm run db:cleanup:orphan-admins
```

### Phân quyền Super admin

Từ bản này, admin thường **chỉ có quyền thêm** thành viên; **xóa thành viên** và **thêm/xóa admin khác** (trang `/admins`) chỉ dành cho **super admin**.

Sau khi migrate (thêm cột `isSuperAdmin`), server đã có sẵn nhiều admin nhưng chưa ai là super admin — chạy lệnh sau để cấp quyền cho một admin đã tồn tại (thay `admin` bằng `userName` thật):

```bash
docker compose exec -e SUPER_ADMIN_USER=admin app npm run db:set-super-admin
```

Sau đó admin đó đăng nhập lại sẽ thấy mục **Quản lý Admin** trên thanh nav để thêm/xóa admin khác.

### Cập nhật bản mới

```bash
git pull
docker compose up -d --build
docker compose exec app npm run db:migrate:deploy
```

Không chạy lại `db:seed` trên DB đang dùng. **Không** chạy `prisma db push` trên production có dữ liệu. Chỉ `db:seed:admin` khi cần thêm nhóm.

### DB production báo “All data will be lost”?

1. Ở prompt `db push` → gõ **`N`** (không reset).
2. Nếu `migrate deploy` báo **No migration found** → thư mục `prisma/migrations` chưa có trên server. **Commit & push** migrations từ máy dev, rồi `git pull` + `docker compose up -d --build`.

**Cách nhanh trên server (giữ data, không cần migrations trong image):**

```bash
# Backup
docker compose exec postgres pg_dump -U antruanao antruanao_db > backup_$(date +%F).sql

# Chạy SQL upgrade (copy file prisma/scripts/multi-admin-upgrade.sql lên server, hoặc sau git pull)
docker compose exec -T postgres psql -U antruanao -d antruanao_db < prisma/scripts/multi-admin-upgrade.sql
```

Hoặc trong container app (sau git pull):

```bash
docker compose exec app npm run db:upgrade:multi-admin
```

Sau khi có `prisma/migrations` trên server:

```bash
docker compose exec app npx prisma migrate deploy
```

Migration gán tuần cũ về admin đầu tiên, **không xóa** orders/users. Đổi mật khẩu tại `/profile` nếu admin mặc định `admin123`.

### Backup DB nhanh

```bash
docker compose exec postgres pg_dump -U antruanao antruanao_db > backup.sql
```

## 🐳 Docker Commands

```bash
docker compose up -d --build
docker compose logs -f app
docker compose down
docker compose down -v   # xóa cả volume DB
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
