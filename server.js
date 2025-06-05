// server.js
// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const markdownpdf = require('markdown-pdf');
const { 
    initializeDatabase, 
    getAllChecklists, 
    getChecklist, 
    createChecklist,
    incrementDownloads,
    getStats,
    searchChecklists,
    getCategories,
    getChecklistsByCategory,
    pool
} = require('./database');

const app = express();
const PORT = process.env.PORT || 10000;

// CORS configuration
// app.use(cors());
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes - IMPORTANT: These must come before static file serving

// Get all checklists
app.get('/api/checklists', async (req, res) => {
    try {
        const checklists = await getAllChecklists();
        console.log('API: Fetching all checklists, count:', checklists.length);
        
        // Transform database results to match frontend expectations
        const formattedChecklists = checklists.map(checklist => ({
            id: checklist.id,
            title: checklist.title,
            description: checklist.description,
            icon: checklist.icon || '📋',
            version: checklist.version,
            lastUpdated: new Date(checklist.updated_at).toLocaleDateString(),
            downloads: checklist.downloads,
            contributors: checklist.contributors || 1,
            category: checklist.category,
            formats: checklist.formats ? checklist.formats.split(',').reduce((acc, format) => {
                acc[format] = true;
                return acc;
            }, {}) : { pdf: true, markdown: true, excel: true },
            features: []
        }));
        
        res.json(formattedChecklists);
    } catch (error) {
        console.error('Error fetching checklists:', error);
        res.status(500).json({ error: 'Failed to fetch checklists' });
    }
});

// Download checklist - MUST BE BEFORE :id route
app.get('/api/checklists/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const { format } = req.query;
        
        // Get checklist from database
        const checklist = await Checklist.findByPk(id);
        if (!checklist) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        
        // Handle ZIP files
        if (checklist.content && checklist.content.startsWith('ZIP_BASE64:')) {
            const base64Data = checklist.content.replace('ZIP_BASE64:', '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${checklist.title.toLowerCase().replace(/\s+/g, '-')}-v${checklist.version}.zip"`);
            res.setHeader('Content-Length', buffer.length);
            
            return res.send(buffer);
        }
        
        // Handle PDF files
        if (checklist.content && checklist.content.startsWith('PDF_BASE64:')) {
            const base64Data = checklist.content.replace('PDF_BASE64:', '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${checklist.title.toLowerCase().replace(/\s+/g, '-')}-v${checklist.version}.pdf"`);
            res.setHeader('Content-Length', buffer.length);
            
            return res.send(buffer);
        }
        
        // Handle regular markdown content
        if (format === 'pdf') {
            // Generate PDF from markdown (your existing code)
            const pdf = await generatePDFFromMarkdown(checklist.content);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${checklist.title.toLowerCase().replace(/\s+/g, '-')}-v${checklist.version}.pdf"`);
            return res.send(pdf);
        }
        
        if (format === 'markdown') {
            res.setHeader('Content-Type', 'text/markdown');
            res.setHeader('Content-Disposition', `attachment; filename="${checklist.title.toLowerCase().replace(/\s+/g, '-')}-v${checklist.version}.md"`);
            return res.send(checklist.content);
        }
        
        // Default to PDF
        const pdf = await generatePDFFromMarkdown(checklist.content);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${checklist.title.toLowerCase().replace(/\s+/g, '-')}-v${checklist.version}.pdf"`);
        res.send(pdf);
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});
// Get single checklist details
app.get('/api/checklists/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await getChecklist(id);
        
        if (!result) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        
        // Transform to match frontend expectations
        const checklist = {
            id: result.data.id,
            title: result.data.title,
            description: result.data.description,
            icon: result.data.icon || '📋',
            version: result.data.version,
            lastUpdated: new Date(result.data.updated_at).toLocaleDateString(),
            downloads: result.data.downloads,
            features: result.features,
            items: result.items,
            formats: { pdf: true, markdown: true, excel: true }
        };
        
        res.json(checklist);
    } catch (error) {
        console.error('Error fetching checklist:', error);
        res.status(500).json({ error: 'Failed to fetch checklist' });
    }
});

