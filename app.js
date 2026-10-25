(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fileInput = $('fileInput');
  const dropzone = $('dropzone');
  const removeBg = $('removeBg');
  const grayscale = $('grayscale');
  const enhance = $('enhance');
  const processButton = $('processButton');
  const downloadButton = $('downloadButton');
  const status = $('status');
  const progressBar = $('progressBar');
  const beforeImage = $('beforeImage');
  const afterImage = $('afterImage');
  let file = null;
  let inputURL = null;
  let outputURL = null;
  let busy = false;
  const sessions = new Map();
  const MODEL = { background: 'models/silueta.onnx', enhance: 'models/realesr-general-x4v3.onnx' };
  const wasmBase = new URL('vendor/', document.baseURI).href;
  ort.env.wasm.wasmPaths = wasmBase;
  ort.env.wasm.numThreads = 1;

  function announce(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }
  function progress(percent) { progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`; }
  function syncControls() {
    $('enhanceSettings').hidden = !enhance.checked;
    processButton.disabled = busy || !file || !(removeBg.checked || grayscale.checked || enhance.checked);
    downloadButton.disabled = busy || !outputURL;
    fileInput.disabled = busy;
  }
  for (const checkbox of [removeBg, grayscale, enhance]) checkbox.addEventListener('change', syncControls);
  function selectFile(selected) {
    if (!selected) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type)) {
      announce('فرمت عکس باید PNG، JPEG یا WebP باشد.', true);
      return;
    }
    file = selected;
    $('fileName').textContent = `${selected.name} · ${(selected.size / 1024 / 1024).toFixed(2)} MB`;
    if (inputURL) URL.revokeObjectURL(inputURL);
    inputURL = URL.createObjectURL(file);
    beforeImage.src = inputURL;
    beforeImage.classList.add('visible');
    afterImage.classList.remove('visible');
    if (outputURL) URL.revokeObjectURL(outputURL);
    outputURL = null;
    $('dimensions').textContent = '—';
    progress(0);
    announce('عکس آمادهٔ پردازش است.');
    syncControls();
  }
  fileInput.addEventListener('change', () => selectFile(fileInput.files[0]));
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('drag'); selectFile(e.dataTransfer.files[0]); });
  dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  downloadButton.addEventListener('click', () => {
    if (!outputURL) return;
    const link = document.createElement('a');
    link.href = outputURL;
    link.download = `${file.name.replace(/\.[^.]+$/, '')}_processed.png`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 0);
  });

  async function modelSession(kind) {
    if (sessions.has(kind)) return sessions.get(kind);
    announce(`در حال آماده‌سازی مدل ${kind === 'background' ? 'حذف پس‌زمینه' : 'افزایش کیفیت'}… دریافت اولیه ممکن است کمی طول بکشد.`);
    await nextPaint();
    const url = new URL(MODEL[kind], document.baseURI).href;
    const session = await ort.InferenceSession.create(url, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    sessions.set(kind, session);
    return session;
  }
  const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  function canvas(width, height) {
    const item = document.createElement('canvas');
    item.width = width; item.height = height;
    return item;
  }
  async function readSource(selected) {
    const bitmap = await createImageBitmap(selected);
    const raw = canvas(bitmap.width, bitmap.height);
    raw.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgb = canvas(raw.width, raw.height);
    const ctx = rgb.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, rgb.width, rgb.height);
    ctx.drawImage(raw, 0, 0);
    return { raw, rgb };
  }
  async function backgroundMask(rgb) {
    const session = await modelSession('background');
    announce('در حال شناسایی سوژه…');
    const small = canvas(320, 320);
    const ctx = small.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(rgb, 0, 0, 320, 320);
    const bytes = ctx.getImageData(0, 0, 320, 320).data;
    let maximum = 1;
    for (let i = 0; i < bytes.length; i += 4) maximum = Math.max(maximum, bytes[i], bytes[i + 1], bytes[i + 2]);
    const plane = 320 * 320;
    const input = new Float32Array(plane * 3);
    const means = [0.485, 0.456, 0.406], stds = [0.229, 0.224, 0.225];
    for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) input[c * plane + i] = (bytes[i * 4 + c] / maximum - means[c]) / stds[c];
    const result = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 320, 320]) });
    const raw = result[session.outputNames[0]].data;
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < raw.length; i++) { low = Math.min(low, raw[i]); high = Math.max(high, raw[i]); }
    const maskImage = ctx.createImageData(320, 320);
    for (let i = 0; i < plane; i++) {
      const value = high > low ? Math.max(0, Math.min(255, Math.round((raw[i] - low) / (high - low) * 255))) : 0;
      const j = i * 4;
      maskImage.data[j] = maskImage.data[j + 1] = maskImage.data[j + 2] = value;
      maskImage.data[j + 3] = 255;
    }
    ctx.putImageData(maskImage, 0, 0);
    return small;
  }
  function inputTensor(pixels, width, height) {
    const plane = width * height;
    const data = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
      const j = i * 4;
      data[i] = pixels[j] / 255;
      data[plane + i] = pixels[j + 1] / 255;
      data[plane * 2 + i] = pixels[j + 2] / 255;
    }
    return new ort.Tensor('float32', data, [1, 3, height, width]);
  }
  async function enhanceImage(rgb, scale, strength) {
    const session = await modelSession('enhance');
    const width = rgb.width, height = rgb.height;
    const out = canvas(width * scale, height * scale);
    const outCtx = out.getContext('2d', { willReadFrequently: true });
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    const tile = 64, overlap = 8;
    const columns = Math.ceil(width / tile), rows = Math.ceil(height / tile), total = columns * rows;
    let done = 0;
    const sourceCtx = rgb.getContext('2d', { willReadFrequently: true });
    for (let y = 0; y < height; y += tile) for (let x = 0; x < width; x += tile) {
      const x1 = Math.min(x + tile, width), y1 = Math.min(y + tile, height);
      const left = Math.max(x - overlap, 0), top = Math.max(y - overlap, 0);
      const right = Math.min(x1 + overlap, width), bottom = Math.min(y1 + overlap, height);
      const pw = right - left, ph = bottom - top;
      const pixels = sourceCtx.getImageData(left, top, pw, ph).data;
      const result = await session.run({ [session.inputNames[0]]: inputTensor(pixels, pw, ph) });
      const output = result[session.outputNames[0]];
      const ow = output.dims[3], oh = output.dims[2];
      if (ow !== pw * 4 || oh !== ph * 4) throw new Error('اندازهٔ خروجی مدل افزایش کیفیت نامعتبر است.');
      const cropWidth = (x1 - x) * 4, cropHeight = (y1 - y) * 4;
      const crop = canvas(cropWidth, cropHeight);
      const cropCtx = crop.getContext('2d');
      const image = cropCtx.createImageData(cropWidth, cropHeight);
      const values = output.data, plane = ow * oh;
      const xOffset = (x - left) * 4, yOffset = (y - top) * 4;
      for (let row = 0; row < cropHeight; row++) for (let col = 0; col < cropWidth; col++) {
        const sourceIndex = (row + yOffset) * ow + col + xOffset;
        const targetIndex = (row * cropWidth + col) * 4;
        for (let c = 0; c < 3; c++) image.data[targetIndex + c] = Math.round(Math.max(0, Math.min(1, values[c * plane + sourceIndex])) * 255);
        image.data[targetIndex + 3] = 255;
      }
      cropCtx.putImageData(image, 0, 0);
      outCtx.drawImage(crop, x * scale, y * scale, (x1 - x) * scale, (y1 - y) * scale);
      done++;
      progress(25 + 65 * done / total);
      announce(`در حال افزایش کیفیت: بخش ${done} از ${total}`);
      await nextPaint();
    }
    if (strength < 1) {
      outCtx.globalAlpha = 1 - strength;
      outCtx.drawImage(rgb, 0, 0, out.width, out.height);
      outCtx.globalAlpha = 1;
    }
    return out;
  }
  async function process() {
    if (!file || busy || !(removeBg.checked || grayscale.checked || enhance.checked)) return;
    busy = true; syncControls(); progress(2);
    try {
      const { raw, rgb } = await readSource(file);
      const scale = enhance.checked ? Number($('scale').value) : 1;
      const outputPixels = raw.width * raw.height * scale * scale;
      if (outputPixels > 36000000 || raw.width * scale > 16000 || raw.height * scale > 16000) throw new Error('خروجی برای حافظهٔ مرورگر خیلی بزرگ است؛ عکس کوچک‌تر یا مقیاس ۲ برابر را انتخاب کنید.');
      $('dimensions').textContent = `${raw.width} × ${raw.height} ← ${raw.width * scale} × ${raw.height * scale}`;
      const mask = removeBg.checked ? await backgroundMask(rgb) : null;
      progress(25); await nextPaint();
      const result = enhance.checked ? await enhanceImage(rgb, scale, Number($('strength').value)) : rgb;
      announce('در حال آماده‌سازی PNG…'); progress(92); await nextPaint();
      const ctx = result.getContext('2d', { willReadFrequently: true });
      const data = ctx.getImageData(0, 0, result.width, result.height);
      const originalScaled = canvas(result.width, result.height);
      originalScaled.getContext('2d').drawImage(raw, 0, 0, result.width, result.height);
      const originalAlpha = originalScaled.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, result.width, result.height).data;
      let maskData = null;
      if (mask) {
        const scaled = canvas(result.width, result.height);
        scaled.getContext('2d').drawImage(mask, 0, 0, result.width, result.height);
        maskData = scaled.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, result.width, result.height).data;
      }
      for (let i = 0; i < data.data.length; i += 4) {
        if (grayscale.checked) {
          const value = Math.round(0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2]);
          data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
        }
        data.data[i + 3] = maskData ? Math.round(originalAlpha[i + 3] * maskData[i] / 255) : originalAlpha[i + 3];
      }
      ctx.putImageData(data, 0, 0);
      const blob = await new Promise((resolve, reject) => result.toBlob(value => value ? resolve(value) : reject(new Error('ساخت PNG ناموفق بود.')), 'image/png'));
      if (outputURL) URL.revokeObjectURL(outputURL);
      outputURL = URL.createObjectURL(blob);
      afterImage.src = outputURL;
      afterImage.classList.add('visible');
      progress(100);
      announce(`آماده شد: ${result.width} × ${result.height} پیکسل. عکس برای پردازش آپلود نشد.`);
    } catch (error) {
      console.error(error);
      announce(`پردازش ناموفق بود: ${error.message || error}`, true);
      progress(0);
    } finally { busy = false; syncControls(); }
  }
  processButton.addEventListener('click', process);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline cache unavailable:', error));
  syncControls();
})();



