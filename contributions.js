// contributions.js
const express = require('express');
const router = express.Router();
const { db } = require('./database');

// Create contributions table
function createContributionsTable() {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS user_contributions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                checklist_id INTEGER,
                contributor_name TEXT,
                contributor_email TEXT,
                contribution_type TEXT,
                content TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                reviewed_at DATETIME,
                reviewer_notes TEXT,
                FOREIGN KEY (checklist_id) REFERENCES checklists (id)
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// Submit a contribution
router.post('/submit', async (req, res) => {
    const { checklistId, name, email, type, content } = req.body;
    
    try {
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO user_contributions (checklist_id, contributor_name, contributor_email, contribution_type, content)
                VALUES (?, ?, ?, ?, ?)
            `, [checklistId, name, email, type, content], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
        
        res.json({ success: true, message: 'Thank you for your contribution! It will be reviewed soon.' });
    } catch (error) {
        console.error('Failed to submit contribution:', error);
        res.status(500).json({ error: 'Failed to submit contribution' });
    }
});

// Get pending contributions (admin only)
router.get('/pending', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'admin123') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const contributions = await new Promise((resolve, reject) => {
            db.all(`
                SELECT c.*, ch.title as checklist_title
                FROM user_contributions c
                JOIN checklists ch ON c.checklist_id = ch.id
                WHERE c.status = 'pending'
                ORDER BY c.created_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json(contributions);
    } catch (error) {
        console.error('Failed to fetch contributions:', error);
        res.status(500).json({ error: 'Failed to fetch contributions' });
    }
});

// Review contribution (admin only)
router.put('/:id/review', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'admin123') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const { status, notes } = req.body;
    
    try {
        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE user_contributions 
                SET status = ?, reviewer_notes = ?, reviewed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [status, notes, id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // If approved, you could automatically add the content to the checklist here
        if (status === 'approved') {
            // Get the contribution details
            const contribution = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM user_contributions WHERE id = ?', [id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            // Add to checklist_items or features based on contribution type
            if (contribution && contribution.contribution_type === 'item') {
                await new Promise((resolve, reject) => {
                    db.run(`
                        INSERT INTO checklist_items (checklist_id, phase, item_text, order_index)
                        VALUES (?, 'Community Contributions', ?, 999)
                    `, [contribution.checklist_id, contribution.content], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
        }
        
        res.json({ success: true, message: 'Contribution reviewed successfully' });
    } catch (error) {
        console.error('Failed to review contribution:', error);
        res.status(500).json({ error: 'Failed to review contribution' });
    }
});

// Get contribution stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(*) as total_contributions,
                    COUNT(DISTINCT contributor_email) as unique_contributors,
                    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_contributions,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_contributions
                FROM user_contributions
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        res.json(stats);
    } catch (error) {
        console.error('Failed to fetch contribution stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = {
    router,
    createContributionsTable
};