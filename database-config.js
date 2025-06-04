// database-config.js
const { Pool } = require('pg');
const path = require('path');

// PostgreSQL connection
const connectionString = process.env.DATABASE_URL || 'postgresql://openchecklist_user:1hqwddSV0eVuEYIJyCHsUIDoTTAsD4J3@dpg-d101h3qli9vc73dckmp0-a/openchecklist';

const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err.stack);
    } else {
        console.log('Connected to PostgreSQL database');
        release();
    }
});

module.exports = pool;
