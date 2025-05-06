// database.js
const path = require('path');
const Database = require('better-sqlite3');
const { app } = require('electron');

// Store DB in userData folder
const dbPath = path.join(app.getPath('userData'), 'inventory.db');
const db = new Database(dbPath);

// Create table if not exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    gstPercentage REAL,
    buyingCost REAL,
    sellingCost REAL,
    MRP REAL,
    stock INTEGER
  )
`).run();

module.exports = db;