// Get stats
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Search checklists
app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.json([]);
        }
        
        const results = await searchChecklists(q);
        
        // Transform results
        const formattedResults = results.map(checklist => ({
            id: checklist.id,
            title: checklist.title,
            description: checklist.description,
            icon: checklist.icon || '📋',
            version: checklist.version,
            lastUpdated: new Date(checklist.updated_at).toLocaleDateString(),
            downloads: checklist.downloads,
            contributors: checklist.contributors || 1,
            category: checklist.category,
            formats: { pdf: true, markdown: true, excel: true },
            features: []
        }));
        
        res.json(formattedResults);
    } catch (error) {
        console.error('Error searching checklists:', error);
        res.status(500).json({ error: 'Failed to search checklists' });
    }
});

// Get categories
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await getCategories();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Test endpoint
app.get('/api/version', (req, res) => {
    res.json({ 
        version: '2.0',
        message: 'API is working correctly',
        timestamp: new Date().toISOString()
    });
});

// Debug endpoints
app.get('/api/debug', async (req, res) => {
    try {
        const stats = await getStats();
        const checklists = await getAllChecklists();
        const categories = await getCategories();
        
        res.json({
            database: 'PostgreSQL',
            stats,
            checklistCount: checklists.length,
            categories,
            recentChecklists: checklists.slice(0, 5).map(c => ({
                id: c.id,
                title: c.title,
                category: c.category,
                created_at: c.created_at
            }))
        });
    } catch (error) {
        res.json({ 
            error: error.message, 
            stack: error.stack,
            database: 'Error connecting'
        });
    }
});

app.get('/api/debug/checklist/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await getChecklist(id);
        
        if (!result) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        
        const contentInfo = result.data.content ? {
            type: result.data.content.startsWith('PDF_BASE64:') ? 'Base64 PDF' : 
                  result.data.content.startsWith('PDF File:') ? 'File Reference' : 'Other',
            length: result.data.content.length,
            preview: result.data.content.substring(0, 100) + '...'
        } : { type: 'No content' };
        
        res.json({
            id: result.data.id,
            title: result.data.title,
            content: contentInfo,
            features: result.features,
            items: result.items,
            hasContent: !!result.data.content
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.get('/api/test-download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await getChecklist(id);
        
        if (!result || !result.data.content) {
            return res.status(404).json({ error: 'No content found' });
        }
        
        const content = result.data.content;
        
        if (content.startsWith('PDF_BASE64:')) {
            const parts = content.split(':');
            const filename = parts[1];
            const base64Data = parts[2];
            
            try {
                const buffer = Buffer.from(base64Data, 'base64');
                const isValidPDF = buffer.slice(0, 5).toString() === '%PDF-';
                
                res.json({
                    filename,
                    base64Length: base64Data.length,
                    bufferSize: buffer.length,
                    isValidPDF,
                    firstBytes: buffer.slice(0, 10).toString('hex')
                });
            } catch (error) {
                res.json({ error: 'Invalid base64 data', details: error.message });
            }
        } else {
            res.json({ error: 'Content is not base64 PDF' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Static files - AFTER API routes
app.use(express.static(path.join(__dirname, 'public')));

// Admin routes
const adminRoutes = require('./admin-routes');
app.use('/admin', adminRoutes);
// Contribution routes (only add once!)

const { router: contributionRoutes, createContributionsTable } = require('./contributions');
app.use('/api/contributions', contributionRoutes);

// Initialize contributions table
createContributionsTable().then(() => {
    console.log('Contributions table ready');
}).catch(err => {
    console.error('Failed to create contributions table:', err);
});
// Serve admin dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
// Catch-all route - MUST BE LAST
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Route not found' });
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Initialize database on startup
initializeDatabase().then(async () => {
    console.log('Database initialized successfully');
    
    // Auto-seed if database is empty
    const checklists = await getAllChecklists();
    if (checklists.length === 0 && process.env.AUTO_SEED === 'true') {
        console.log('Empty database detected. Running seed...');
        const { seedChecklists } = require('./seed-checklists');
        for (const checklist of seedChecklists) {
            try {
                await createChecklist(checklist);
                console.log(`Seeded: ${checklist.title}`);
            } catch (error) {
                console.error(`Failed to seed ${checklist.title}:`, error);
            }
        }
    }
}).catch(err => {
    console.error('Database initialization failed:', err);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
