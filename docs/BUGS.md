# 🐛 BUGS — Đã fix & Known Issues

> Cập nhật: 04/08/2026

---

## ✅ ĐÃ FIX (Session 2 — 03-04/08/2026)

### CRITICAL

| # | File | Dòng | Mô tả | Fix |
|:--|:--|:--|:--|:--|
| B01 | `reporter.js` | 125-128 | `filterReport()` khi filter = "all" (mặc định), `"all"` là truthy nên lọc ẩn TOÀN BỘ rows | Thêm `&& trangThai !== 'all'` cho mỗi điều kiện |
| B02 | `app.js` | 225 | Nút `#btn-export-full` không có event listener → bấm không có gì | Thêm `addEventListener` gọi `Exporter.exportFullExcel(this.state)` |
| B03 | `utils.js` | 191-194 | `showModal()` confirmBtn đóng modal trước khi gọi `onConfirm()` → nếu validation fail, modal đã đóng mất | Đổi logic: chỉ đóng modal nếu `onConfirm()` không return `false` |

### HIGH

| # | File | Dòng | Mô tả | Fix |
|:--|:--|:--|:--|:--|
| B04 | `storage.js` | 51, 57-63 | `mergeSTKPhu()` không update `currentMap` trong loop → nếu `newList` có duplicate key, chèn trùng | Thêm `currentMap.set(newItem.stk, entry)` sau push |
| B05 | `storage.js` | 93, 98-105 | `mergeKeywords()` cùng lỗi như B04 | Tương tự: thêm `currentMap.set()` |
| B06 | `storage.js` | 51, 93 | `return;` thay vì `return 0;` khi input không phải array → caller nhận `undefined` | Đổi thành `return 0;` |
| B07 | `app.js` | 429-435 | `suggestMatch()` truyền array `[{...}]` thay vì object `{...}` → `unmatchedTx.description` = undefined | Bỏ ngoặc vuông, truyền object trực tiếp |
| B08 | `app.js` | 433 | `suggestions[0].length` — `suggestions[0]` là object, `.length` = undefined → luôn hiện "Không có gợi ý" | Sửa: `suggestions.length > 0` rồi `suggestions.map(...)` |
| B09 | `app.js` | 460 | TPBank unmatched hard-code `"Chưa có gợi ý"` thay vì gọi `suggestMatch()` | Thêm gọi `Matcher.suggestMatch(t, this.state.students)` |
| B10 | `app.js` | 443, 895 | Inline `onclick` dùng template literal chứa dấu `'` → JS syntax error nếu tên/STK có `'` | Thêm `.replace(/'/g, "\\\\'")` |
| B11 | `app.js` | 635, 690 | Sau khi gán STK/keyword xong, chỉ gọi `renderSyncChanges()` → bảng ngoại lệ không cập nhật | Đổi thành `this.runMatching()` để re-match + re-render |
| B12 | `app.js` | 930 | `info.lastBackupDate` không tồn tại (đúng: `info.lastHistoryDate`) → luôn hiện "Chưa có" | Sửa tên biến |
| B13 | `matcher.js` | 68 | `b.keyword.length` crash nếu keyword undefined | Đổi: `(b.keyword || '').length` |
| B14 | `matcher.js` | 164-183 | `aggregateByMSHS` case-sensitive → `'hv001' !== 'HV001'` | Thêm `.toUpperCase()` |

### MEDIUM

| # | File | Dòng | Mô tả | Fix |
|:--|:--|:--|:--|:--|
| B15 | `utils.js` | 79-83 | `formatDate()` không parse DD-MM-YY (2 chữ số năm) → ngày tiền mặt hiện sai | Thêm nhánh `parts[2].length === 2` → `2000 + parseInt(parts[2])` |
| B16 | `importer.js` | 94 | Hardcode `APP_CONFIG.DEFAULT_HOC_PHI` thay vì đọc `#default-fee` input | Đổi: `Utils.parseNumber(document.getElementById('default-fee')?.value) \|\| APP_CONFIG.DEFAULT_HOC_PHI` |
| B17 | `importer.js` | 155-162 | VietinBank thiếu alias cột `"Số TK đối ứng"`, `"Số tài khoản đối ứng"` | Thêm vào mảng tìm kiếm |
| B18 | `importer.js` | 217-223 | TPBank thiếu alias cột `"Ngày"`, `"Ngày GD"` | Thêm vào mảng tìm kiếm |
| B19 | `importer.js` | 241 | Regex hard-code `LE THI TUYET NHUNG chuyen tien` (tên chủ TK cá nhân) | Comment ra — user sẽ tự filter nếu cần |
| B20 | `importer.js` | 313 | MSHS tiền mặt không `.toUpperCase()` → mismatch khi aggregate | Thêm `.toUpperCase()` |

---

## ⚠️ KNOWN ISSUES (CHƯA FIX)

| # | File | Mô tả | Mức độ | Ghi chú |
|:--|:--|:--|:--|:--|
| K01 | `utils.js:60` | `parseNumber()` xóa TẤT CẢ dấu chấm → số thập phân `10.5` biến thành `105` | LOW | VND luôn là số nguyên nên thực tế không ảnh hưởng. Chỉ lưu ý nếu sau này hỗ trợ ngoại tệ |
| K02 | `exporter.js` | `exportKeToan()` tạo 3 sheet nhưng format chưa đúng mẫu kế toán thực tế | HIGH | Cần sửa trong TASK — sheet 2 "DS viết HĐ" phải có 6 dòng header công ty + footer tổng + giám đốc |
| K03 | `app.js` | `exportFullExcel()` truyền `this.state` nhưng state không có đúng key `vtb`, `tpb`, `cash` mà là `vtbTransactions`, `tpbTransactions`, `cashPayments` | HIGH | Cần kiểm tra key mapping khi gọi |
| K04 | `accounting.js` | `generateNhacPH()` đã code nhưng chưa bao giờ được gọi từ `app.js` | LOW | Dead code, xem xét bổ sung hoặc xóa |
| K05 | `exporter.js` | `exportNhacPH()` đã code nhưng chưa bao giờ được gọi | LOW | Tương tự K04 |
| K06 | Toàn bộ | **Chưa test import file thực tế trên trình duyệt** — script tách 4 file test bị treo vì Excel COM bị kẹt prompt | CRITICAL | Cần user tự tách file thủ công hoặc fix script |
