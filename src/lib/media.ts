import { Capacitor } from '@capacitor/core';
import { backend } from './backend';
import type { Media, MediaKind, ServiceStage } from './types';
import { uuid } from './util';

/** Zmenší fotku (delší strana max `maxSide` px) a převede na JPEG – šetří data i úložiště. */
export async function resizeImage(file: Blob, maxSide = 2000, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}

export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}

const safeName = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');

export interface UploadOpts {
  machineId: string | null;
  serviceOrderId?: string | null;
  kind: MediaKind;
  stage?: ServiceStage | null;
  caption?: string;
}

/** Nahraje soubor do úložiště a vytvoří záznam v tabulce media. */
export async function uploadMedia(file: File | Blob, opts: UploadOpts, name?: string): Promise<Media> {
  const isImage = opts.kind === 'photo';
  const blob = isImage ? await resizeImage(file) : file;
  const fileName = name ?? (file instanceof File ? file.name : 'foto.jpg');
  const id = uuid();
  const folder = opts.machineId ?? 'nezarazeno';
  const ext = isImage && blob.type === 'image/jpeg' ? '.jpg' : '';
  const path = `${folder}/${id}-${safeName(fileName)}${ext && !/\.jpe?g$/i.test(fileName) ? ext : ''}`;
  const type = blob.type || 'application/octet-stream';
  await backend.uploadFile(path, blob, type);
  return backend.upsert('media', {
    id,
    machine_id: opts.machineId,
    service_order_id: opts.serviceOrderId ?? null,
    kind: opts.kind,
    stage: opts.stage ?? null,
    name: fileName,
    mime: type,
    size: blob.size,
    path,
    caption: opts.caption ?? '',
  });
}

export async function deleteMedia(m: Media) {
  await backend.removeFile(m.path);
  await backend.remove('media', m.id);
}

/**
 * Vyfocení fotoaparátem. V nativní aplikaci (Android/iOS přes Capacitor) použije
 * systémový fotoaparát, jinde vrátí null a UI použije <input capture>.
 */
export async function takeNativePhoto(): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 85,
    correctOrientation: true,
  });
  if (!photo.webPath) return null;
  const blob = await (await fetch(photo.webPath)).blob();
  return new File([blob], `foto-${Date.now()}.${photo.format || 'jpg'}`, { type: blob.type || 'image/jpeg' });
}
