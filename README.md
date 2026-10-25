# استودیو تصویر آفلاین — نسخهٔ وب

سه گزینهٔ مستقل یا ترکیبی: حذف پس‌زمینه، تبدیل به خاکستری و افزایش کیفیت با Real-ESRGAN. هیچ عکس یا درخواستی برای استنتاج مدل به سرور ارسال نمی‌شود؛ ONNX Runtime Web مدل‌ها را در مرورگر اجرا می‌کند. فایل‌های مدل، جاوااسکریپت و WebAssembly همراه همین سایت هستند. بار اول فایل‌ها از GitHub Pages دریافت می‌شوند؛ فایل‌هایی که یک بار بارگیری شده‌اند با Service Worker در مرورگر ذخیره می‌شوند. مرورگر ممکن است کش را در شرایط کمبود فضا پاک کند.

## انتشار در GitHub Pages

1. فایل ZIP خروجی را در یک پوشه استخراج کنید. محتوای همان پوشه باید ریشهٔ مخزن باشد؛ `index.html` باید در ریشه قرار بگیرد.
2. در GitHub مخزنی با نام دلخواه، مثلاً `offline-image-studio`، و وضعیت **Public** بسازید؛ هنگام ساخت، README جداگانه اضافه نکنید.
3. Git را نصب کنید و در PowerShell داخل پوشهٔ استخراج‌شده اجرا کنید:

```powershell
git init
git add .
git commit -m "Initial browser-only image studio"
git branch -M main
git remote add origin https://github.com/USERNAME/offline-image-studio.git
git push -u origin main
```

`USERNAME` را با نام کاربری GitHub خودتان عوض کنید. اگر Git نام و ایمیل درخواست کرد، ابتدا `git config --global user.name "YOUR NAME"` و `git config --global user.email "YOUR EMAIL"` را تنظیم کنید.

4. در مخزن GitHub به **Settings → Pages → Build and deployment** بروید. **Deploy from a branch**، شاخهٔ **main** و پوشهٔ **/(root)** را انتخاب و Save کنید.
5. لینک سایت در همان صفحه نمایش داده می‌شود، معمولاً `https://USERNAME.github.io/offline-image-studio/`.

مدل Silueta حدود ۴۴ مگابایت است؛ آن را از طریق `git push` ارسال کنید، چون بارگذاری تک‌فایل از مرورگر GitHub محدودتر است. هیچ Git LFS یا سرور محاسباتی لازم نیست.

## اجرای محلی

فایل `index.html` را با `file://` باز نکنید. از پوشهٔ سایت این دستور را اجرا کنید و سپس `http://localhost:8000/` را باز کنید:

```powershell
python -m http.server 8000
```

Chrome یا Edge به‌روز توصیه می‌شود. پردازش مدل‌ها با WebAssembly داخل مرورگر انجام می‌شود؛ افزایش کیفیت روی بعضی دستگاه‌ها زمان‌بر است. خروجی‌های بسیار بزرگ برای جلوگیری از کمبود حافظه محدود شده‌اند.

## منابع مدل و مجوزها

- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/): متن مجوز MIT در `licenses/ONNX-Runtime-LICENSE.txt`
- [Silueta از rembg](https://github.com/danielgatis/rembg): متن مجوز در `licenses/rembg-LICENSE.txt`
- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN): متن مجوز در `licenses/Real-ESRGAN-LICENSE.txt`
- [تبدیل ONNX مدل Real-ESRGAN](https://huggingface.co/Saimon8420/realesr-general-x4v3-web)

این نسخه هیچ بخش ویدئو، FFmpeg، LivePortrait یا API هوش مصنوعی آنلاین ندارد.


