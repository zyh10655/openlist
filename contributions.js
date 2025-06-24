// contributions.js - Fixed for PostgreSQL
const express = require('express');
const router = express.Router();
const { pool } = require('./database');

// Create contributions table
async function createContributionsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_contributions (
                id SERIAL PRIMARY KEY,
                checklist_id INTEGER REFERENCES checklists(id) ON DELETE CASCADE,
                contributor_name VARCHAR(255),
                contributor_email VARCHAR(255),
                contribution_type VARCHAR(50),
                content TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP,
                reviewer_notes TEXT
            )
        `);
        
        // Create index for better performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_contributions_status 
            ON user_contributions(status)
        `);
        
        console.log('Contributions table created successfully');
    } catch (error) {
        console.error('Error creating contributions table:', error);
        throw error;
    }
}

// Submit a contribution
router.post('/submit', async (req, res) => {
    const { checklistId, name, email, type, content } = req.body;
    
    try {
        const result = await pool.query(`
            INSERT INTO user_contributions 
            (checklist_id, contributor_name, contributor_email, contribution_type, content)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `, [checklistId, name, email, type, content]);
        
        res.json({ 
            success: true, 
            message: 'Thank you for your contribution! It will be reviewed soon.',
            contributionId: result.rows[0].id 
        });
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
        const result = await pool.query(`
            SELECT c.*, ch.title as checklist_title
            FROM user_contributions c
            JOIN checklists ch ON c.checklist_id = ch.id
            WHERE c.status = 'pending'
            ORDER BY c.created_at DESC
        `);
        
        res.json(result.rows);
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
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Update contribution status
        await client.query(`
            UPDATE user_contributions 
            SET status = $1, reviewer_notes = $2, reviewed_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [status, notes, id]);
        
        // If approved, add the content to the checklist
        if (status === 'approved') {
            // Get the contribution details
            const contribResult = await client.query(
                'SELECT * FROM user_contributions WHERE id = $1', 
                [id]
            );
            
            const contribution = contribResult.rows[0];
            
            if (contribution && contribution.contribution_type === 'item') {
                // Add to checklist_items
                const orderResult = await client.query(
                    'SELECT COALESCE(MAX(item_order), -1) + 1 as next_order FROM checklist_items WHERE checklist_id = $1',
                    [contribution.checklist_id]
                );
                
                const nextOrder = orderResult.rows[0].next_order;
                
                await client.query(`
                    INSERT INTO checklist_items 
                    (checklist_id, phase, item_text, item_order, is_required)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    contribution.checklist_id, 
                    'Community Contributions', 
                    contribution.content, 
                    nextOrder,
                    false
                ]);
            } else if (contribution && contribution.contribution_type === 'feature') {
                // Add to checklist_features
                await client.query(`
                    INSERT INTO checklist_features (checklist_id, feature)
                    VALUES ($1, $2)
                `, [contribution.checklist_id, contribution.content]);
            }
        }
        
        await client.query('COMMIT');
        res.json({ success: true, message: 'Contribution reviewed successfully' });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Failed to review contribution:', error);
        res.status(500).json({ error: 'Failed to review contribution' });
    } finally {
        client.release();
    }
});

// Get contribution stats
router.get('/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total_contributions,
                COUNT(DISTINCT contributor_email) as unique_contributors,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_contributions,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_contributions
            FROM user_contributions
        `);
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Failed to fetch contribution stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get contributions by checklist (public)
router.get('/checklist/:checklistId', async (req, res) => {
    const { checklistId } = req.params;
    
    try {
        const result = await pool.query(`
            SELECT 
                contributor_name,
                contribution_type,
                content,
                created_at
            FROM user_contributions
            WHERE checklist_id = $1 AND status = 'approved'
            ORDER BY created_at DESC
            LIMIT 10
        `, [checklistId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Failed to fetch checklist contributions:', error);
        res.status(500).json({ error: 'Failed to fetch contributions' });
    }
});

module.exports = {
    router,
    createContributionsTable
};
