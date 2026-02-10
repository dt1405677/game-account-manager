# Game Account Manager - Hướng dẫn sử dụng Dynamic Loading

## Chạy Local Web Server

### Cách 1: Dùng PowerShell Script (Khuyến nghị)
1. **Mở PowerShell** trong thư mục `GameAccountManager`
2. Chạy lệnh:
   ```powershell
   .\start_server.ps1
   ```
3. Mở browser tại: `http://localhost:8000/index.html`

### Cách 2: Chạy thủ công
```powershell
python -m http.server 8000
```
Sau đó mở `http://localhost:8000/index.html`

---

## Thêm/Sửa Nhiệm Vụ Dã Tẩu

### 📁 File chiso.txt
Định dạng:
```
Xem Chỉ Số
   Thân Pháp 1-5
   Thân Pháp 6-10
   ...
```
- **Dòng đầu**: Tên danh mục (bỏ qua)
- **Các dòng sau**: Tên nhiệm vụ (mỗi dòng 1 nhiệm vụ)

### 📁 File tichluy.txt
```
Tích Lũy
   5000 điểm Tống Kim
   1 điểm PK
   ...
```

### 📁 File vatpham.txt
```
Vật Phẩm
   Kinh Bạch Ngọc Bội - Thổ (cấp 2)
   Thúy Lựu Thạch Giới Chỉ (cấp 5)
   ...
```

---

## ✨ Cách Thêm Nhiệm Vụ Mới

1. Mở file tương ứng (chiso.txt / tichluy.txt / vatpham.txt)
2. Thêm dòng mới với tên nhiệm vụ
3. Lưu file
4. **Refresh browser** (F5)
5. ✅ Nhiệm vụ mới sẽ xuất hiện trong dropdown!

### Ví dụ:
Thêm vào `chiso.txt`:
```
Xem Chỉ Số
   Thân Pháp 1-5
   Thân Pháp 6-10
   Thể Chất 1-50      ← Thêm dòng mới
```

---

## 🔍 Kiểm Tra Console Log

Mở **Developer Tools** (F12) > **Console** để xem:
- ✅ `Loaded Dã Tẩu tasks from files` → Thành công
- ⚠️ `Using fallback hardcoded Dã Tẩu tasks` → Không load được, dùng mặc định

---

## ⚡ Lưu Ý

- **Phải chạy qua web server** (http://localhost:8000), không mở trực tiếp file:// 
- Mỗi lần sửa txt file, chỉ cần **refresh browser**
- Không cần sửa code JavaScript
- Data account vẫn được lưu trong localStorage
