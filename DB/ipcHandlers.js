const { ipcMain, app } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

// Create or open the SQLite DB
const dbPath = path.join(__dirname, 'inventory.db');
const db = new Database(dbPath);

// Creating Customers table
db.prepare(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile_number TEXT UNIQUE NOT NULL,
    referral INTEGER,
    udhari REAL DEFAULT 0.0,
    FOREIGN KEY (referral) REFERENCES customers(id)
  )
`).run();

// Creating/Updating Bills table with customer_id
db.prepare(`
  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    data TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )
`).run();

// Inventory - items
db.prepare(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    gstPercentage REAL,
    buyingCost REAL,
    sellingCost REAL,
    MRP REAL,
    stock INTEGER,
    unit TEXT NOT NULL
  )
`).run();

// GET customers
ipcMain.handle('customers:getCustomers', () => {
  return db.prepare('SELECT * FROM customers').all();
});

// ADD customer
ipcMain.handle('customers:addCustomer', (event, customer) => {
  return db.prepare(`
    INSERT INTO customers (name, mobile_number, referral, udhari)
    VALUES (?, ?, ?, ?)
  `).run(
    customer.name,
    customer.mobile_number,
    customer.referral || null,
    customer.udhari || 0.0
  );
});

// UPDATE customer
ipcMain.handle('customers:updateCustomer', (event, customer) => {
  return db.prepare(`
    UPDATE customers
    SET name = ?, mobile_number = ?, referral = ?, udhari = ?
    WHERE id = ?
  `).run(
    customer.name,
    customer.mobile_number,
    customer.referral || null,
    customer.udhari || 0.0,
    customer.id
  );
});

// DELETE customer
ipcMain.handle('customers:deleteCustomer', (event, id) => {
  return db.prepare('DELETE FROM customers WHERE id = ?').run(id);
});

// CHECK if mobile number exists
ipcMain.handle('customers:checkMobileNumber', (event, mobile_number) => {
  const row = db.prepare('SELECT 1 FROM customers WHERE mobile_number = ?').get(mobile_number);
  return !!row;
});

// GET items
ipcMain.handle('inventory:getItems', () => {
  return db.prepare('SELECT * FROM items').all();
});

// ADD item
ipcMain.handle('inventory:addItem', (event, item) => {
  return db.prepare(`
    INSERT INTO items (name, barcode, gstPercentage, buyingCost, sellingCost, MRP, stock, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    item.name,
    item.barcode,
    item.gstPercentage,
    item.buyingCost,
    item.sellingCost,
    item.MRP,
    item.stock,
    item.unit,
    item.id
  );
});

// DELETE item
ipcMain.handle('inventory:deleteItem', (event, id) => {
  return db.prepare('DELETE FROM items WHERE id = ?').run(id);
});

// CHECK if barcode exists
ipcMain.handle('inventory:checkBarcode', (event, barcode) => {
  const row = db.prepare('SELECT 1 FROM items WHERE barcode = ?').get(barcode);
  return !!row;
});

// Save bill
ipcMain.handle('billing:saveBill', (event, billData) => {
  const insertBillStmt = db.prepare(`INSERT INTO bills (customer_id, data) VALUES (?, ?)`);
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
    insertBillStmt.run(bill.customer_id || null, JSON.stringify(bill));

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