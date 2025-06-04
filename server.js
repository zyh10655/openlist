const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const { 
    initializeDatabase, 
    getAllChecklists, 
    getChecklist, 
    incrementDownloads, 
    getStats,
    searchChecklists,
    getCategories,
    getChecklistsByCategory
} = require('./database');

// Try to load markdown-pdf for on-demand conversion
let markdownpdf;
try {
    markdownpdf = require('markdown-pdf');
} catch (e) {
    console.log('Note: markdown-pdf not installed. PDF generation disabled.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database on startup
initializeDatabase().then(() => {
    console.log('Database initialized successfully');
}).catch(err => {
    console.error('Database initialization failed:', err);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/checklists', express.static(path.join(__dirname, 'checklists')));

// Admin routes
const adminRoutes = require('./admin-routes');
app.use('/api/admin', adminRoutes);

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

// API Routes
app.get('/api/checklists', async (req, res) => {
    try {
        const checklists = await getAllChecklists();
        
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
            formats: checklist.formats ? checklist.formats.split(',').reduce((acc, format) => {
                acc[format] = true;
                return acc;
            }, {}) : { pdf: true, markdown: true, excel: true },
            features: [] // Will be loaded when viewing individual checklist
        }));
        
        res.json(formattedChecklists);
    } catch (error) {
        console.error('Error fetching checklists:', error);
        res.status(500).json({ error: 'Failed to fetch checklists' });
    }
});

// Get single checklist
app.get('/api/checklists/:id', async (req, res) => {
    try {
        const checklist = await getChecklist(req.params.id);
        if (!checklist) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        
        res.json({
            id: checklist.data.id,
            title: checklist.data.title,
            description: checklist.data.description,
            icon: checklist.data.icon,
            version: checklist.data.version,
            features: checklist.features,
            items: checklist.items,
            formats: checklist.formats
        });
    } catch (error) {
        console.error('Error fetching checklist:', error);
        res.status(500).json({ error: 'Failed to fetch checklist' });
    }
});

// Search checklists
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.json([]);
        }
        
        const results = await searchChecklists(query);
        
        // Format results to match frontend expectations
        const formattedResults = results.map(checklist => ({
            id: checklist.id,
            title: checklist.title,
            description: checklist.description,
            icon: checklist.icon || '📋',
            version: checklist.version,
            lastUpdated: new Date(checklist.updated_at).toLocaleDateString(),
            downloads: checklist.downloads,
            contributors: checklist.contributors || 1,
            formats: { pdf: true, markdown: true, excel: true }
        }));
        
        res.json(formattedResults);
    } catch (error) {
        console.error('Error searching checklists:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Stats endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.json({
            totalChecklists: 0,
            totalDownloads: 0,
            totalContributors: 0,
            updateFrequency: 'Unknown'
        });
    }
});

// Get categories
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await getCategories();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.json([]);
    }
});

// Get checklists by category
app.get('/api/checklists/category/:category', async (req, res) => {
    try {
        const checklists = await getChecklistsByCategory(req.params.category);
        
        // Format the response
        const formattedChecklists = checklists.map(checklist => ({
            id: checklist.id,
            title: checklist.title,
            description: checklist.description,
            icon: checklist.icon || '📋',
            version: checklist.version,
            lastUpdated: new Date(checklist.updated_at).toLocaleDateString(),
            downloads: checklist.downloads,
            contributors: checklist.contributors || 1,
            formats: checklist.formats ? checklist.formats.split(',').reduce((acc, format) => {
                acc[format] = true;
                return acc;
            }, {}) : { pdf: true, markdown: true, excel: true }
        }));
        
        res.json(formattedChecklists);
    } catch (error) {
        console.error('Error fetching checklists by category:', error);
        res.json([]);
    }
});

