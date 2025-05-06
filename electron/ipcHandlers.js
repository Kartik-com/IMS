// ipcHandlers.js
const { ipcMain, app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

// Create or open the SQLite DB in the user's local app data folder
const dbPath = path.join(app.getPath('userData'), 'inventory.db');
const db = new Database(dbPath);

// Inventory

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

// GET items
ipcMain.handle('inventory:getItems', () => {
  return db.prepare('SELECT * FROM items').all();
});

// ADD item
ipcMain.handle('inventory:addItem', (event, item) => {
  return db.prepare(`
    INSERT INTO items (name, barcode, gstPercentage, buyingCost, sellingCost, MRP, stock, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.name, item.barcode, item.gstPercentage, item.buyingCost,
    item.sellingCost, item.MRP, item.stock, item.unit
  );
});

// UPDATE item
ipcMain.handle('inventory:updateItem', (event, item) => {
  return db.prepare(`
    UPDATE items
    SET name = ?, barcode = ?, gstPercentage = ?, buyingCost = ?, sellingCost = ?, MRP = ?, stock = ?, unit = ?
    WHERE id = ?
  `).run(
    item.name, item.barcode, item.gstPercentage, item.buyingCost,
    item.sellingCost, item.MRP, item.stock, item.id, item.unit
  );
});

// DELETE item
ipcMain.handle('inventory:deleteItem', (event, id) => {
  return db.prepare('DELETE FROM items WHERE id = ?').run(id);
});

// CHECK if barcode exists
ipcMain.handle('inventory:checkBarcode', (event, barcode) => {
  const row = db.prepare('SELECT 1 FROM items WHERE barcode = ?').get(barcode);
  return !!row; // returns true if found, false if not
});

// Billing

// Create bills table if it doesn't exist
db.prepare(`
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  
  // Save bill
  ipcMain.handle('billing:saveBill', (event, billData) => {
    const insertBillStmt = db.prepare(`INSERT INTO bills (data) VALUES (?)`);
    const getStockStmt = db.prepare(`SELECT stock FROM items WHERE barcode = ?`);
    const updateStockStmt = db.prepare(`UPDATE items SET stock = stock - ? WHERE barcode = ?`);
  
    const transaction = db.transaction((bill) => {
      // Check stock for each item before modifying anything
      for (const item of bill.totalItems) {
        const row = getStockStmt.get(item.barcode);
        if (!row) throw new Error(`Item with barcode ${item.barcode} not found`);
        if (row.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${item.barcode}. Available: ${row.stock}, Requested: ${item.quantity}`);
        }
      }
  
      // If all items have enough stock, proceed to save bill and update inventory
      insertBillStmt.run(JSON.stringify(bill));
  
      for (const item of bill.totalItems) {
        updateStockStmt.run(item.quantity, item.barcode);
      }
    });
  
    try {
      transaction(billData);
      return { success: true };
    } catch (err) {
      console.error('Billing transaction failed:', err);
      return { success: false, error: err.message };
    }
  });
  
  
  