import image_info from './image_info.js';
import image_ocr from './image_ocr.js';
import exif_read from './exif_read.js';
import video_metadata from './video_metadata.js';
import audio_transcribe from './audio_transcribe.js';
import thumbnail_generate from './thumbnail_generate.js';
import media_download from './media_download.js';
import favicon_fetch from './favicon_fetch.js';
import screenshot_page from './screenshot_page.js';
import screenshot_full_page from './screenshot_full_page.js';
import pdf_ocr from './pdf_ocr.js';
import image_convert from './image_convert.js';
import image_resize from './image_resize.js';
import svg_to_png from './svg_to_png.js';
import barcode_qr_read from './barcode_qr_read.js';

export default [
  image_info,
  image_ocr,
  exif_read,
  video_metadata,
  audio_transcribe,
  thumbnail_generate,
  media_download,
  favicon_fetch,
  screenshot_page,
  screenshot_full_page,
  pdf_ocr,
  image_convert,
  image_resize,
  svg_to_png,
  barcode_qr_read,
];
