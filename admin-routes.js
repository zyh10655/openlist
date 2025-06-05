// admin-routes.js - FIXED FOR POSTGRESQL
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

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const dir = path.join(__dirname, 'checklists');
        try {
            await fs.mkdir(dir, { recursive: true });
            cb(null, dir);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        // Keep the original filename if it's a PDF
        if (file.originalname.endsWith('.pdf')) {
            cb(null, file.originalname);
        } else {
            // Generate filename based on title for non-PDF files
            const title = req.body.title || 'checklist';
            const cleanTitle = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const filename = `${cleanTitle}-v1.0.pdf`;
            cb(null, filename);
        }
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
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

// Create new checklist
router.post('/checklists', adminAuth, upload.single('pdfFile'), async (req, res) => {
    try {
        console.log('Received request body:', req.body);
        console.log('Received file:', req.file);
        
        const { title, description, icon, category, features } = req.body;
        
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
            content: req.body.content || '',
            features: featureList,
            items: [] // No items for PDF uploads
        };
        
        // If PDF was uploaded and we're on Render (production)
        if (req.file && (process.env.NODE_ENV === 'production' || process.env.RENDER)) {
            console.log('Production environment detected, storing PDF as base64');
            
            // Read the file and store as base64
            const fileBuffer = await fs.readFile(req.file.path);
            const base64File = fileBuffer.toString('base64');
            checklistData.content = `PDF_BASE64:${req.file.filename}:${base64File}`;
            
            console.log('PDF stored as base64, length:', base64File.length);
            
            // Clean up the temporary file
            try {
                await fs.unlink(req.file.path);
                console.log('Temp file cleaned up');
            } catch (err) {
                console.error('Failed to clean up temp file:', err);
            }
        } else if (req.file) {
            // Local development - store file reference
            console.log('Development environment, storing file reference');
            checklistData.content = `PDF File: ${req.file.filename}`;
            
            // Also create a markdown placeholder
            const mdContent = `# ${title}\n\n${description}\n\n[Download PDF Version](${req.file.filename})\n\n## Features\n${featureList.map(f => `- ${f}`).join('\n')}`;
            const mdFilename = req.file.filename.replace('.pdf', '.md');
            await fs.writeFile(path.join(__dirname, 'checklists', mdFilename), mdContent);
        }
        
        console.log('Creating checklist with data:', {
            ...checklistData,
            content: checklistData.content?.substring(0, 50) + '...' // Log only first 50 chars
        });
        
        // Create checklist in database using the PostgreSQL function
        const checklistId = await createChecklist(checklistData);
        
        console.log('Checklist created with ID:', checklistId);
        
        res.json({ 
            id: checklistId, 
            message: 'Checklist created successfully',
            filename: req.file ? req.file.filename : null
        });
    } catch (error) {
        console.error('Error creating checklist:', error);
        console.error('Error stack:', error.stack);
        
        // Clean up uploaded file if database operation failed
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
                console.log('Cleaned up uploaded file');
            } catch (unlinkError) {
                console.error('Failed to clean up file:', unlinkError);
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

// Upload PDF for existing checklist - FIXED FOR POSTGRESQL
router.post('/checklists/:id/upload-pdf', adminAuth, upload.single('pdfFile'), async (req, res) => {
    const { id } = req.params;
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }
        
        let content;
        
        // If production environment, store as base64
        if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
            const fileBuffer = await fs.readFile(req.file.path);
            const base64File = fileBuffer.toString('base64');
            content = `PDF_BASE64:${req.file.filename}:${base64File}`;
            
            // Clean up temp file
            await fs.unlink(req.file.path);
        } else {
            content = `PDF File: ${req.file.filename}`;
        }
        
        // Update the database to reference the new PDF
        await pool.query(
            `UPDATE checklists 
             SET content = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [content, id]
        );
        
        res.json({ 
            message: 'PDF uploaded successfully',
            filename: req.file.filename 
        });
    } catch (error) {
        console.error('Error uploading PDF:', error);
        
        // Clean up uploaded file on error
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Failed to clean up file:', unlinkError);
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
