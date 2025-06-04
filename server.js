require('dotenv').config();
// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const markdownPdf = require('markdown-pdf');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database
const { 
    initializeDatabase, 
    getAllChecklists, 
    getChecklist, 
    createChecklist,
    incrementDownloads,
    getStats,
    getChecklistsByCategory,
    getCategories
} = require('./database');

// Initialize database on startup
initializeDatabase().then(() => {
    console.log('Database initialized');
}).catch(err => {
    console.error('Failed to initialize database:', err);
});

// Serve static files
app.use(express.static('public'));

// Serve uploaded checklists (PDFs and other files)
app.use('/checklists', express.static(path.join(__dirname, 'checklists')));

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes

// Get all checklists
app.get('/api/checklists', async (req, res) => {
    try {
        const checklists = await getAllChecklists();
        res.json(checklists);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single checklist
app.get('/api/checklists/:id', async (req, res) => {
    try {
        const checklist = await getChecklist(req.params.id);
        if (!checklist) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        res.json(checklist);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get checklists by category
app.get('/api/categories/:category/checklists', async (req, res) => {
    try {
        const checklists = await getChecklistsByCategory(req.params.category);
        res.json(checklists);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all categories
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await getCategories();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download checklist
app.get('/api/checklists/:id/download/:format', async (req, res) => {
    const { id, format } = req.params;
    
    try {
        const checklist = await getChecklist(id);
        
        if (!checklist || !checklist.data) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        
        const title = checklist.data.title;
        const content = checklist.data.content;
        
        // Log the checklist data for debugging
        console.log('Download request for checklist:', id, 'format:', format);
        console.log('Content type:', content ? content.substring(0, 50) + '...' : 'No content');
        
        // Check if this is a PDF upload
        if (format === 'pdf' && content) {
            // Check for base64 encoded PDF (production)
            if (content.startsWith('PDF_BASE64:')) {
                const parts = content.split(':');
                const filename = parts[1];
                const base64Data = parts[2];
                
                console.log('Serving base64 PDF:', filename);
                
                // Log download
                const ipAddress = req.ip || req.connection.remoteAddress;
                const userAgent = req.get('User-Agent');
                await incrementDownloads(id, format, ipAddress, userAgent);
                
                // Convert base64 to buffer
                const pdfBuffer = Buffer.from(base64Data, 'base64');
                
                // Set headers and send
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.setHeader('Content-Length', pdfBuffer.length);
                return res.send(pdfBuffer);
            }
            // Check for file-based PDF (local development)
            else if (content.startsWith('PDF File:')) {
                // Extract filename from content
                const pdfFilename = content.replace('PDF File: ', '').trim();
                const pdfPath = path.join(__dirname, 'checklists', pdfFilename);
                
                console.log('Looking for PDF file at:', pdfPath);
                
                // Check if PDF file exists
                try {
                    await fs.access(pdfPath);
                    
                    // Log download
                    const ipAddress = req.ip || req.connection.remoteAddress;
                    const userAgent = req.get('User-Agent');
                    await incrementDownloads(id, format, ipAddress, userAgent);
                    
                    // Set proper headers for PDF download
                    res.setHeader('Content-Type', 'application/pdf');
                    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(pdfFilename)}"`);
                    
                    // Send the actual PDF file
                    return res.sendFile(pdfPath);
                } catch (err) {
                    console.error('PDF file not found:', pdfPath);
                    console.error('Error:', err);
                    // Fall back to generating PDF from markdown
                }
            }
        }
        
        // Log download for generated files
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');
        await incrementDownloads(id, format, ipAddress, userAgent);
        
        // For non-PDF or when PDF file doesn't exist, generate from markdown
        if (format === 'pdf') {
            const markdownContent = generateMarkdown(checklist);
            
            markdownPdf().from.string(markdownContent).to.buffer((err, buffer) => {
                if (err) {
                    console.error('PDF generation error:', err);
                    res.status(500).json({ error: 'Failed to generate PDF' });
                    return;
                }
                
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${title.toLowerCase().replace(/\s+/g, '-')}-checklist.pdf"`);
                res.send(buffer);
            });
        } else if (format === 'markdown') {
            const markdownContent = generateMarkdown(checklist);
            res.setHeader('Content-Type', 'text/markdown');
            res.setHeader('Content-Disposition', `attachment; filename="${title.toLowerCase().replace(/\s+/g, '-')}-checklist.md"`);
            res.send(markdownContent);
        } else if (format === 'excel') {
            // Implement Excel generation here
            res.status(501).json({ error: 'Excel format not yet implemented' });
        } else {
            res.status(400).json({ error: 'Invalid format' });
        }
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download checklist' });
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin routes
const adminRoutes = require('./admin-routes');
app.use('/api/admin', adminRoutes);

// Contribution routes
const { router: contributionRoutes, createContributionsTable } = require('./contributions');
app.use('/api/contributions', contributionRoutes);

// Initialize contributions table
createContributionsTable().then(() => {
    console.log('Contributions table ready');
}).catch(err => {
    console.error('Failed to create contributions table:', err);
});

// Admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Helper function to generate markdown from checklist data
function generateMarkdown(checklist) {
    const { data, features, items } = checklist;
    let markdown = `# ${data.title}\n\n`;
    markdown += `${data.description}\n\n`;
    markdown += `**Version:** ${data.version || '1.0'}\n`;
    markdown += `**Category:** ${data.category || 'General'}\n\n`;
    
    if (features && features.length > 0) {
        markdown += `## Features\n\n`;
        features.forEach(feature => {
            markdown += `- ${feature}\n`;
        });
        markdown += '\n';
    }
    
    if (items && items.length > 0) {
        let currentPhase = '';
        items.forEach(item => {
            if (item.phase !== currentPhase) {
                currentPhase = item.phase;
                markdown += `## ${currentPhase}\n\n`;
            }
            markdown += `- [${item.is_required ? 'x' : ' '}] ${item.item_text}\n`;
        });
    }
    
    if (data.content && !data.content.startsWith('PDF File:')) {
        markdown += `\n## Additional Information\n\n${data.content}\n`;
    }
    
    return markdown;
}

// Temporary debug routes (remove in production)
app.get('/api/debug/db', async (req, res) => {
    try {
        const stats = await getStats();
        const checklists = await getAllChecklists();
        res.json({
            database: process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite',
            stats,
            checklistCount: checklists.length,
            firstChecklist: checklists[0] || null
        });
    } catch (error) {
        res.json({ error: error.message, stack: error.stack });
    }
});

// Test endpoint to verify deployment
app.get('/api/version', (req, res) => {
    res.json({ 
        version: '2.0',
        message: 'API is working correctly',
        timestamp: new Date().toISOString()
    });
});

// Temporary debug endpoint
app.get('/api/debug', async (req, res) => {
    try {
        const stats = await getStats();
        const checklists = await getAllChecklists();
        const categories = await getCategories();
        
        // Get raw database info
        const { pool } = require('./database');
        const rawCount = await pool.query('SELECT COUNT(*) FROM checklists');
        const rawChecklists = await pool.query('SELECT id, title, category, created_at FROM checklists ORDER BY id DESC LIMIT 5');
        
        res.json({
            database: 'PostgreSQL',
            stats,
            checklistCount: checklists.length,
            categories,
            rawCount: rawCount.rows[0].count,
            recentChecklists: rawChecklists.rows,
            firstChecklist: checklists[0] || null
        });
    } catch (error) {
        res.json({ 
            error: error.message, 
            stack: error.stack,
            database: 'Error connecting'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin`);
});
