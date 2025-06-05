// database.js - PostgreSQL version with ZIP support
const pool = require('./database-config');

// Initialize database tables
async function initializeDatabase() {
    try {
        // Create tables with PostgreSQL syntax
        await pool.query(`
            CREATE TABLE IF NOT EXISTS checklists (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                icon VARCHAR(10) DEFAULT '📋',
                version VARCHAR(20) DEFAULT '1.0',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                downloads INTEGER DEFAULT 0,
                category VARCHAR(100),
                content TEXT,
                formats VARCHAR(255) DEFAULT 'pdf,markdown,excel',
                contributors INTEGER DEFAULT 1,
                is_featured BOOLEAN DEFAULT FALSE,
                file_url TEXT,
                file_type VARCHAR(10),
                file_name TEXT
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS checklist_features (
                id SERIAL PRIMARY KEY,
                checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE,
                feature TEXT NOT NULL
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS checklist_items (
                id SERIAL PRIMARY KEY,
                checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE,
                phase VARCHAR(255),
                item_text TEXT NOT NULL,
                is_required BOOLEAN DEFAULT FALSE,
                item_order INTEGER DEFAULT 0
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS downloads (
                id SERIAL PRIMARY KEY,
                checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE,
                format VARCHAR(20),
                ip_address VARCHAR(45),
                user_agent TEXT,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add file support columns to existing checklists table if they don't exist
        await addFileColumnsIfNeeded();

        console.log('PostgreSQL database initialized successfully');
        
        // Check if we need to add sample data
        const result = await pool.query('SELECT COUNT(*) FROM checklists');
        const count = parseInt(result.rows[0].count);
        
        if (count === 0) {
            console.log('Empty database detected. Adding sample checklists...');
            await createSampleChecklists();
        }
        
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

// Add file support columns if they don't exist (for existing databases)
async function addFileColumnsIfNeeded() {
    try {
        // Check if file_url column exists
        const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'checklists' AND column_name = 'file_url'
        `);
        
        if (columnCheck.rows.length === 0) {
            console.log('Adding file support columns to checklists table...');
            
            await pool.query(`
                ALTER TABLE checklists 
                ADD COLUMN IF NOT EXISTS file_url TEXT,
                ADD COLUMN IF NOT EXISTS file_type VARCHAR(10),
                ADD COLUMN IF NOT EXISTS file_name TEXT
            `);
            
            // Add index for better performance
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_checklists_file_type ON checklists(file_type)
            `);
            
            console.log('File support columns added successfully');
        }
    } catch (error) {
        console.error('Error adding file columns:', error);
        // Don't throw - this is just a migration, continue with initialization
    }
}

// Create sample checklists
async function createSampleChecklists() {
    const samples = [
        {
            title: "Restaurant Opening Checklist",
            description: "Complete guide for opening a new restaurant - from permits to grand opening",
            icon: "🍽️",
            category: "Food & Beverage",
            features: ["Legal compliance steps", "Kitchen setup guide", "Staff hiring checklist", "Marketing launch plan"],
            items: [
                { phase: "Planning", item_text: "Create detailed business plan", is_required: true },
                { phase: "Planning", item_text: "Secure funding and investors", is_required: true },
                { phase: "Legal", item_text: "Register business entity", is_required: true },
                { phase: "Legal", item_text: "Obtain business license", is_required: true },
                { phase: "Legal", item_text: "Get food service permits", is_required: true },
                { phase: "Setup", item_text: "Find and lease location", is_required: true },
                { phase: "Setup", item_text: "Design restaurant layout", is_required: false },
                { phase: "Setup", item_text: "Purchase kitchen equipment", is_required: true }
            ]
        },
        {
            title: "E-commerce Store Launch",
            description: "Step-by-step guide to launch your online store successfully",
            icon: "🛒",
            category: "Business",
            features: ["Platform selection guide", "Payment gateway setup", "SEO optimization tips", "Launch marketing strategy"],
            items: [
                { phase: "Setup", item_text: "Choose e-commerce platform", is_required: true },
                { phase: "Setup", item_text: "Purchase domain name", is_required: true },
                { phase: "Setup", item_text: "Design store layout", is_required: true },
                { phase: "Products", item_text: "Add product listings", is_required: true },
                { phase: "Products", item_text: "Write product descriptions", is_required: true },
                { phase: "Payment", item_text: "Set up payment gateway", is_required: true },
                { phase: "Launch", item_text: "Test checkout process", is_required: true },
                { phase: "Launch", item_text: "Create launch marketing campaign", is_required: false }
            ]
        },
        {
            title: "Mobile App Development",
            description: "Comprehensive checklist for developing and launching a mobile app",
            icon: "📱",
            category: "Technology",
            features: ["Platform requirements", "Development milestones", "Testing procedures", "App store submission"],
            items: [
                { phase: "Planning", item_text: "Define app requirements", is_required: true },
                { phase: "Planning", item_text: "Create wireframes", is_required: true },
                { phase: "Development", item_text: "Set up development environment", is_required: true },
                { phase: "Development", item_text: "Build core features", is_required: true },
                { phase: "Testing", item_text: "Perform unit testing", is_required: true },
                { phase: "Launch", item_text: "Submit to app stores", is_required: true }
            ]
        }
    ];
    
    for (const sample of samples) {
        try {
            await createChecklist(sample);
            console.log(`Created sample checklist: ${sample.title}`);
        } catch (error) {
            console.error(`Failed to create ${sample.title}:`, error);
        }
    }
}

// Get all checklists
async function getAllChecklists() {
    const result = await pool.query('SELECT * FROM checklists ORDER BY created_at DESC');
    return result.rows;
}

// Get single checklist with details
async function getChecklist(id) {
    try {
        const checklistResult = await pool.query('SELECT * FROM checklists WHERE id = $1', [id]);
        if (checklistResult.rows.length === 0) return null;

        const checklist = checklistResult.rows[0];
        
        const featuresResult = await pool.query(
            'SELECT feature FROM checklist_features WHERE checklist_id = $1',
            [id]
        );
        
        const itemsResult = await pool.query(
            'SELECT * FROM checklist_items WHERE checklist_id = $1 ORDER BY item_order',
            [id]
        );

        return {
            data: checklist,
            features: featuresResult.rows.map(f => f.feature),
            items: itemsResult.rows,
            formats: { pdf: true, markdown: true, excel: true }
        };
    } catch (error) {
        console.error('Error getting checklist:', error);
        throw error;
    }
}

// Create new checklist - UPDATED FOR FILE SUPPORT
async function createChecklist(data) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { 
            title, 
            description, 
            icon, 
            category, 
            content, 
            features, 
            items,
            fileUrl,
            fileType, 
            fileName 
        } = data;
        
        // Determine file info from content if not explicitly provided
        let finalFileUrl = fileUrl;
        let finalFileType = fileType;
        let finalFileName = fileName;
        
        // Extract file info from content if it's a file reference
        if (!fileUrl && content) {
            if (content.startsWith('PDF_BASE64:') || content.startsWith('PDF File:')) {
                finalFileType = 'pdf';
                const parts = content.split(':');
                if (parts.length > 1) {
                    finalFileName = parts[1];
                }
            } else if (content.startsWith('ZIP_BASE64:') || content.startsWith('ZIP File:')) {
                finalFileType = 'zip';
                const parts = content.split(':');
                if (parts.length > 1) {
                    finalFileName = parts[1];
                }
            }
        }
        
        // Insert main checklist
        const result = await client.query(
            `INSERT INTO checklists (
                title, 
                description, 
                icon, 
                category, 
                content,
                file_url,
                file_type,
                file_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
                title, 
                description, 
                icon || '📋', 
                category || 'Other', 
                content || '',
                finalFileUrl,
                finalFileType,
                finalFileName
            ]
        );
        
        const checklistId = result.rows[0].id;
        
        // Insert features
        if (features && features.length > 0) {
            for (const feature of features) {
                await client.query(
                    'INSERT INTO checklist_features (checklist_id, feature) VALUES ($1, $2)',
                    [checklistId, feature]
                );
            }
        }
        
        // Insert items
        if (items && items.length > 0) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                await client.query(
                    `INSERT INTO checklist_items (checklist_id, phase, item_text, is_required, item_order) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [checklistId, item.phase, item.item_text, item.is_required || false, i]
                );
            }
        }
        
        await client.query('COMMIT');
        return checklistId;
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating checklist:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Update checklist
async function updateChecklist(id, data) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { title, description, icon, category, content } = data;
        
        await client.query(
            `UPDATE checklists 
             SET title = $1, description = $2, icon = $3, category = $4, content = $5, updated_at = CURRENT_TIMESTAMP
             WHERE id = $6`,
            [title, description, icon, category, content, id]
        );
        
        // Update features if provided
        if (data.features) {
            await client.query('DELETE FROM checklist_features WHERE checklist_id = $1', [id]);
            
            for (const feature of data.features) {
                await client.query(
                    'INSERT INTO checklist_features (checklist_id, feature) VALUES ($1, $2)',
                    [id, feature]
                );
            }
        }
        
        // Update items if provided
        if (data.items) {
            await client.query('DELETE FROM checklist_items WHERE checklist_id = $1', [id]);
            
            for (let i = 0; i < data.items.length; i++) {
                const item = data.items[i];
                await client.query(
                    `INSERT INTO checklist_items (checklist_id, phase, item_text, is_required, item_order) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [id, item.phase, item.item_text, item.is_required || false, i]
                );
            }
        }
        
        await client.query('COMMIT');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating checklist:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Delete checklist - ALREADY FIXED
