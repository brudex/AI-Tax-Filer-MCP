import multer from 'multer';
import { config } from '../config/config.js';
// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, config.server.uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
    }
});
// Configure file filter
const fileFilter = (req, file, cb) => {
    if (config.files.upload.allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed types: ${config.files.upload.allowedTypes.join(', ')}`));
    }
};
// Create multer instance
export const upload = multer({
    storage,
    limits: {
        fileSize: typeof config.files.upload.maxSize === 'string'
            ? parseInt(config.files.upload.maxSize, 10)
            : config.files.upload.maxSize
    },
    fileFilter
});
// Error handler for file size limit
export const handleFileSizeError = (err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            error: {
                code: 'FILE_TOO_LARGE',
                message: `File size too large. Maximum allowed size is ${config.files.upload.maxSize} bytes`,
            }
        });
    }
    next(err);
};