// Download endpoint
app.get('/api/download/:id/:format', async (req, res) => {
    const { id, format } = req.params;
    const checklistId = parseInt(id);
    
    try {
        // Get checklist from database
        const checklist = await getChecklist(checklistId);
        if (!checklist || !checklist.data) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        
        // Log download
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('user-agent');
        await incrementDownloads(checklistId, format, ipAddress, userAgent);
        
        // Generate filename
        // Change 2:Remove the version number
        const filename = `${checklist.data.title.toLowerCase().replace(/\s+/g, '-')}.${format}`;
        // const filename = `${checklist.data.title.toLowerCase().replace(/\s+/g, '-')}-v${checklist.data.version}.${format}`;
        const filePath = path.join(__dirname, 'checklists', filename);
        
        try {
            // Check if file exists
            await fs.access(filePath);
            
            // Set appropriate headers
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            // Set content type based on format
            const contentTypes = {
                pdf: 'application/pdf',
                markdown: 'text/markdown',
                md: 'text/markdown',
                excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                csv: 'text/csv',
                fig: 'application/octet-stream'
            };
            
            const ext = path.extname(filename).slice(1);
            res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
            
            // Send file
            res.sendFile(filePath);
            
        } catch (error) {
            console.error('File not found:', filePath);
            
            // Try to generate PDF from markdown if it's a PDF request
            if (format.toLowerCase() === 'pdf' && markdownpdf) {
                const mdFilename = filename.replace('.pdf', '.md');
                const mdPath = path.join(__dirname, 'checklists', mdFilename);
                
                try {
                    await fs.access(mdPath);
                    console.log('Generating PDF from markdown...');
                    
                    // Generate PDF on the fly
                    const pdfPath = filePath;
                    await new Promise((resolve, reject) => {
                        markdownpdf()
                            .from(mdPath)
                            .to(pdfPath, function (err) {
                                if (err) reject(err);
                                else resolve();
                            });
                    });
                    
                    // Now send the generated PDF
                    res.sendFile(pdfPath);
                    return;
                } catch (mdError) {
                    console.error('Markdown file not found or PDF generation failed');
                }
            }
            
            // If all else fails, generate content from database
            const content = await generateChecklistFromDB(checklist, format);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'text/plain');
            res.send(content);
        }
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Generate checklist content from database
async function generateChecklistFromDB(checklist, format) {
    const { data, features, items } = checklist;
    
    let content = `# ${data.title}\n\n`;
    content += `${data.description}\n\n`;
    content += `Version: ${data.version}\n\n`;
    
    // Add disclaimer
    content += `## ⚠️ IMPORTANT DISCLAIMER\n\n`;
    content += `This checklist is for informational purposes only and does not constitute professional advice. `;
    content += `Laws and regulations vary by location. Always consult with qualified professionals for your specific situation.\n\n`;
    
    // Add features
    if (features && features.length > 0) {
        content += `## What's Included:\n\n`;
        features.forEach(feature => {
            content += `- ${feature}\n`;
        });
        content += '\n';
    }
    
    // Add checklist items by phase
    if (items && items.length > 0) {
        const phases = {};
        items.forEach(item => {
            if (!phases[item.phase]) {
                phases[item.phase] = [];
            }
            phases[item.phase].push(item);
        });
        
        Object.entries(phases).forEach(([phase, phaseItems]) => {
            content += `## ${phase}\n\n`;
            phaseItems.forEach(item => {
                const prefix = item.is_required ? '☐' : '○';
                content += `${prefix} ${item.item_text}\n`;
            });
            content += '\n';
        });
    }
    
    // Add footer
    content += `---\n\n`;
    content += `Made with ❤️ by the OpenChecklist Community\n`;
    content += `Licensed under CC BY 4.0 - Free to use, modify, and share\n`;
    
    return content;
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`OpenChecklist server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to view the site`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
});

// Create necessary directories on startup
const setupDirectories = async () => {
    try {
        await fs.mkdir(path.join(__dirname, 'checklists'), { recursive: true });
        await fs.mkdir(path.join(__dirname, 'public'), { recursive: true });
        console.log('Directories verified/created successfully');
    } catch (error) {
        console.error('Error creating directories:', error);
    }
};

setupDirectories();