async function deleteChecklist(id) {
    try {
        console.log(`Deleting checklist ${id}`);
        
        // First: Delete downloads (child records)
        const downloadsResult = await pool.query(
            'DELETE FROM downloads WHERE checklist_id = $1',
            [id]
        );
        
        // Second: Delete checklist (parent record)  
        const checklistResult = await pool.query(
            'DELETE FROM checklists WHERE id = $1 RETURNING title',
            [id]
        );
        
        if (checklistResult.rowCount === 0) {
            throw new Error(`Checklist with id ${id} not found`);
        }
        
        const title = checklistResult.rows[0]?.title || 'Unknown';
        
        console.log(`Successfully deleted: ${downloadsResult.rowCount} downloads, 1 checklist`);
        
        return {
            success: true,
            message: `Checklist "${title}" deleted successfully`,
            deletedRows: {
                downloads: downloadsResult.rowCount,
                checklists: checklistResult.rowCount
            }
        };
        
    } catch (error) {
        console.error('Delete error:', error);
        throw error;
    }
}

// Increment download count
async function incrementDownloads(checklistId, format, ipAddress, userAgent) {
    await pool.query(
        'UPDATE checklists SET downloads = downloads + 1 WHERE id = $1',
        [checklistId]
    );
    
    await pool.query(
        'INSERT INTO downloads (checklist_id, format, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
        [checklistId, format, ipAddress || 'unknown', userAgent || 'unknown']
    );
}

