# MA TOEIC Practice — Test 3, 4, 5

Ứng dụng web tĩnh (HTML/CSS/JS thuần) luyện thi TOEIC Listening & Reading cho 3 đề **Test 3, Test 4, Test 5** (MA).

## Cách chạy thử trên máy (Local)
Do trình duyệt chặn `fetch()` khi mở trực tiếp file `index.html` qua giao thức `file://`, bạn hãy chạy bằng một local server đơn giản:
```bash
cd C:\Users\Admin\Downloads\toeic-web
python -m http.server 8080
```
Sau đó mở trình duyệt tại `http://localhost:8080`.

## Cách Deploy lên GitHub Pages
1. Tạo một repository mới trên GitHub (ví dụ `toeic-practice`).
2. Push toàn bộ thư mục `toeic-web` lên nhánh `main`:
   ```bash
   cd C:\Users\Admin\Downloads\toeic-web
   git init
   git add .
   git commit -m "Initial TOEIC practice web (Test 3, 4, 5)"
   git branch -M main
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```
3. Vào **Settings → Pages → Source**, chọn **Deploy from a branch** (`main` / `/ (root)`) và bấm **Save**. Sau khoảng 1 phút web sẽ chạy tại `https://<username>.github.io/<repo>/`.
