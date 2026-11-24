/**
 * درسك AR — تحويل صورة إلى لوحة 3D (.glb) داخل المتصفح
 * يستخدم three.js + GLTFExporter — لا خادم ولا API مدفوع.
 *
 * @param {File|Blob} file — صورة jpg/png/webp
 * @param {{maxWidth?: number, quality?: number}} opts
 * @returns {Promise<{blob: Blob, url: string, width: number, height: number, aspect: number}>}
 *   blob: ملف .glb جاهز للرفع أو للعرض في <model-viewer>
 *   url: رابط Blob مؤقت للملف
 *   width/height: أبعاد اللوحة بالمتر (الارتفاع = 1م، والعرض حسب نسبة الأبعاد)
 *   aspect: width / height للصورة الأصلية
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const DEFAULT_MAX = 1200;
const DEFAULT_QUALITY = 0.82;

/** ضغط الصورة إلى JPEG بحد أقصى maxWidth بكسل */
export async function compressImage(file, maxWidth = DEFAULT_MAX, quality = DEFAULT_QUALITY) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('فشل ضغط الصورة'))), 'image/jpeg', quality));
  return { blob, url: URL.createObjectURL(blob), width: w, height: h };
}

/** تحويل ملف صورة إلى .glb: لوحة مستوية بنسبة أبعاد الصورة */
export async function imageFileToGlb(file, { maxWidth = DEFAULT_MAX, quality = DEFAULT_QUALITY } = {}) {
  if (!file || !/^image\//.test(file.type)) throw new Error('الملف ليس صورة');
  const { blob: imgBlob, url: imgUrl, width: pxW, height: pxH } = await compressImage(file, maxWidth, quality);
  const aspect = pxW / pxH;

  // اللوحة: الارتفاع 1 متر، العرض = نسبة الأبعاد (يُقاس لاحقًا حسب حجم المعلّم)
  const geometry = new THREE.PlaneGeometry(aspect, 1);
  // مهم: TextureLoader.load غير متزامن — يجب انتظار تحميل الصورة قبل التصدير،
  // وإلا يرى GLTFExporter خامة بلا بيانات صورة ويفشل بخطأ
  // "No valid image data found. Unable to process texture"
  const texture = await new Promise((resolve, reject) =>
    new THREE.TextureLoader().load(imgUrl, resolve, undefined, (e) => reject(new Error('تعذّر تحميل الصورة للنموذج'))));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // مهم: حتى لا تظهر الصورة مقلوبة في glTF
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'DarsakImagePanel';
  const scene = new THREE.Scene();
  scene.add(mesh);

  const exporter = new GLTFExporter();
  const glb = await exporter.parseAsync(scene, { binary: true });
  const blob = new Blob([glb], { type: 'model/gltf-binary' });
  return { blob, url: URL.createObjectURL(blob), width: aspect, height: 1, aspect };
}

/** نسخة سريعة: لوحة من نص/لون (تُستخدم لعنصر تجريبي بدون صورة) */
export async function textPanelToGlb(text, { bg = '#4F46E5', fg = '#ffffff' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 640;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 640);
  ctx.fillStyle = fg; ctx.font = '900 72px Cairo, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 320);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  return imageFileToGlb(blob, {});
}