// Get statistics
async function getStats() {
    const result = await pool.query(`
        SELECT 
            COUNT(*) as total_checklists,
            COALESCE(SUM(downloads), 0) as total_downloads,
            COALESCE(SUM(contributors), 0) as total_contributors
        FROM checklists
    `);
    
    const stats = result.rows[0];
    
    return {
        totalChecklists: parseInt(stats.total_checklists) || 0,
        totalDownloads: parseInt(stats.total_downloads) || 0,
        totalContributors: parseInt(stats.total_contributors) || 0,
        updateFrequency: 'Weekly'
    };
}

// Search checklists
async function searchChecklists(query) {
    const result = await pool.query(
        `SELECT * FROM checklists 
         WHERE title ILIKE $1 OR description ILIKE $1 OR category ILIKE $1
         ORDER BY downloads DESC`,
        [`%${query}%`]
    );
    return result.rows;
}

// Get categories
async function getCategories() {
    const result = await pool.query(
        'SELECT DISTINCT category FROM checklists WHERE category IS NOT NULL ORDER BY category'
    );
    return result.rows.map(row => row.category);
}

// Get checklists by category
async function getChecklistsByCategory(category) {
    const result = await pool.query(
        'SELECT * FROM checklists WHERE category = $1 ORDER BY downloads DESC',
        [category]
    );
    return result.rows;
}

// Get checklist by ID (needed for file downloads)
async function getChecklistById(id) {
    try {
        const result = await pool.query('SELECT * FROM checklists WHERE id = $1', [id]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting checklist by ID:', error);
        throw error;
    }
}

module.exports = {
    pool,
    initializeDatabase,
    getAllChecklists,
    getChecklist,
    getChecklistById,
    createChecklist,
    updateChecklist,
    deleteChecklist,
    incrementDownloads,
    getStats,
    searchChecklists,
    getCategories,
    getChecklistsByCategory,
    addFileColumnsIfNeeded
};
