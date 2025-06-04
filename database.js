// database-postgres.js
const { Pool } = require('pg');
const path = require('path');

// Use DATABASE_URL from Render or fallback to SQLite for local dev
const isProduction = process.env.NODE_ENV === 'production';
const DATABASE_URL = process.env.DATABASE_URL;

let db;

if (isProduction && DATABASE_URL) {
    // PostgreSQL for production
    console.log('Using PostgreSQL database');
    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    // PostgreSQL query wrapper to match SQLite interface
    db = {
        run: (query, params = []) => {
            // Convert SQLite placeholders (?) to PostgreSQL ($1, $2, etc.)
            let pgQuery = query;
            let paramIndex = 1;
            while (pgQuery.includes('?')) {
                pgQuery = pgQuery.replace('?', `$${paramIndex}`);
                paramIndex++;
            }
            return pool.query(pgQuery, params);
        },
        get: async (query, params = []) => {
            let pgQuery = query;
            let paramIndex = 1;
            while (pgQuery.includes('?')) {
                pgQuery = pgQuery.replace('?', `$${paramIndex}`);
                paramIndex++;
            }
            const result = await pool.query(pgQuery, params);
            return result.rows[0];
        },
        all: async (query, params = []) => {
            let pgQuery = query;
            let paramIndex = 1;
            while (pgQuery.includes('?')) {
                pgQuery = pgQuery.replace('?', `$${paramIndex}`);
                paramIndex++;
            }
            const result = await pool.query(pgQuery, params);
            return result.rows;
        }
    };

    // Initialize PostgreSQL tables
    async function initializeDatabase() {
        try {
            // Create checklists table
            await db.run(`
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

            // Create checklist_features table
            await db.run(`
                CREATE TABLE IF NOT EXISTS checklist_features (
                    id SERIAL PRIMARY KEY,
                    checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE,
                    feature TEXT NOT NULL
                )
            `);

            // Create checklist_items table
            await db.run(`
                CREATE TABLE IF NOT EXISTS checklist_items (
                    id SERIAL PRIMARY KEY,
                    checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE,
                    phase VARCHAR(255),
                    item_text TEXT NOT NULL,
                    is_required BOOLEAN DEFAULT FALSE,
                    item_order INTEGER DEFAULT 0
                )
            `);

            // Create downloads table
            await db.run(`
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
        } catch (error) {
            console.error('PostgreSQL initialization error:', error);
            throw error;
        }
    }

} else {
    // SQLite for local development
    console.log('Using SQLite database for development');
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(__dirname, 'openchecklist.db');
    
    const sqliteDb = new sqlite3.Database(dbPath);
    
    // Promisify SQLite methods
    db = {
        run: (query, params = []) => {
            return new Promise((resolve, reject) => {
                sqliteDb.run(query, params, function(err) {
                    if (err) reject(err);
                    else resolve({ lastID: this.lastID });
                });
            });
        },
        get: (query, params = []) => {
            return new Promise((resolve, reject) => {
                sqliteDb.get(query, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        },
        all: (query, params = []) => {
            return new Promise((resolve, reject) => {
                sqliteDb.all(query, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        }
    };

    // Use existing SQLite initialization
    async function initializeDatabase() {
        const initSql = `
            CREATE TABLE IF NOT EXISTS checklists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                icon TEXT DEFAULT '📋',
                version TEXT DEFAULT '1.0',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                downloads INTEGER DEFAULT 0,
                category TEXT,
                content TEXT,
                formats TEXT DEFAULT 'pdf,markdown,excel',
                contributors INTEGER DEFAULT 1,
                is_featured INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS checklist_features (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                checklist_id INTEGER,
                feature TEXT NOT NULL,
                FOREIGN KEY (checklist_id) REFERENCES checklists(id)
            );

            CREATE TABLE IF NOT EXISTS checklist_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                checklist_id INTEGER,
                phase TEXT,
                item_text TEXT NOT NULL,
                is_required INTEGER DEFAULT 0,
                item_order INTEGER DEFAULT 0,
                FOREIGN KEY (checklist_id) REFERENCES checklists(id)
            );

            CREATE TABLE IF NOT EXISTS downloads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                checklist_id INTEGER,
                format TEXT,
                ip_address TEXT,
                user_agent TEXT,
                downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (checklist_id) REFERENCES checklists(id)
            );
        `;

        const statements = initSql.split(';').filter(s => s.trim());
        for (const statement of statements) {
            await db.run(statement);
        }
        console.log('SQLite database initialized successfully');
    }
}

// Common functions that work with both databases
async function getAllChecklists() {
    return await db.all('SELECT * FROM checklists ORDER BY created_at DESC');
}

async function getChecklist(id) {
    const checklist = await db.get('SELECT * FROM checklists WHERE id = ?', [id]);
    if (!checklist) return null;

    const features = await db.all('SELECT feature FROM checklist_features WHERE checklist_id = ?', [id]);
    const items = await db.all('SELECT * FROM checklist_items WHERE checklist_id = ? ORDER BY item_order', [id]);

    return {
        data: checklist,
        features: features.map(f => f.feature),
        items: items
    };
}

async function createChecklist(data) {
    const { title, description, icon, category, content, features, items } = data;
    
    const result = await db.run(
        `INSERT INTO checklists (title, description, icon, category, content) 
         VALUES (?, ?, ?, ?, ?)`,
        [title, description, icon || '📋', category, content || '']
    );
    
    const checklistId = result.lastID || result.rows?.[0]?.id;
    
    // Insert features
    if (features && features.length > 0) {
        for (const feature of features) {
            await db.run(
                'INSERT INTO checklist_features (checklist_id, feature) VALUES (?, ?)',
                [checklistId, feature]
            );
        }
    }
    
    // Insert items
    if (items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            await db.run(
                `INSERT INTO checklist_items (checklist_id, phase, item_text, is_required, item_order) 
                 VALUES (?, ?, ?, ?, ?)`,
                [checklistId, item.phase, item.item_text, item.is_required ? 1 : 0, i]
            );
        }
    }
    
    return checklistId;
}

async function incrementDownloads(checklistId, format, ipAddress, userAgent) {
    await db.run(
        'UPDATE checklists SET downloads = downloads + 1 WHERE id = ?',
        [checklistId]
    );
    
    await db.run(
        'INSERT INTO downloads (checklist_id, format, ip_address, user_agent) VALUES (?, ?, ?, ?)',
        [checklistId, format, ipAddress, userAgent]
    );
}

async function getStats() {
    const stats = await db.get(`
        SELECT 
            COUNT(*) as totalChecklists,
            SUM(downloads) as totalDownloads,
            SUM(contributors) as totalContributors
        FROM checklists
    `);
    
    return {
        totalChecklists: stats.totalChecklists || 0,
        totalDownloads: stats.totalDownloads || 0,
        totalContributors: stats.totalContributors || 0,
        updateFrequency: 'Weekly'
    };
}

async function getCategories() {
    const categories = await db.all(
        'SELECT DISTINCT category FROM checklists WHERE category IS NOT NULL'
    );
    return categories.map(c => c.category);
}

async function getChecklistsByCategory(category) {
    return await db.all(
        'SELECT * FROM checklists WHERE category = ? ORDER BY created_at DESC',
        [category]
    );
}

module.exports = {
    db,
    initializeDatabase,
    getAllChecklists,
    getChecklist,
    createChecklist,
    incrementDownloads,
    getStats,
    getCategories,
    getChecklistsByCategory
};
