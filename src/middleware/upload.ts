import multer from 'multer';
import { ValidationError } from '../shared/errors/appError.js';

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // Some browsers / OS send CSV/Excel as octet-stream
];

export const excelUpload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max file size
  },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    const isAllowedExt = ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls');

    if (isAllowedExt || ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed'));
    }
  },
});
