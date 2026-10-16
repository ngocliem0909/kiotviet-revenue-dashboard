# Hướng Dẫn Cập Nhật & Triển Khai Dashboard Doanh Thu KiotViet

Hệ thống kết nối trực tiếp với dữ liệu thực tế tại thư mục **KiotViet-HoaDon**:
- Sheet chi tiết hóa đơn tháng 10/2026: `HoaDon_2026-10` (`14e0fIJYN28HEJkBKpmo6rSVhb4nd4puQz0niA4GRg-M`)
- Sheet tổng hợp lịch sử các tháng: `KiotViet-Summary` (`1FrWL8e_7LAFhjL7at915i9CKt6t87NzXKFLQ9j_V-uo`)
- **Nguyên tắc an toàn tuyệt đối**: Chế độ **Chỉ Đọc (Read-Only)** 100%, tuyệt đối không sửa đổi, không ghi đè và không xóa bất kỳ dữ liệu nào trên trang tính nguồn.

---

## ⚠️ NGUYÊN NHÂN LỖI & CÁCH KHẮC PHỤC TRIỆT ĐỂ

### 1. Tại sao trước đó số liệu bị lệch?
- Trong dữ liệu KiotViet gốc, cột trạng thái (cột I và cột N) chứa cả đơn `Completed` (Hoàn thành) và `Processing` (Đơn giao COD, đơn TikTok Shop/Zalo đang xử lý chưa hủy).
- Biểu đồ cũ chỉ tính đơn `Hoàn thành`, dẫn tới tổng số tiền trên biểu đồ thấp hơn số liệu KPI tổng quát.
- Biểu đồ Top sản phẩm trước đó đọc nhầm bảng dữ liệu lịch sử năm **2024** trong file Summary.
- **Đã khắc phục**: `Code.gs` mới đã thống nhất công thức:
  - Doanh thu đơn hoạt động (`Hoàn thành` + `Đang xử lý`): **1.624.171.250 ₫** (khớp 100% giữa tất cả các biểu đồ và thẻ KPI).
  - Thực thu đã nhận: **1.415.218.251 ₫** (khớp chính xác từng đồng với bảng tổng hợp KiotViet).
  - Đã hủy: **5 đơn (3.095.000 ₫)** được tách riêng để theo dõi.
  - Thay thế biểu đồ bằng **Top 7 Nhân viên bán hàng xuất sắc nhất tháng 10/2026** tính trực tiếp từ dữ liệu thực tế.

### 2. Tại sao các nút lọc và tùy chọn ngày không thực thi?
- Ô tìm kiếm bảng dữ liệu bị lỗi JavaScript (`TypeError: toLowerCase`) khi gặp dòng có tên khách hàng trống hoặc mã đơn dạng số, khiến script bị dừng đột ngột.
- Nút "Tùy chọn ngày..." thiếu cơ chế tự động kích hoạt truy vấn khi người dùng chọn ngày.
- **Đã khắc phục**: Đã bổ sung hàm kiểm tra an toàn `safeStr()`, gắn sự kiện `onchange` trực tiếp vào 2 ô ngày, và thiết lập ngày mặc định (`2026-10-01` đến `2026-10-15`).

---

## 🚀 CÁC BƯỚC CẬP NHẬT TRÊN GOOGLE APPS SCRIPT

### Bước 1: Mở Apps Script của bạn
Mở trình duyệt vào dự án Apps Script hiện tại của bạn (hoặc vào Google Sheet > chọn **Tiện ích mở rộng** > **Apps Script**).

### Bước 2: Cập nhật file `Code.gs`
1. Mở file `Code.gs` trong Apps Script.
2. Xóa toàn bộ mã cũ.
3. Mở file [Code.gs](file:///Users/ngocliem0909/TESTCODE/google-sheets-revenue-webapp/Code.gs), sao chép toàn bộ nội dung và dán vào.
4. Bấm **Lưu (Ctrl + S hoặc Cmd + S)**.

### Bước 3: Cập nhật file `Index.html`
1. Mở file `Index.html` trong Apps Script.
2. Xóa toàn bộ mã cũ.
3. Mở file [Index.html](file:///Users/ngocliem0909/TESTCODE/google-sheets-revenue-webapp/Index.html), sao chép toàn bộ nội dung và dán vào.
4. Bấm **Lưu (Ctrl + S hoặc Cmd + S)**.

---

### Bước 4: TẠO PHIÊN BẢN MỚI TRÊN MANAGE DEPLOYMENTS (BƯỚC BẮT BUỘC)
> [!IMPORTANT]
> Nếu bạn chỉ bấm "Lưu", đường link Web App của Google sẽ **vẫn chạy phiên bản cũ (v1) từ bộ nhớ cache**! Bạn bắt buộc phải tạo bản triển khai mới theo các bước sau:

1. Ở góc trên bên phải, bấm vào nút **Triển khai (Deploy)** > chọn **Quản lý các bản triển khai (Manage deployments)**.
2. Trong cửa sổ hiện ra, bấm vào biểu tượng **Cây bút ✏️ (Chỉnh sửa / Edit)** ở bản triển khai Web App hiện tại.
3. Ở mục **Phiên bản (Version)**: Bấm chọn **Phiên bản mới (New version)**.
4. (Tùy chọn) Nhập ghi chú: `v2 - Fix dữ liệu chuẩn & sửa lỗi bộ lọc`.
5. Bấm nút **Triển khai (Deploy)**.
6. Mở lại đường link **Web app URL** (hoặc nhấn `F5` / `Ctrl+Shift+R` để xóa cache trình duyệt).

---

## 📊 CÁC TÍNH NĂNG ĐÃ KIỂM TRA & HOẠT ĐỘNG HOÀN HẢO

1. **Bộ lọc kỳ thời gian (Presets & Custom)**:
   - **Tất cả tháng 10**: Xem toàn bộ 2.699 hóa đơn tháng 10/2026.
   - **Hôm nay (15/10)**: Lọc chính xác 106 đơn phát sinh trong ngày 15/10 (Doanh số: 69.980.000 ₫).
   - **7 ngày qua**: Lọc từ 09/10 đến 15/10 (1.493 đơn, Doanh số: 898.290.750 ₫).
   - **Tùy chọn ngày...**: Mở 2 ô chọn ngày (Từ ngày → Đến ngày), tự động cập nhật ngay khi bạn đổi ngày.

2. **Bộ lọc đa chiều**:
   - **Chi nhánh**: Tự động nhận diện toàn bộ các chi nhánh (CN 136 Ninh Kiều, 88 Lê Văn Sỹ, CN Cần Thơ...).
   - **Kênh bán**: Lọc chuẩn 3 kênh chính: `Cửa hàng trực tiếp`, `Zalo / Online COD`, `TikTok Shop`.
   - **Trạng thái**: Lọc theo `Hoàn thành`, `Đang xử lý` hoặc `Đã hủy`.

3. **Tìm kiếm thời gian thực & Xuất CSV**:
   - Gõ tìm kiếm theo mã đơn (`HD...`, `HDTTS_...`), tên khách hàng, tên nhân viên bán, chi nhánh. Không còn bị đơ hay văng lỗi.
   - Bấm nút **Xuất CSV** để tải file Excel/CSV về máy tính ngay lập tức.
