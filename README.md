# YT Channel Inspector

Extension Chrome/Edge (Manifest V3) xem nhanh trạng thái kiếm tiền và các thông tin liên quan của một kênh YouTube.

## Tính năng

- **Kết luận kiếm tiền** theo 4 mức:
  - Đang bật: có Hội viên, Shopping hoặc Store, những tính năng chỉ kênh trong YPP mới có.
  - Nhiều khả năng đã bật: chỉ thấy quảng cáo, kênh từ 500 người đăng ký trở lên.
  - Có quảng cáo nhưng chưa đủ điều kiện YPP: YouTube tự chạy quảng cáo và không chia doanh thu cho chủ kênh.
  - Không thấy dấu hiệu kiếm tiền.
- **Thông tin thêm** (giống hộp "More info" của YouTube): link kênh, quốc gia, ngày tham gia, người đăng ký, số video, tổng lượt xem, mô tả kênh.
- **Quảng cáo:** vị trí pre/mid/post-roll của từng video, thanh thời gian đánh dấu chỗ có quảng cáo, nhãn quảng cáo có trả phí.
- **Video:** lượt xem, lượt thích, ngày đăng, danh mục; lượt xem trung bình, cao nhất và tổng.
- **Shopping:** sản phẩm gắn trong video, nơi bán, link affiliate.
- **Hội viên:** nút Join, tab Membership, video chỉ dành cho hội viên, Super Thanks, tab Store.
- **Khác:** an toàn cho gia đình, giới hạn tuổi, cho phép nhúng, email doanh nghiệp, tab kênh, RSS, từ khoá.
- Xuất dữ liệu ra JSON hoặc CSV.

## Cài đặt

1. Mở `chrome://extensions` (Edge: `edge://extensions`).
2. Bật **Developer mode**.
3. Bấm **Load unpacked** và chọn thư mục này.
4. Mở một kênh hoặc video YouTube rồi bấm icon extension. Cũng có thể dán link vào ô tìm kiếm.

## Cách hoạt động

- Extension tải trang kênh và các video gần nhất ở chế độ ẩn danh (không gửi cookie), nên đăng nhập YouTube Premium không làm ẩn quảng cáo.
- Phần "Thông tin thêm" lấy qua API `youtubei/v1/browse`, chính là API mà nút "...more" trên YouTube dùng. YouTube từ chối request có `Origin: chrome-extension://…` (lỗi 403), nên extension dùng `declarativeNetRequest` đổi header Origin thành `https://www.youtube.com`. Quy tắc này chỉ áp dụng cho request do chính extension gửi.

## Cấu trúc

| File | Vai trò |
|---|---|
| `parser.js` | Đọc dữ liệu từ HTML/JSON của YouTube. Không dùng DOM nên chạy được cả trong Node. |
| `inspector.js` | Tải trang kênh, phần giới thiệu và các video gần nhất, rồi đưa qua `parser.js`. |
| `popup.html` / `popup.css` / `popup.js` | Giao diện popup. |

Thử nhanh bằng Node 18+:

```bash
node -e 'require("./inspector.js").inspect("https://www.youtube.com/@duongde_official",{videoCount:3}).then(r=>console.log(r.verdict))'
```

## Giới hạn

- Dữ liệu là những gì người xem thấy từ IP của bạn. Doanh thu, RPM và trạng thái YPP chính thức chỉ có trong YouTube Studio hoặc CMS.
- Vị trí mid-roll thường được quyết định lúc phát nên không có trong dữ liệu tải về.
- Khi YouTube thay đổi cấu trúc trang, chỉ cần sửa `parser.js`.
