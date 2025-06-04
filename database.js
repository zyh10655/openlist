// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

// Create database connection
const db = new sqlite3.Database(path.join(__dirname, 'openchecklist.db'));

// Initialize database schema
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Create checklists table
            db.run(`
                CREATE TABLE IF NOT EXISTS checklists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    icon TEXT,
                    version TEXT,
                    content TEXT,
                    downloads INTEGER DEFAULT 0,
                    contributors INTEGER DEFAULT 1,
                    category TEXT,
                    tags TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) console.error('Error creating checklists table:', err);
            });

            // Create checklist_items table for detailed steps
            db.run(`
                CREATE TABLE IF NOT EXISTS checklist_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    checklist_id INTEGER,
                    phase TEXT,
                    item_text TEXT,
                    order_index INTEGER,
                    is_required BOOLEAN DEFAULT 1,
                    FOREIGN KEY (checklist_id) REFERENCES checklists (id)
                )
            `, (err) => {
                if (err) console.error('Error creating checklist_items table:', err);
            });

            // Create formats table
            db.run(`
                CREATE TABLE IF NOT EXISTS formats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    checklist_id INTEGER,
                    format_type TEXT,
                    file_path TEXT,
                    FOREIGN KEY (checklist_id) REFERENCES checklists (id)
                )
            `, (err) => {
                if (err) console.error('Error creating formats table:', err);
            });

            // Create download_logs table for analytics
            db.run(`
                CREATE TABLE IF NOT EXISTS download_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    checklist_id INTEGER,
                    format TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (checklist_id) REFERENCES checklists (id)
                )
            `, (err) => {
                if (err) console.error('Error creating download_logs table:', err);
            });

            // Create features table
            db.run(`
                CREATE TABLE IF NOT EXISTS features (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    checklist_id INTEGER,
                    feature_text TEXT,
                    FOREIGN KEY (checklist_id) REFERENCES checklists (id)
                )
            `, (err) => {
                if (err) console.error('Error creating features table:', err);
                else resolve();
            });
        });
    });
}

// Database operations
const dbOperations = {
    // Get all checklists
    getAllChecklists: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT c.*, GROUP_CONCAT(DISTINCT f.format_type) as formats
                FROM checklists c
                LEFT JOIN formats f ON c.id = f.checklist_id
                GROUP BY c.id
                ORDER BY c.downloads DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Get single checklist with all details
    getChecklist: (id) => {
        return new Promise((resolve, reject) => {
            const checklist = {};
            
            // Get main checklist data
            db.get(`SELECT * FROM checklists WHERE id = ?`, [id], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                checklist.data = row;
                
                // Get features
                db.all(`SELECT feature_text FROM features WHERE checklist_id = ?`, [id], (err, features) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    checklist.features = features.map(f => f.feature_text);
                    
                    // Get checklist items grouped by phase
                    db.all(`
                        SELECT phase, item_text, is_required 
                        FROM checklist_items 
                        WHERE checklist_id = ? 
                        ORDER BY order_index
                    `, [id], (err, items) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        checklist.items = items;
                        
                        // Get available formats
                        db.all(`SELECT format_type FROM formats WHERE checklist_id = ?`, [id], (err, formats) => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            checklist.formats = formats.map(f => f.format_type);
                            resolve(checklist);
                        });
                    });
                });
            });
        });
    },

    // Create new checklist
    createChecklist: (checklistData) => {
        return new Promise((resolve, reject) => {
            const { title, description, icon, category, content, features, items } = checklistData;
            
            db.run(`
                INSERT INTO checklists (title, description, icon, category, content)
                VALUES (?, ?, ?, ?, ?)
            `, [title, description, icon, category, content], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                
                const checklistId = this.lastID;
                
                // Insert features
                if (features && features.length > 0) {
                    const featureStmt = db.prepare(`INSERT INTO features (checklist_id, feature_text) VALUES (?, ?)`);
                    features.forEach(feature => {
                        featureStmt.run(checklistId, feature);
                    });
                    featureStmt.finalize();
                }
                
                // Insert checklist items
                if (items && items.length > 0) {
                    const itemStmt = db.prepare(`
                        INSERT INTO checklist_items (checklist_id, phase, item_text, order_index, is_required)
                        VALUES (?, ?, ?, ?, ?)
                    `);
                    
                    items.forEach((item, index) => {
                        itemStmt.run(checklistId, item.phase, item.text, index, item.required ? 1 : 0);
                    });
                    itemStmt.finalize();
                }
                
                // Add default formats
                const formats = ['pdf', 'markdown', 'excel'];
                const formatStmt = db.prepare(`INSERT INTO formats (checklist_id, format_type) VALUES (?, ?)`);
                formats.forEach(format => {
                    formatStmt.run(checklistId, format);
                });
                formatStmt.finalize();
                
                resolve(checklistId);
            });
        });
    },

    // Update download count
    incrementDownloads: (checklistId, format, ipAddress, userAgent) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // Update download count
                db.run(`UPDATE checklists SET downloads = downloads + 1 WHERE id = ?`, [checklistId]);
                
                // Log download
                db.run(`
                    INSERT INTO download_logs (checklist_id, format, ip_address, user_agent)
                    VALUES (?, ?, ?, ?)
                `, [checklistId, format, ipAddress, userAgent], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    },

    // Get statistics
    getStats: () => {
        return new Promise((resolve, reject) => {
            const stats = {};
            
            db.get(`SELECT COUNT(*) as count FROM checklists`, (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                stats.totalChecklists = row.count;
                
                db.get(`SELECT SUM(downloads) as total FROM checklists`, (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    stats.totalDownloads = row.total || 0;
                    
                    db.get(`SELECT COUNT(DISTINCT ip_address) as unique_users FROM download_logs`, (err, row) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        stats.uniqueUsers = row.unique_users || 0;
                        stats.totalContributors = 42; // Placeholder
                        stats.updateFrequency = 'Weekly';
                        
                        resolve(stats);
                    });
                });
            });
        });
    },

    // Search checklists
    searchChecklists: (query) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM checklists 
                WHERE title LIKE ? OR description LIKE ? OR category LIKE ?
                ORDER BY downloads DESC
            `, [`%${query}%`, `%${query}%`, `%${query}%`], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Get popular checklists
    getPopularChecklists: (limit = 10) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM checklists 
                ORDER BY downloads DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Get recent checklists
    getRecentChecklists: (limit = 10) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM checklists 
                ORDER BY created_at DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    // Get checklists by category
    getChecklistsByCategory: (category) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT c.*, GROUP_CONCAT(DISTINCT f.format_type) as formats
                FROM checklists c
                LEFT JOIN formats f ON c.id = f.checklist_id
                WHERE c.category = ?
                GROUP BY c.id
                ORDER BY c.downloads DESC
            `, [category], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Get all categories
    getCategories: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT DISTINCT category, COUNT(*) as count
                FROM checklists
                WHERE category IS NOT NULL
                GROUP BY category
                ORDER BY count DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Update checklist
    updateChecklist: (id, updates) => {
        return new Promise((resolve, reject) => {
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
    }
};

module.exports = {
    db,
    initializeDatabase,
    ...dbOperations
};