// admin-routes.js - FIXED FOR POSTGRESQL + ZIP SUPPORT
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { 
    createChecklist, 
    pool,  // ✅ Use pool instead of db
    getAllChecklists,
    getChecklist,
    updateChecklist,
    deleteChecklist
} = require('./database');

// Configure multer for both PDF and ZIP file uploads
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const dir = path.join(__dirname, 'uploads');
        try {
            await fs.mkdir(dir, { recursive: true });
            cb(null, dir);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        // Generate unique filename with timestamp
        const timestamp = Date.now();
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `${timestamp}_${cleanName}`;
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        console.log('File upload attempt:', {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype
        });
        
        // Accept PDF files
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        }
        // Accept ZIP files  
        else if (file.mimetype === 'application/zip' || 
                 file.mimetype === 'application/x-zip-compressed' ||
                 file.originalname.toLowerCase().endsWith('.zip')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only PDF and ZIP files are allowed'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit for ZIP files
    }
});

// Simple auth middleware (in production, use proper authentication)
const adminAuth = (req, res, next) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey === process.env.ADMIN_KEY || adminKey === 'admin123') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Get all checklists with full details (admin view)
router.get('/checklists', adminAuth, async (req, res) => {
    try {
        const checklists = await getAllChecklists();
        res.json(checklists);
    } catch (error) {
        console.error('Admin get checklists error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new checklist - UPDATED FOR PDF AND ZIP SUPPORT
router.post('/checklists', adminAuth, upload.fields([
    { name: 'pdfFile', maxCount: 1 },
    { name: 'zipFile', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('Create checklist request received');
        console.log('Body:', req.body);
        console.log('Files:', req.files);
        
        const { title, description, icon, category, features, content } = req.body;
        
        // Validate required fields
        if (!title || !description) {
            return res.status(400).json({ error: 'Title and description are required' });
        }
        
        // Parse features if it's a string
        const featureList = typeof features === 'string' 
            ? features.split('\n').filter(f => f.trim())
            : features || [];
        
        // Prepare checklist data
        const checklistData = {
            title,
            description,
            icon: icon || '📋',
            category: category || 'Other',
            content: content || '',
            features: featureList,
            items: [] // No items for file uploads
        };
        
        let uploadedFile = null;
        let fileType = null;
        
        // Check for PDF file upload
        if (req.files && req.files.pdfFile && req.files.pdfFile[0]) {
            uploadedFile = req.files.pdfFile[0];
            fileType = 'pdf';
            console.log('Processing PDF file:', uploadedFile.originalname);
        }
        // Check for ZIP file upload
        else if (req.files && req.files.zipFile && req.files.zipFile[0]) {
            uploadedFile = req.files.zipFile[0];
            fileType = 'zip';
            console.log('Processing ZIP file:', uploadedFile.originalname);
        }
        
        // Handle file processing if a file was uploaded
        if (uploadedFile) {
            // If production environment, store as base64
            if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
                console.log('Production environment detected, storing file as base64');
                
                // Read the file and store as base64
                const fileBuffer = await fs.readFile(uploadedFile.path);
                const base64File = fileBuffer.toString('base64');
                
                if (fileType === 'pdf') {
                    checklistData.content = `PDF_BASE64:${uploadedFile.filename}:${base64File}`;
                } else if (fileType === 'zip') {
                    checklistData.content = `ZIP_BASE64:${uploadedFile.filename}:${base64File}`;
                }
                
                console.log(`${fileType.toUpperCase()} stored as base64, length:`, base64File.length);
                
                // Clean up the temporary file
                try {
                    await fs.unlink(uploadedFile.path);
                    console.log('Temp file cleaned up');
                } catch (err) {
                    console.error('Failed to clean up temp file:', err);
                }
            } else {
                // Local development - store file reference
                console.log('Development environment, storing file reference');
                
                if (fileType === 'pdf') {
                    checklistData.content = `PDF File: ${uploadedFile.filename}`;
                } else if (fileType === 'zip') {
                    checklistData.content = `ZIP File: ${uploadedFile.filename}`;
                }
                
                // Create a markdown placeholder
                const fileTypeLabel = fileType === 'zip' ? 'ZIP Package' : 'PDF Document';
                const mdContent = `# ${title}\n\n${description}\n\n[Download ${fileTypeLabel}](${uploadedFile.filename})\n\n## Features\n${featureList.map(f => `- ${f}`).join('\n')}`;
                const mdFilename = uploadedFile.filename.replace(/\.(pdf|zip)$/, '.md');
                await fs.writeFile(path.join(__dirname, 'uploads', mdFilename), mdContent);
            }
        }
        
        console.log('Creating checklist with data:', {
            ...checklistData,
            content: checklistData.content?.substring(0, 50) + '...' // Log only first 50 chars
        });
        
        // Create checklist in database using the PostgreSQL function
        const checklistId = await createChecklist(checklistData);
        
        console.log('Checklist created with ID:', checklistId);
        
        res.json({ 
            success: true,
            id: checklistId, 
            message: 'Checklist created successfully',
            filename: uploadedFile ? uploadedFile.filename : null,
            fileType: fileType
        });
    } catch (error) {
        console.error('Error creating checklist:', error);
        console.error('Error stack:', error.stack);
        
        // Clean up uploaded files if database operation failed
        if (req.files) {
            const allFiles = Object.values(req.files).flat();
            for (const file of allFiles) {
                try {
                    await fs.unlink(file.path);
                    console.log('Cleaned up uploaded file:', file.filename);
                } catch (unlinkError) {
                    console.error('Failed to clean up file:', unlinkError);
                }
            }
        }
        res.status(500).json({ error: error.message || 'Failed to create checklist' });
    }
});

// Update checklist - FIXED FOR POSTGRESQL
router.put('/checklists/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    try {
        // Use the existing updateChecklist function from database.js
        await updateChecklist(id, updates);
        res.json({ message: 'Checklist updated successfully' });
    } catch (error) {
        console.error('Error updating checklist:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete checklist - FIXED FOR POSTGRESQL
router.delete('/checklists/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Use the existing deleteChecklist function from database.js
        await deleteChecklist(id);
        res.json({ message: 'Checklist deleted successfully' });
    } catch (error) {
        console.error('Error deleting checklist:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add checklist item - FIXED FOR POSTGRESQL
router.post('/checklists/:id/items', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { phase, text, order_index, is_required } = req.body;
    
    try {
        await pool.query(
            `INSERT INTO checklist_items (checklist_id, phase, item_text, item_order, is_required) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id, phase, text, order_index || 0, is_required || false]
        );
        
        res.json({ message: 'Item added successfully' });
    } catch (error) {
        console.error('Error adding checklist item:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upload file for existing checklist - UPDATED FOR PDF AND ZIP
router.post('/checklists/:id/upload-file', adminAuth, upload.fields([
    { name: 'pdfFile', maxCount: 1 },
    { name: 'zipFile', maxCount: 1 }
]), async (req, res) => {
    const { id } = req.params;
    
    try {
        let uploadedFile = null;
        let fileType = null;
        
        // Check which type of file was uploaded
        if (req.files && req.files.pdfFile && req.files.pdfFile[0]) {
            uploadedFile = req.files.pdfFile[0];
            fileType = 'pdf';
        } else if (req.files && req.files.zipFile && req.files.zipFile[0]) {
            uploadedFile = req.files.zipFile[0];
            fileType = 'zip';
        }
        
        if (!uploadedFile) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        let content;
        
        // If production environment, store as base64
        if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
            const fileBuffer = await fs.readFile(uploadedFile.path);
            const base64File = fileBuffer.toString('base64');
            
            if (fileType === 'pdf') {
                content = `PDF_BASE64:${uploadedFile.filename}:${base64File}`;
            } else if (fileType === 'zip') {
                content = `ZIP_BASE64:${uploadedFile.filename}:${base64File}`;
            }
            
            // Clean up temp file
            await fs.unlink(uploadedFile.path);
        } else {
            if (fileType === 'pdf') {
                content = `PDF File: ${uploadedFile.filename}`;
            } else if (fileType === 'zip') {
                content = `ZIP File: ${uploadedFile.filename}`;
            }
        }
        
        // Update the database to reference the new file
        await pool.query(
            `UPDATE checklists 
             SET content = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [content, id]
        );
        
        res.json({ 
            message: `${fileType.toUpperCase()} uploaded successfully`,
            filename: uploadedFile.filename,
            fileType: fileType
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        
        // Clean up uploaded files on error
        if (req.files) {
            const allFiles = Object.values(req.files).flat();
            for (const file of allFiles) {
                try {
                    await fs.unlink(file.path);
                } catch (unlinkError) {
                    console.error('Failed to clean up file:', unlinkError);
                }
            }
        }
        res.status(500).json({ error: error.message });
    }
});

// Get download analytics - FIXED FOR POSTGRESQL
router.get('/analytics/downloads', adminAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.title,
                COUNT(d.id) as download_count,
                COUNT(DISTINCT d.ip_address) as unique_downloads
            FROM checklists c
            LEFT JOIN downloads d ON c.id = d.checklist_id
            GROUP BY c.id, c.title
            ORDER BY download_count DESC
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
