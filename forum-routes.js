// forum-routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('./database');

// Utility function to create URL-friendly slugs
function createSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 100);
}

// Get all categories
router.get('/categories', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, 
                   COUNT(DISTINCT t.id) as topic_count,
                   MAX(t.created_at) as last_activity
            FROM forum_categories c
            LEFT JOIN forum_topics t ON c.id = t.category_id
            GROUP BY c.id
            ORDER BY c.id
        `);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Get topics for a category (with pagination)
router.get('/categories/:slug/topics', async (req, res) => {
    try {
        const { slug } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        // Get category
        const categoryResult = await pool.query(
            'SELECT * FROM forum_categories WHERE slug = $1',
            [slug]
        );
        
        if (categoryResult.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }
        
        const category = categoryResult.rows[0];
        
        // Get topics
        const topicsResult = await pool.query(`
            SELECT t.*, 
                   COUNT(DISTINCT r.id) as reply_count,
                   MAX(r.created_at) as last_reply_time
            FROM forum_topics t
            LEFT JOIN forum_replies r ON t.id = r.topic_id
            WHERE t.category_id = $1
            GROUP BY t.id
            ORDER BY t.is_pinned DESC, t.last_reply_at DESC
            LIMIT $2 OFFSET $3
        `, [category.id, limit, offset]);
        
        // Get total count
        const countResult = await pool.query(
            'SELECT COUNT(*) FROM forum_topics WHERE category_id = $1',
            [category.id]
        );
        
        res.json({
            category,
            topics: topicsResult.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching topics:', error);
        res.status(500).json({ error: 'Failed to fetch topics' });
    }
});

// Get latest topics across all categories
router.get('/topics/latest', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const result = await pool.query(`
            SELECT t.*, c.name as category_name, c.slug as category_slug, c.color as category_color,
                   COUNT(DISTINCT r.id) as reply_count
            FROM forum_topics t
            JOIN forum_categories c ON t.category_id = c.id
            LEFT JOIN forum_replies r ON t.id = r.topic_id
            GROUP BY t.id, c.id
            ORDER BY t.created_at DESC
            LIMIT $1
        `, [limit]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching latest topics:', error);
        res.status(500).json({ error: 'Failed to fetch latest topics' });
    }
});

// Get single topic with replies
router.get('/topics/:id', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { id } = req.params;
        
        await client.query('BEGIN');
        
        // Increment view count
        await client.query(
            'UPDATE forum_topics SET views = views + 1 WHERE id = $1',
            [id]
        );
        
        // Get topic with category info
        const topicResult = await client.query(`
            SELECT t.*, c.name as category_name, c.slug as category_slug
            FROM forum_topics t
            JOIN forum_categories c ON t.category_id = c.id
            WHERE t.id = $1
        `, [id]);
        
        if (topicResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Topic not found' });
        }
        
        const topic = topicResult.rows[0];
        
        // Get replies
        const repliesResult = await client.query(`
            SELECT * FROM forum_replies
            WHERE topic_id = $1
            ORDER BY created_at ASC
        `, [id]);
        
        await client.query('COMMIT');
        
        res.json({
            topic,
            replies: repliesResult.rows
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error fetching topic:', error);
        res.status(500).json({ error: 'Failed to fetch topic' });
    } finally {
        client.release();
    }
});

// Create new topic
router.post('/topics', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { category_id, title, content, author_name, author_email } = req.body;
        
        // Validate input
        if (!category_id || !title || !content || !author_name || !author_email) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        if (!author_email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }
        
        await client.query('BEGIN');
        
        // Create topic
        const slug = createSlug(title) + '-' + Date.now();
        const result = await client.query(`
            INSERT INTO forum_topics (category_id, title, slug, author_name, author_email, content)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [category_id, title, slug, author_name, author_email, content]);
        
        // Update category post count
        await client.query(
            'UPDATE forum_categories SET post_count = post_count + 1 WHERE id = $1',
            [category_id]
        );
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            topic: result.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating topic:', error);
        res.status(500).json({ error: 'Failed to create topic' });
    } finally {
        client.release();
    }
});

// Create reply
router.post('/topics/:id/replies', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { id } = req.params;
        const { content, author_name, author_email, parent_reply_id } = req.body;
        
        // Validate
        if (!content || !author_name || !author_email) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        await client.query('BEGIN');
        
        // Create reply
        const result = await client.query(`
            INSERT INTO forum_replies (topic_id, parent_reply_id, author_name, author_email, content)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [id, parent_reply_id || null, author_name, author_email, content]);
        
        // Update topic reply count and last reply time
        await client.query(`
            UPDATE forum_topics 
            SET reply_count = reply_count + 1,
                last_reply_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [id]);
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            reply: result.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating reply:', error);
        res.status(500).json({ error: 'Failed to create reply' });
    } finally {
        client.release();
    }
});

// Search topics
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 3) {
            return res.json([]);
        }
        
        const result = await pool.query(`
            SELECT t.*, c.name as category_name, c.slug as category_slug,
                   COUNT(DISTINCT r.id) as reply_count
            FROM forum_topics t
            JOIN forum_categories c ON t.category_id = c.id
            LEFT JOIN forum_replies r ON t.id = r.topic_id
            WHERE t.title ILIKE $1 OR t.content ILIKE $1
            GROUP BY t.id, c.id
            ORDER BY t.created_at DESC
            LIMIT 20
        `, [`%${q}%`]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error searching topics:', error);
        res.status(500).json({ error: 'Failed to search topics' });
    }
});

// Get popular topics (most replies)
router.get('/topics/popular', async (req, res) => {
    try {
        const { days = 7, limit = 10 } = req.query;
        
        const result = await pool.query(`
            SELECT t.*, c.name as category_name, c.slug as category_slug,
                   COUNT(DISTINCT r.id) as reply_count
            FROM forum_topics t
            JOIN forum_categories c ON t.category_id = c.id
            LEFT JOIN forum_replies r ON t.id = r.topic_id
            WHERE t.created_at > NOW() - INTERVAL '%s days'
            GROUP BY t.id, c.id
            HAVING COUNT(DISTINCT r.id) > 0
            ORDER BY reply_count DESC
            LIMIT $1
        `, [limit, days]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching popular topics:', error);
        res.status(500).json({ error: 'Failed to fetch popular topics' });
    }
});

module.exports = router;
