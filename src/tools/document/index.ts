import { pdfMerge } from './pdfMerge.js';
import { pdfSplit } from './pdfSplit.js';
import { pdfRotate } from './pdfRotate.js';
import { pdfWatermark } from './pdfWatermark.js';
import { pdfInfo } from './pdfInfo.js';
import { pdfMetadata } from './pdfMetadata.js';
import { pdfFormRead } from './pdfFormRead.js';
import { pdfFormFill } from './pdfFormFill.js';
import { pdfRemovePages } from './pdfRemovePages.js';
import { pdfReorder } from './pdfReorder.js';
import { pdfFlatten } from './pdfFlatten.js';
import { pdfNew } from './pdfNew.js';
import { pdfBlank } from './pdfBlank.js';

export default [
  pdfMerge,
  pdfSplit,
  pdfRotate,
  pdfWatermark,
  pdfInfo,
  pdfMetadata,
  pdfFormRead,
  pdfFormFill,
  pdfRemovePages,
  pdfReorder,
  pdfFlatten,
  pdfNew,
  pdfBlank,
];
