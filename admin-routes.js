// admin-routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { 
    createChecklist, 
    db,
    getAllChecklists 
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
        // Generate filename based on title
        const title = req.body.title || 'checklist';
        const cleanTitle = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const filename = `${cleanTitle}.pdf`;
        cb(null, filename);
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
            // content: req.file ? `PDF File: ${req.file.filename}` : (req.body.content || ''),
            content: req.file ? `PDF File: ${title}` : (req.body.content || ''),
            features: featureList,
            items: [] // No items for PDF uploads
        };
        
        console.log('Creating checklist with data:', checklistData);
        
        // Create checklist in database
        const checklistId = await createChecklist(checklistData);
        
        console.log('Checklist created with ID:', checklistId);
        
        // If PDF was uploaded, also create a markdown placeholder
        if (req.file) {
            const mdContent = `# ${title}\n\n${description}\n\n[Download PDF Version](${req.file.filename})\n\n## Features\n${featureList.map(f => `- ${f}`).join('\n')}`;
            const mdFilename = req.file.filename.replace('.pdf', '.md');
            await fs.writeFile(path.join(__dirname, 'checklists', mdFilename), mdContent);
            console.log('Markdown file created:', mdFilename);
        }
        
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

// Update checklist
router.put('/checklists/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    try {
        await new Promise((resolve, reject) => {
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(id);
            
            db.run(
                `UPDATE checklists SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                values,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Checklist updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete checklist
router.delete('/checklists/:id', adminAuth, async (req, res) => {
    const { id } = req.params;
    
    try {
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                // Delete related data first
                db.run('DELETE FROM checklist_items WHERE checklist_id = ?', [id]);
                db.run('DELETE FROM features WHERE checklist_id = ?', [id]);
                db.run('DELETE FROM formats WHERE checklist_id = ?', [id]);
                db.run('DELETE FROM download_logs WHERE checklist_id = ?', [id]);
                
                // Delete checklist
                db.run('DELETE FROM checklists WHERE id = ?', [id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
        
        res.json({ message: 'Checklist deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add checklist item
router.post('/checklists/:id/items', adminAuth, async (req, res) => {
    const { id } = req.params;
    const { phase, text, order_index, is_required } = req.body;
    
    try {
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO checklist_items (checklist_id, phase, item_text, order_index, is_required) 
                 VALUES (?, ?, ?, ?, ?)`,
                [id, phase, text, order_index, is_required ? 1 : 0],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        res.json({ message: 'Item added successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload PDF for existing checklist
router.post('/checklists/:id/upload-pdf', adminAuth, upload.single('pdfFile'), async (req, res) => {
    const { id } = req.params;
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }
        
        // Update the database to reference the new PDF
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE checklists SET content = ?, version = version + 0.1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [`PDF File: ${req.file.filename}`, id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        res.json({ 
            message: 'PDF uploaded successfully',
            filename: req.file.filename 
        });
    } catch (error) {
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

// Get download analytics
router.get('/analytics/downloads', adminAuth, async (req, res) => {
    try {
        const stats = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    c.title,
                    COUNT(d.id) as download_count,
                    COUNT(DISTINCT d.ip_address) as unique_downloads
                FROM checklists c
                LEFT JOIN download_logs d ON c.id = d.checklist_id
                GROUP BY c.id
                ORDER BY download_count DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;