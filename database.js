// database.js - PostgreSQL version
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
                is_featured BOOLEAN DEFAULT FALSE
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
                checklist_id INTEGER REFERENCES checklists(id),
                format VARCHAR(20),
                ip_address VARCHAR(45),
                user_agent TEXT,
                downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

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

// Create new checklist
async function createChecklist(data) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { title, description, icon, category, content, features, items } = data;
        
        // Insert main checklist
        const result = await client.query(
            `INSERT INTO checklists (title, description, icon, category, content) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [title, description, icon || '📋', category || 'Other', content || '']
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

// Delete checklist
// Replace your deleteChecklist function in database.js with this:

async function deleteChecklist(id) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        console.log(`Starting deletion of checklist ${id}`);
        
        // Delete all related records FIRST (child tables)
        // 1. Delete download records
        const downloadResult = await client.query(
            'DELETE FROM downloads WHERE checklist_id = $1',
            [id]
        );
        console.log(`Deleted ${downloadResult.rowCount} download records`);
        
        // 2. Delete checklist items (if table exists)
        try {
            const itemsResult = await client.query(
                'DELETE FROM checklist_items WHERE checklist_id = $1',
                [id]
            );
            console.log(`Deleted ${itemsResult.rowCount} checklist items`);
        } catch (err) {
            if (err.code !== '42P01') { // Table doesn't exist error
                throw err;
            }
            console.log('checklist_items table does not exist, skipping...');
        }
        
        // 3. Delete features (if table exists)
        try {
            const featuresResult = await client.query(
                'DELETE FROM features WHERE checklist_id = $1',
                [id]
            );
            console.log(`Deleted ${featuresResult.rowCount} features`);
        } catch (err) {
            if (err.code !== '42P01') { // Table doesn't exist error
                throw err;
            }
            console.log('features table does not exist, skipping...');
        }
        
        // 4. Delete any other related tables that might exist
        try {
            const formatsResult = await client.query(
                'DELETE FROM formats WHERE checklist_id = $1',
                [id]
            );
            console.log(`Deleted ${formatsResult.rowCount} formats`);
        } catch (err) {
            if (err.code !== '42P01') { // Table doesn't exist error
                throw err;
            }
            console.log('formats table does not exist, skipping...');
        }
        
        // 5. Finally, delete the checklist itself (parent table)
        const checklistResult = await client.query(
            'DELETE FROM checklists WHERE id = $1',
            [id]
        );
        
        if (checklistResult.rowCount === 0) {
            throw new Error(`Checklist with id ${id} not found`);
        }
        
        console.log(`Successfully deleted checklist ${id}`);
        
        await client.query('COMMIT');
        
        return { 
            success: true, 
            message: `Checklist ${id} and all related data deleted successfully`,
            deletedRows: {
                checklists: checklistResult.rowCount,
                downloads: downloadResult.rowCount
            }
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in deleteChecklist:', error);
        throw error;
    } finally {
        client.release();
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

module.exports = {
    pool,
    initializeDatabase,
    getAllChecklists,
    getChecklist,
    createChecklist,
    updateChecklist,
    deleteChecklist,
    incrementDownloads,
    getStats,
    searchChecklists,
    getCategories,
    getChecklistsByCategory
};
