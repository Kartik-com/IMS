const { ipcMain, dialog, BrowserWindow } = require('electron');
const path = require("path");
const Database = require("better-sqlite3");
// Create or open the SQLite DB
const dbPath = path.join(__dirname, "inventory.db");
let db = new Database(dbPath);
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { google } = require('googleapis');
const archiver = require('archiver');
const fs = require('fs-extra');
const axios = require('axios');
const backupDir = path.join(__dirname, 'backups');
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  access_token: process.env.ACCESS_TOKEN,
  refresh_token: process.env.REFRESH_TOKEN
});

// Ensure backup directory exists
fs.ensureDirSync(backupDir);

// Backup to Google Drive
ipcMain.handle('backup:saveToDrive', async (event) => {
  try {
    // Generate backup file name with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbBackupPath = path.join(backupDir, `inventory-backup-${timestamp}.db`);

    // Copy inventory.db to backup directory with timestamped name
    await fs.copy(dbPath, dbBackupPath);

    // Verify tokens
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
      throw new Error('No valid access token available');
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Upload database to Google Drive
    const fileMetadata = {
      name: `inventory-backup-${timestamp}.db`,
      mimeType: 'application/x-sqlite3',
    };

    const media = {
      mimeType: 'application/x-sqlite3',
      body: fs.createReadStream(dbBackupPath),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    // Clean up local backup file
    await fs.remove(dbBackupPath);

    return { success: true, fileId: response.data.id };
  } catch (err) {
    console.error('Backup to Drive failed:', err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// List backups in Google Drive
ipcMain.handle('backup:listBackups', async (event) => {
  try {
    // Verify tokens
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
      throw new Error('No valid access token available');
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.files.list({
      q: "name contains 'inventory-backup' and mimeType='application/x-sqlite3'",
      fields: 'files(id, name, createdTime)',
    });

    return { success: true, files: response.data.files };
  } catch (err) {
    console.error('List backups failed:', err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// Download backup from Google Drive
ipcMain.handle('backup:downloadFromDrive', async (event, fileId, fileName) => {
  try {
    // Get the main window for the dialog
    const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      throw new Error('No main window available for save dialog');
    }

    // Show save dialog
    const defaultPath = path.join(require('os').homedir(), 'Downloads', fileName.replace('.zip', '.db'));
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Backup File',
      defaultPath,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (canceled || !filePath) {
      return { success: false, error: 'Download canceled' };
    }

    // Verify tokens
    if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
      throw new Error('No valid access token available');
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Download the database file
    const dest = fs.createWriteStream(filePath);
    await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    ).then((res) => {
      return new Promise((resolve, reject) => {
        res.data
          .on('end', () => {
            resolve();
          })
          .on('error', (err) => reject(err))
          .pipe(dest);
      });
    });

    return { success: true, savePath: filePath };
  } catch (err) {
    console.error('Download from Drive failed:', err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// Migration: Merge remaining_amount_to_pay into udhari and drop the column if it exists
try {
  const columns = db.prepare("PRAGMA table_info(wholesalers)").all();
  const hasRemainingAmount = columns.some(col => col.name === "remaining_amount_to_pay");
  if (hasRemainingAmount) {
    db.prepare(
      `
      UPDATE wholesalers
      SET udhari = COALESCE(udhari, 0.0) + COALESCE(remaining_amount_to_pay, 0.0)
      WHERE remaining_amount_to_pay IS NOT NULL AND remaining_amount_to_pay != 0.0
      `
    ).run();
    
    db.prepare("ALTER TABLE wholesalers DROP COLUMN remaining_amount_to_pay").run();
    
  } else {
    
  }
} catch (err) {
  console.error("Error during remaining_amount_to_pay migration:", err);
  throw err;
}

// Create tables (for new databases)
db.prepare(
  `
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile_number TEXT UNIQUE NOT NULL,
    udhari REAL DEFAULT 0.0
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    payment_method TEXT,
    amount_paid REAL,
    change REAL,
    discount REAL DEFAULT 0.0,
    total_cost REAL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER,
    item_id INTEGER,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (bill_id) REFERENCES bills(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
  )
`
).run();

db.prepare(
  `
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
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS udhari (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    bill_id INTEGER,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (bill_id) REFERENCES bills(id)
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS wholesalers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_number TEXT UNIQUE NOT NULL,
    email TEXT,
    address TEXT,
    tax_id TEXT,
    moq INTEGER,
    total_amount REAL DEFAULT 0.0,
    udhari REAL DEFAULT 0.0,
    specialty_product TEXT
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS wholesaler_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wholesaler_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    FOREIGN KEY (wholesaler_id) REFERENCES wholesalers(id),
    FOREIGN KEY (item_id) REFERENCES items(id),
    UNIQUE (wholesaler_id, item_id)
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    bill_id INTEGER,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    refund_amount REAL NOT NULL,
    reason TEXT,
    createdAt TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (bill_id) REFERENCES bills(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS wholesaler_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wholesaler_id INTEGER NOT NULL,
    invoice_number TEXT UNIQUE,
    total_cost REAL NOT NULL,
    amount_paid REAL NOT NULL,
    discount REAL DEFAULT 0.0,
    payment_method TEXT NOT NULL,
    purchase_date TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (wholesaler_id) REFERENCES wholesalers(id)
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS wholesaler_purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    item_id INTEGER,
    quantity INTEGER NOT NULL,
    buying_cost REAL NOT NULL,
    total REAL NOT NULL,
    barcode TEXT NOT NULL,
    name TEXT NOT NULL,
    gst_percentage REAL,
    selling_cost REAL,
    mrp REAL,
    unit TEXT NOT NULL,
    FOREIGN KEY (purchase_id) REFERENCES wholesaler_purchases(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
  )
`
).run();

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS wholesaler_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wholesaler_id INTEGER NOT NULL,
    purchase_id INTEGER,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    invoice_number TEXT,
    total_cost REAL,
    amount_paid REAL,
    discount REAL,
    payment_method TEXT,
    notes TEXT,
    FOREIGN KEY (wholesaler_id) REFERENCES wholesalers(id),
    FOREIGN KEY (purchase_id) REFERENCES wholesaler_purchases(id)
  )
`
).run();
// Create expired_items table
db.prepare(`
  CREATE TABLE IF NOT EXISTS expired_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    expiration_date TEXT NOT NULL,
    reason TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id)
  )
`).run();

// Create customer_suggestions table
db.prepare(
    "CREATE TABLE IF NOT EXISTS customer_suggestions (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "customer_id INTEGER NOT NULL," +
    "suggestion TEXT NOT NULL," +
    "createdAt TEXT DEFAULT CURRENT_TIMESTAMP," +
    "FOREIGN KEY (customer_id) REFERENCES customers(id)" +
    ")"
).run();

// Migration: Add expiration_date column to expired_items if not exists
try {
  const columns = db.prepare("PRAGMA table_info(expired_items)").all();
  const hasExpiryDate = columns.some(col => col.name === "expiration_date");
  if (!hasExpiryDate) {
    db.prepare("ALTER TABLE expired_items ADD COLUMN expiration_date TEXT NOT NULL DEFAULT '1970-01-01'").run();
    console.log("Added expiration_date column to expired_items table");
  }
} catch (err) {
  console.error("Error during expired_items migration:", err);
  throw err;
}
// GET customers
ipcMain.handle("customers:getCustomers", () => {
  try {
    return db.prepare("SELECT * FROM customers").all();
  } catch (err) {
    console.error("Error fetching customers:", err);
    throw new Error("Failed to fetch customers");
  }
});

// ADD customer
ipcMain.handle("customers:addCustomer", (event, customer) => {
  try {
    return db
      .prepare(
        `
      INSERT INTO customers (name, mobile_number, udhari)
      VALUES (?, ?, ?)
    `
      )
      .run(customer.name, customer.mobile_number, customer.udhari || 0.0);
  } catch (err) {
    console.error("Error adding customer:", err);
    throw new Error("Failed to add customer");
  }
});

// UPDATE customer
ipcMain.handle("customers:updateCustomer", (event, customer) => {
  try {
    return db
      .prepare(
        `
      UPDATE customers
      SET name = ?, mobile_number = ?, udhari = ?
      WHERE id = ?
    `
      )
      .run(
        customer.name,
        customer.mobile_number,
        customer.udhari || 0.0,
        customer.id
      );
  } catch (err) {
    console.error("Error updating customer:", err);
    throw new Error("Failed to update customer");
  }
});

// DELETE customer
ipcMain.handle("customers:deleteCustomer", (event, id) => {
  try {
    return db.prepare("DELETE FROM customers WHERE id = ?").run(id);
  } catch (err) {
    console.error("Error deleting customer:", err);
    throw new Error("Failed to delete customer");
  }
});

// CHECK if mobile number exists
ipcMain.handle("customers:checkMobileNumber", (event, mobile_number) => {
  try {
    const row = db
      .prepare("SELECT 1 FROM customers WHERE mobile_number = ?")
      .get(mobile_number);
    return !!row;
  } catch (err) {
    console.error("Error checking mobile number:", err);
    throw new Error("Failed to check mobile number");
  }
});
// GET item by name or barcode for autofill
ipcMain.handle("items:getItemByNameOrBarcode", (event, query) => {
  try {
    const stmt = db.prepare(`
      SELECT id, name, barcode, stock
      FROM items
      WHERE name = ? OR barcode = ?
      LIMIT 1
    `);
    const item = stmt.get(query, query);
    return item || null;
  } catch (err) {
    console.error("Error fetching item by name or barcode:", err);
    throw new Error("Failed to fetch item");
  }
});
// GET items
ipcMain.handle("inventory:getItems", () => {
  try {
    return db.prepare("SELECT * FROM items").all();
  } catch (err) {
    console.error("Error fetching items:", err);
    throw new Error("Failed to fetch items");
  }
});

// ADD item
ipcMain.handle("inventory:addItem", (event, item) => {
  try {
    return db
      .prepare(
        `
      INSERT INTO items (name, barcode, gstPercentage, buyingCost, sellingCost, MRP, stock, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        item.name,
        item.barcode,
        item.gstPercentage,
        item.buyingCost,
        item.sellingCost,
        item.MRP,
        item.stock,
        item.unit
      );
  } catch (err) {
    console.error("Error adding item:", err);
    throw new Error("Failed to add item");
  }
});

// UPDATE item
ipcMain.handle("inventory:updateItem", (event, item) => {
  try {
    return db
      .prepare(
        `
      UPDATE items
      SET name = ?, barcode = ?, gstPercentage = ?, buyingCost = ?, sellingCost = ?, MRP = ?, stock = ?, unit = ?
      WHERE id = ?
    `
      )
      .run(
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
  } catch (err) {
    console.error("Error updating item:", err);
    throw new Error("Failed to update item");
  }
});

// DELETE item
ipcMain.handle("inventory:deleteItem", (event, id) => {
  try {
    return db.prepare("DELETE FROM items WHERE id = ?").run(id);
  } catch (err) {
    console.error("Error deleting item:", err);
    throw new Error("Failed to delete item");
  }
});

// CHECK if barcode exists
ipcMain.handle("inventory:checkBarcode", (event, barcode) => {
  try {
    const row = db
      .prepare("SELECT 1 FROM items WHERE barcode = ?")
      .get(barcode);
    return !!row;
  } catch (err) {
    console.error("Error checking barcode:", err);
    throw new Error("Failed to check barcode");
  }
});

// Save bill and update udhari
ipcMain.handle("billing:saveBill", (event, billData) => {
  const insertBillStmt = db.prepare(`
    INSERT INTO bills (customer_id, payment_method, amount_paid, change, discount, total_cost) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertBillItemStmt = db.prepare(`
    INSERT INTO bill_items (bill_id, item_id, quantity, price, total) 
    VALUES (?, ?, ?, ?, ?)
  `);
  const getStockStmt = db.prepare(`SELECT stock FROM items WHERE barcode = ?`);
  const updateStockStmt = db.prepare(
    `UPDATE items SET stock = stock - ? WHERE barcode = ?`
  );
  const insertUdhariStmt = db.prepare(`
    INSERT INTO udhari (customer_id, bill_id, amount, type) 
    VALUES (?, ?, ?, ?)
  `);
  const transaction = db.transaction((bill) => {
    if (bill.isDebt && !bill.customer_id) {
      throw new Error("Customer ID is required for udhari transactions");
    }
    for (const item of bill.totalItems) {
      const row = getStockStmt.get(item.barcode);
      if (!row) {
        throw new Error(`Item with barcode ${item.barcode} not found`);
      }
      if (row.stock < item.quantity) {
        throw new Error(
          `Insufficient stock for ${item.barcode}. Available: ${row.stock}, Requested: ${item.quantity}`
        );
      }
    }
    const totalCost = Number(bill.totalCost.toFixed(2));
    const amountPaid = bill.isDebt ? 0 : Number(bill.amountPaid.toFixed(2));
    const change = bill.isDebt ? 0 : Number(bill.change.toFixed(2));
    const discount = Number(bill.discount.toFixed(2)) || 0;
    if (isNaN(totalCost))
      throw new Error("Invalid totalCost: must be a valid number");
    if (isNaN(amountPaid))
      throw new Error("Invalid amountPaid: must be a valid number");
    if (isNaN(change))
      throw new Error("Invalid change: must be a valid number");
    if (isNaN(discount))
      throw new Error("Invalid discount: must be a valid number");
    if (totalCost < 0 || amountPaid < 0 || change < 0 || discount < 0) {
      throw new Error(
        "Total cost, amount paid, change, and discount must be non-negative"
      );
    }
    const billId = insertBillStmt.run(
      bill.customer_id || null,
      bill.paymentMethod || "N/A",
      amountPaid,
      change,
      discount,
      totalCost
    ).lastInsertRowid;
    for (const item of bill.totalItems) {
      insertBillItemStmt.run(
        billId,
        item.id,
        item.quantity,
        item.price,
        item.total
      );
      updateStockStmt.run(item.quantity, item.barcode);
    }
    if (bill.isDebt) {
      insertUdhariStmt.run(bill.customer_id, billId, -totalCost, "debt");
      db.prepare("UPDATE customers SET udhari = udhari + ? WHERE id = ?").run(
        -totalCost,
        bill.customer_id
      );
    }
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("billing:newBill", {
        id: billId,
        customer_id: bill.customer_id || null,
        totalItems: bill.totalItems,
        totalCost: totalCost,
        discount: discount,
        amountPaid: amountPaid,
        change: change,
        paymentMethod: bill.paymentMethod || "N/A",
        createdAt: new Date().toISOString(),
      });
    });
    return billId;
  });
  try {
    const billId = transaction(billData);
    return { success: true, billId };
  } catch (err) {
    console.error("Billing transaction failed:", err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// GET bills
ipcMain.handle("billing:getBills", () => {
  try {
    const bills = db
      .prepare(
        `
      SELECT bills.id, bills.customer_id, bills.payment_method, bills.amount_paid, bills.change, bills.discount, bills.total_cost, bills.createdAt,
             customers.name AS customer_name, customers.mobile_number AS customer_mobile
      FROM bills
      LEFT JOIN customers ON bills.customer_id = customers.id
    `
      )
      .all();
    const billItemsStmt = db.prepare(`
      SELECT bi.quantity, bi.price, bi.total, i.name, i.unit AS measure, i.barcode
      FROM bill_items bi
      JOIN items i ON bi.item_id = i.id
      WHERE bi.bill_id = ?
    `);
    return bills.map((bill) => {
      const items = billItemsStmt.all(bill.id);
      return {
        id: bill.id,
        customer_id: bill.customer_id,
        customer_name: bill.customer_name || "N/A",
        customer_mobile: bill.customer_mobile || "N/A",
        createdAt: bill.createdAt,
        data: JSON.stringify({
          totalItems: items,
          discount: bill.discount || 0,
          totalCost: bill.total_cost || bill.amount_paid + bill.change,
          amountPaid: bill.amount_paid,
          change: bill.change,
          paymentMethod: bill.payment_method || "N/A",
        }),
      };
    });
  } catch (err) {
    console.error("Error fetching bills:", err);
    throw new Error("Failed to fetch bills");
  }
});

// GET customer summaries
ipcMain.handle("udhari:getCustomerSummaries", () => {
  try {
    const stmt = db.prepare(`
      SELECT c.id, c.name, c.mobile_number, c.udhari AS total_udhari
      FROM customers c
      ORDER BY c.name ASC
    `);
    return stmt.all();
  } catch (err) {
    console.error("Error fetching customer summaries:", err);
    throw new Error("Failed to fetch customer summaries");
  }
});

// GET udhari entries with customer details
ipcMain.handle("udhari:getEntries", () => {
  try {
    const stmt = db.prepare(`
      SELECT u.id, u.customer_id, u.bill_id, u.amount, u.type, u.createdAt, c.name AS customer_name, c.udhari AS customer_udhari
      FROM udhari u
      JOIN customers c ON u.customer_id = c.id
      ORDER BY u.createdAt DESC
    `);
    return stmt.all();
  } catch (err) {
    console.error("Error fetching udhari entries:", err);
    throw new Error("Failed to fetch udhari entries");
  }
});

// GET bill items for a bill
ipcMain.handle("billing:getBillItems", (event, billId) => {
  try {
    const stmt = db.prepare(`
      SELECT bi.quantity, bi.price, bi.total, i.name
      FROM bill_items bi
      JOIN items i ON bi.item_id = i.id
      WHERE bi.bill_id = ?
    `);
    return stmt.all(billId);
  } catch (err) {
    console.error("Error fetching bill items:", err);
    throw new Error("Failed to fetch bill items");
  }
});

// ADD udhari repayment
ipcMain.handle("udhari:addRepayment", (event, repayment) => {
  const insertStmt = db.prepare(`
    INSERT INTO udhari (customer_id, bill_id, amount, type, createdAt)
    VALUES (?, ?, ?, 'repayment', ?)
  `);
  const updateCustomerStmt = db.prepare(`
    UPDATE customers SET udhari = udhari + ? WHERE id = ?
  `);
  const transaction = db.transaction((repayment) => {
    insertStmt.run(
      repayment.customer_id,
      null,
      repayment.amount,
      repayment.createdAt
    );
    updateCustomerStmt.run(repayment.amount, repayment.customer_id);
  });
  try {
    transaction(repayment);
    return { success: true };
  } catch (err) {
    console.error("Repayment transaction failed:", err);
    return { success: false, error: err.message };
  }
});

// RESTORE udhari entry
ipcMain.handle("udhari:restoreEntry", (event, entry) => {
  const insertStmt = db.prepare(`
    INSERT INTO udhari (customer_id, bill_id, amount, type, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updateCustomerStmt = db.prepare(`
    UPDATE customers SET udhari = udhari + ? WHERE id = ?
  `);
  const transaction = db.transaction((entry) => {
    insertStmt.run(
      entry.customer_id,
      entry.bill_id,
      entry.amount,
      entry.type,
      entry.createdAt
    );
    updateCustomerStmt.run(entry.amount, entry.customer_id);
  });
  try {
    transaction(entry);
    return { success: true };
  } catch (err) {
    console.error("Restore udhari entry failed:", err);
    return { success: false, error: err.message };
  }
});

// DELETE udhari entry
ipcMain.handle("udhari:deleteEntry", (event, id) => {
  const entry = db.prepare("SELECT * FROM udhari WHERE id = ?").get(id);
  if (!entry) throw new Error("Udhari entry not found");
  const deleteStmt = db.prepare("DELETE FROM udhari WHERE id = ?");
  const updateCustomerStmt = db.prepare(`
    UPDATE customers SET udhari = udhari - ? WHERE id = ?
  `);
  const transaction = db.transaction(() => {
    deleteStmt.run(id);
    updateCustomerStmt.run(entry.amount, entry.customer_id);
  });
  try {
    transaction();
    return { success: true };
  } catch (err) {
    console.error("Delete udhari entry failed:", err);
    return { success: false, error: err.message };
  }
});

// CLEAR all udhari entries
ipcMain.handle("udhari:clearAll", () => {
  const deleteStmt = db.prepare("DELETE FROM udhari");
  const resetCustomerStmt = db.prepare("UPDATE customers SET udhari = 0");
  const transaction = db.transaction(() => {
    deleteStmt.run();
    resetCustomerStmt.run();
  });
  try {
    transaction();
    return { success: true };
  } catch (err) {
    console.error("Clear udhari failed:", err);
    return { success: false, error: err.message };
  }
});

// GET item names by barcodes
ipcMain.handle("inventory:getItemNames", (event, barcodes) => {
  try {
    if (!barcodes || barcodes.length === 0) return [];
    const placeholders = barcodes.map(() => "?").join(",");
    const query = `SELECT barcode, name FROM items WHERE barcode IN (${placeholders})`;
    return db.prepare(query).all(...barcodes);
  } catch (err) {
    console.error("Error fetching item names:", err);
    throw new Error("Failed to fetch item names");
  }
});

// GET wholesalers
ipcMain.handle("wholesalers:getWholesalers", () => {
  try {
    return db.prepare("SELECT * FROM wholesalers").all();
  } catch (err) {
    console.error("Error fetching wholesalers:", err);
    throw new Error("Failed to fetch wholesalers");
  }
});

// ADD wholesaler
ipcMain.handle("wholesalers:addWholesaler", (event, wholesaler) => {
  try {
    return db
      .prepare(
        `
      INSERT INTO wholesalers (name, contact_number, email, address, tax_id, moq, total_amount, udhari, specialty_product)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        wholesaler.name,
        wholesaler.contact_number,
        wholesaler.email || null,
        wholesaler.address || null,
        wholesaler.tax_id || null,
        wholesaler.moq || null,
        wholesaler.total_amount || 0.0,
        wholesaler.udhari || 0.0,
        wholesaler.specialty_product || null
      );
  } catch (err) {
    console.error("Error adding wholesaler:", err);
    throw new Error("Failed to add wholesaler");
  }
});

// UPDATE wholesaler
ipcMain.handle("wholesalers:updateWholesaler", (event, wholesaler) => {
  try {
    return db
      .prepare(
        `
      UPDATE wholesalers
      SET name = ?, contact_number = ?, email = ?, address = ?, tax_id = ?, moq = ?, total_amount = ?, udhari = ?, specialty_product = ?
      WHERE id = ?
    `
      )
      .run(
        wholesaler.name,
        wholesaler.contact_number,
        wholesaler.email || null,
        wholesaler.address || null,
        wholesaler.tax_id || null,
        wholesaler.moq || null,
        wholesaler.total_amount || 0.0,
        wholesaler.udhari || 0.0,
        wholesaler.specialty_product || null,
        wholesaler.id
      );
  } catch (err) {
    console.error("Error updating wholesaler:", err);
    throw new Error("Failed to update wholesaler");
  }
});

// DELETE wholesaler
ipcMain.handle("wholesalers:deleteWholesaler", (event, id) => {
  try {
    return db.prepare("DELETE FROM wholesalers WHERE id = ?").run(id);
  } catch (err) {
    console.error("Error deleting wholesaler:", err);
    throw new Error("Failed to delete wholesaler");
  }
});

// CHECK if contact number exists
ipcMain.handle("wholesalers:checkContactNumber", (event, contact_number) => {
  try {
    const row = db
      .prepare("SELECT 1 FROM wholesalers WHERE contact_number = ?")
      .get(contact_number);
    return !!row;
  } catch (err) {
    console.error("Error checking contact number:", err);
    throw new Error("Failed to check contact number");
  }
});

// GET items for a wholesaler
ipcMain.handle("wholesalers:getWholesalerItems", (event, wholesalerId) => {
  try {
    const stmt = db.prepare(`
      SELECT i.id, i.name, i.barcode, i.gstPercentage, i.buyingCost, i.sellingCost, i.mrp, i.stock, i.unit
      FROM wholesaler_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.wholesaler_id = ?
    `);
    return stmt.all(wholesalerId);
  } catch (err) {
    console.error("Error fetching wholesaler items:", err);
    throw new Error("Failed to fetch wholesaler items");
  }
});

// Save wholesaler purchase
ipcMain.handle("wholesalerPurchases:savePurchase", (event, purchaseData) => {
  const insertPurchaseStmt = db.prepare(`
    INSERT INTO wholesaler_purchases (wholesaler_id, invoice_number, total_cost, amount_paid, discount, payment_method, purchase_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPurchaseItemStmt = db.prepare(`
    INSERT INTO wholesaler_purchase_items (purchase_id, item_id, quantity, buying_cost, total, barcode, name, gst_percentage, selling_cost, mrp, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItemStmt = db.prepare(`
    INSERT INTO items (name, barcode, gstPercentage, buyingCost, sellingCost, MRP, stock, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateItemStmt = db.prepare(`
    UPDATE items SET stock = stock + ?, buyingCost = ?, sellingCost = ?, MRP = ?, gstPercentage = ?, unit = ?
    WHERE barcode = ?
  `);
  const insertHistoryStmt = db.prepare(`
    INSERT INTO wholesaler_history (wholesaler_id, purchase_id, amount, type, createdAt, invoice_number, total_cost, amount_paid, discount, payment_method, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateWholesalerStmt = db.prepare(`
    UPDATE wholesalers SET total_amount = total_amount + ?, udhari = udhari + ? WHERE id = ?
  `);
  const insertWholesalerItemStmt = db.prepare(`
    INSERT OR IGNORE INTO wholesaler_items (wholesaler_id, item_id)
    VALUES (?, ?)
  `);
  const transaction = db.transaction((purchase) => {
    if (!purchase.wholesaler_id) {
      throw new Error("Wholesaler ID is required");
    }
    if (!purchase.totalItems || purchase.totalItems.length === 0) {
      throw new Error("At least one item is required");
    }
    const totalCost = Number(purchase.totalCost.toFixed(2));
    const amountPaid = purchase.isDebt ? 0 : Number(purchase.amountPaid.toFixed(2));
    const discount = Number(purchase.discount.toFixed(2)) || 0;
    const debtAmount = totalCost - amountPaid;
    if (isNaN(totalCost) || totalCost < 0) {
      throw new Error("Invalid total cost");
    }
    if (isNaN(amountPaid) || amountPaid < 0) {
      throw new Error("Invalid amount paid");
    }
    if (isNaN(discount) || discount < 0) {
      throw new Error("Invalid discount");
    }
    const purchaseId = insertPurchaseStmt.run(
      purchase.wholesaler_id,
      purchase.invoice_number || null,
      totalCost,
      amountPaid,
      discount,
      purchase.paymentMethod || "N/A",
      purchase.purchase_date || new Date().toISOString(),
      purchase.notes || null
    ).lastInsertRowid;
    for (const item of purchase.totalItems) {
      let itemId = item.id;
      const existingItem = db.prepare(`SELECT id FROM items WHERE barcode = ?`).get(item.barcode);
      if (!existingItem) {
        itemId = insertItemStmt.run(
          item.name,
          item.barcode,
          item.gst_percentage,
          item.buying_cost,
          item.selling_cost,
          item.mrp,
          item.quantity,
          item.unit
        ).lastInsertRowid;
      } else {
        updateItemStmt.run(
          item.quantity,
          item.buying_cost,
          item.selling_cost,
          item.mrp,
          item.gst_percentage,
          item.unit,
          item.barcode
        );
        itemId = existingItem.id;
      }
      insertPurchaseItemStmt.run(
        purchaseId,
        itemId,
        item.quantity,
        item.buying_cost,
        item.total,
        item.barcode,
        item.name,
        item.gst_percentage,
        item.selling_cost,
        item.mrp,
        item.unit
      );
      insertWholesalerItemStmt.run(purchase.wholesaler_id, itemId);
    }
    updateWholesalerStmt.run(totalCost, debtAmount, purchase.wholesaler_id);
    insertHistoryStmt.run(
      purchase.wholesaler_id,
      purchaseId,
      -totalCost,
      purchase.isDebt ? "debt" : "purchase",
      purchase.purchase_date || new Date().toISOString(),
      purchase.invoice_number || null,
      totalCost,
      amountPaid,
      discount,
      purchase.paymentMethod || "N/A",
      purchase.notes || null
    );
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("wholesalerPurchases:newPurchase", {
        id: purchaseId,
        wholesaler_id: purchase.wholesaler_id,
        totalItems: purchase.totalItems,
        totalCost,
        discount,
        amountPaid,
        paymentMethod: purchase.paymentMethod || "N/A",
        invoice_number: purchase.invoice_number || "N/A",
        purchase_date: purchase.purchase_date || new Date().toISOString(),
        notes: purchase.notes || "N/A",
      });
    });
    return purchaseId;
  });
  try {
    const purchaseId = transaction(purchaseData);
    return { success: true, purchaseId };
  } catch (err) {
    console.error("Purchase transaction failed:", err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// GET wholesaler purchases
ipcMain.handle("wholesalerPurchases:getPurchases", () => {
  try {
    const purchases = db
      .prepare(
        `
      SELECT wp.id, wp.wholesaler_id, wp.invoice_number, wp.total_cost, wp.amount_paid, wp.discount, wp.payment_method, wp.purchase_date, wp.notes,
             w.name AS wholesaler_name, w.contact_number AS wholesaler_contact
      FROM wholesaler_purchases wp
      JOIN wholesalers w ON wp.wholesaler_id = w.id
      ORDER BY wp.purchase_date DESC
    `
      )
      .all();
    const purchaseItemsStmt = db.prepare(`
      SELECT wpi.quantity, wpi.buying_cost, wpi.total, wpi.name, wpi.unit, wpi.barcode
      FROM wholesaler_purchase_items wpi
      WHERE wpi.purchase_id = ?
    `);
    return purchases.map((purchase) => {
      const items = purchaseItemsStmt.all(purchase.id);
      return {
        id: purchase.id,
        wholesaler_id: purchase.wholesaler_id,
        wholesaler_name: purchase.wholesaler_name,
        wholesaler_contact: purchase.wholesaler_contact,
        invoice_number: purchase.invoice_number || "N/A",
        purchase_date: purchase.purchase_date,
        data: JSON.stringify({
          totalItems: items,
          totalCost: purchase.total_cost,
          amountPaid: purchase.amount_paid,
          discount: purchase.discount || 0,
          paymentMethod: purchase.payment_method || "N/A",
          notes: purchase.notes || "N/A",
        }),
      };
    });
  } catch (err) {
    console.error("Error fetching purchases:", err);
    throw new Error("Failed to fetch purchases");
  }
});

// GET purchase items for a purchase
ipcMain.handle("wholesalerPurchases:getPurchaseItems", (event, purchaseId) => {
  try {
    const stmt = db.prepare(`
      SELECT wpi.quantity, wpi.buying_cost, wpi.total, wpi.name, wpi.unit, wpi.barcode
      FROM wholesaler_purchase_items wpi
      WHERE wpi.purchase_id = ?
    `);
    return stmt.all(purchaseId);
  } catch (err) {
    console.error("Error fetching purchase items:", err);
    throw new Error("Failed to fetch purchase items");
  }
});

// ADD return/refund
ipcMain.handle("returns:addReturn", (event, returnData) => {
  const getCustomerStmt = db.prepare(`SELECT id FROM customers WHERE mobile_number = ?`);
  const getItemStmt = db.prepare(`SELECT id FROM items WHERE barcode = ?`);
  const getBillStmt = db.prepare(`SELECT customer_id FROM bills WHERE id = ?`);
  const getBillItemStmt = db.prepare(`
    SELECT bi.quantity, bi.total, bi.item_id
    FROM bill_items bi
    JOIN bills b ON bi.bill_id = b.id
    JOIN items i ON bi.item_id = i.id
    WHERE b.id = ? AND i.id = ?
  `);
  const checkDuplicateStmt = db.prepare(`
    SELECT id
    FROM returns
    WHERE bill_id = ? AND item_id = ?
  `);
  const insertReturnStmt = db.prepare(`
    INSERT INTO returns (customer_id, bill_id, item_id, quantity, refund_amount, reason, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateStockStmt = db.prepare(`
    UPDATE items SET stock = stock + ? WHERE id = ?
  `);
  const transaction = db.transaction((data) => {
    if (!data.mobile_number || !data.barcode || !data.bill_id || !data.quantity || !data.refund_amount || !data.createdAt) {
      console.error('Missing required fields');
      throw new Error("All required fields must be provided");
    }
    if (data.quantity <= 0 || data.refund_amount <= 0) {
      console.error('Invalid quantity or refund amount');
      throw new Error("Quantity and refund amount must be positive");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.createdAt)) {
      console.error('Invalid date format:', data.createdAt);
      throw new Error("Invalid date format");
    }
    const customer = getCustomerStmt.get(data.mobile_number);
    if (!customer) {
      console.error('Customer not found for mobile:', data.mobile_number);
      throw new Error("Customer not found");
    }
    const item = getItemStmt.get(data.barcode);
    if (!item) {
      console.error('Item not found for barcode:', data.barcode);
      throw new Error("Item not found");
    }
    const bill = getBillStmt.get(data.bill_id);
    if (!bill) {
      console.error('Bill not found for ID:', data.bill_id);
      throw new Error("Bill not found");
    }
    if (bill.customer_id !== customer.id) {
      console.error('Bill customer mismatch. Bill customer_id:', bill.customer_id, 'Customer ID:', customer.id);
      throw new Error("Bill does not belong to this customer");
    }
    const existingReturn = checkDuplicateStmt.get(data.bill_id, item.id);
    if (existingReturn) {
      console.error('Duplicate return found for bill_id:', data.bill_id, 'item_id:', item.id);
      throw new Error("This item has already been returned for this bill");
    }
    const billItem = getBillItemStmt.get(data.bill_id, item.id);
    if (!billItem) {
      console.error('No purchase found for bill_id:', data.bill_id, 'item_id:', item.id);
      throw new Error("No purchase found for this item in the bill");
    }
    if (billItem.quantity < data.quantity) {
      console.error(`Quantity exceeds purchased. Requested: ${data.quantity}, Purchased: ${billItem.quantity}`);
      throw new Error(`Requested return quantity (${data.quantity}) exceeds purchased quantity (${billItem.quantity})`);
    }
    if (billItem.total < data.refund_amount) {
      console.error(`Refund amount exceeds purchased. Requested: ${data.refund_amount}, Purchased: ${billItem.total}`);
      throw new Error(`Requested refund amount (₹${data.refund_amount}) exceeds original purchase amount (₹${billItem.total})`);
    }
    const returnId = insertReturnStmt.run(
      customer.id,
      data.bill_id,
      item.id,
      data.quantity,
      data.refund_amount,
      data.reason || null,
      data.createdAt
    ).lastInsertRowid;
    updateStockStmt.run(data.quantity, item.id);
    return returnId;
  });
  try {
    const returnId = transaction(returnData);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("returns:newReturn", {
        id: returnId,
        customer_id: getCustomerStmt.get(returnData.mobile_number).id,
        bill_id: returnData.bill_id,
        item_id: getItemStmt.get(returnData.barcode).id,
        quantity: returnData.quantity,
        refund_amount: returnData.refund_amount,
        reason: returnData.reason || "N/A",
        createdAt: returnData.createdAt,
        customer_name: returnData.customer_name,
        customer_mobile: returnData.mobile_number,
        item_name: returnData.item_name,
        item_barcode: returnData.barcode
      });
    });
    return { success: true, returnId };
  } catch (err) {
    console.error("Return transaction failed:", err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// EDIT return/refund
ipcMain.handle("returns:editReturn", (event, returnData) => {
  const getReturnStmt = db.prepare(`
    SELECT r.customer_id, r.bill_id, r.item_id, r.quantity AS old_quantity
    FROM returns r
    WHERE r.id = ?
  `);
  const getItemStmt = db.prepare(`SELECT id, barcode FROM items WHERE name = ?`);
  const getBillItemStmt = db.prepare(`
    SELECT bi.quantity, bi.total, bi.item_id
    FROM bill_items bi
    JOIN bills b ON bi.bill_id = b.id
    JOIN items i ON bi.item_id = i.id
    WHERE b.customer_id = ? AND i.id = ? AND bi.bill_id = ?
  `);
  const checkDuplicateStmt = db.prepare(`
    SELECT id
    FROM returns
    WHERE bill_id = ? AND item_id = ? AND id != ?
  `);
  const updateReturnStmt = db.prepare(`
    UPDATE returns
    SET item_id = ?, quantity = ?, refund_amount = ?
    WHERE id = ?
  `);
  const updateStockStmt = db.prepare(`
    UPDATE items SET stock = stock + ? WHERE id = ?
  `);
  const transaction = db.transaction((data) => {
    if (!data.id || !data.item_name || !data.quantity || !data.refund_amount) {
      throw new Error("All required fields must be provided");
    }
    if (data.quantity <= 0 || data.refund_amount <= 0) {
      throw new Error("Quantity and refund amount must be positive");
    }
    const currentReturn = getReturnStmt.get(data.id);
    if (!currentReturn) {
      throw new Error("Return not found");
    }
    const item = getItemStmt.get(data.item_name);
    if (!item) {
      throw new Error("Item not found");
    }
    if (item.id !== currentReturn.item_id) {
      const existingReturn = checkDuplicateStmt.get(currentReturn.bill_id, item.id, data.id);
      if (existingReturn) {
        throw new Error("This item has already been returned for this bill");
      }
    }
    const billItem = getBillItemStmt.get(currentReturn.customer_id, item.id, currentReturn.bill_id);
    if (!billItem) {
      throw new Error("No purchase found for this customer, item, and bill");
    }
    if (billItem.quantity < data.quantity) {
      throw new Error(`Requested return quantity (${data.quantity}) exceeds purchased quantity (${billItem.quantity})`);
    }
    if (billItem.total < data.refund_amount) {
      throw new Error(`Requested refund amount (₹${data.refund_amount}) exceeds original purchase amount (₹${billItem.total})`);
    }
    updateReturnStmt.run(
      item.id,
      data.quantity,
      data.refund_amount,
      data.id
    );
    const stockAdjustment = data.quantity - currentReturn.old_quantity;
    updateStockStmt.run(stockAdjustment, item.id);
  });
  try {
    transaction(returnData);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("returns:updatedReturn", {
        id: returnData.id,
        item_id: getItemStmt.get(returnData.item_name).id,
        quantity: returnData.quantity,
        refund_amount: returnData.refund_amount,
        item_name: returnData.item_name,
        item_barcode: getItemStmt.get(returnData.item_name).barcode
      });
    });
    return { success: true };
  } catch (err) {
    console.error("Edit return transaction failed:", err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// DELETE return/refund
ipcMain.handle("returns:deleteReturn", (event, id) => {
  const getReturnStmt = db.prepare(`
    SELECT item_id, quantity
    FROM returns
    WHERE id = ?
  `);
  const deleteReturnStmt = db.prepare(`
    DELETE FROM returns
    WHERE id = ?
  `);
  const updateStockStmt = db.prepare(`
    UPDATE items SET stock = stock - ? WHERE id = ?
  `);
  const transaction = db.transaction((id) => {
    const returnItem = getReturnStmt.get(id);
    if (!returnItem) {
      throw new Error("Return not found");
    }
    deleteReturnStmt.run(id);
    updateStockStmt.run(returnItem.quantity, returnItem.item_id);
  });
  try {
    transaction(id);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("returns:deletedReturn", { id });
    });
    return { success: true };
  } catch (err) {
    console.error("Delete return transaction failed:", err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// GET returns
ipcMain.handle("returns:getReturns", () => {
  try {
    const stmt = db.prepare(`
      SELECT r.id, r.customer_id, r.bill_id, r.item_id, r.quantity, r.refund_amount, r.reason, r.createdAt,
             c.name AS customer_name, c.mobile_number AS customer_mobile,
             i.name AS item_name, i.barcode AS item_barcode
      FROM returns r
      JOIN customers c ON r.customer_id = c.id
      JOIN items i ON r.item_id = i.id
      ORDER BY r.createdAt DESC
    `);
    return stmt.all();
  } catch (err) {
    console.error("Error fetching returns:", err);
    throw new Error("Failed to fetch returns");
  }
});

// SEARCH returns
ipcMain.handle("returns:searchReturns", (event, searchTerm) => {
  try {
    const stmt = db.prepare(`
      SELECT r.id, r.customer_id, r.bill_id, r.item_id, r.quantity, r.refund_amount, r.reason, r.createdAt,
             c.name AS customer_name, c.mobile_number AS customer_mobile,
             i.name AS item_name, i.barcode AS item_barcode
      FROM returns r
      JOIN customers c ON r.customer_id = c.id
      JOIN items i ON r.item_id = i.id
      WHERE c.name LIKE '%' || ? || '%'
         OR c.mobile_number LIKE '%' || ? || '%'
         OR r.bill_id LIKE ? || '%'
         OR i.name LIKE '%' || ? || '%'
      ORDER BY r.createdAt DESC
      LIMIT 10
    `);
    return stmt.all(searchTerm, searchTerm, searchTerm, searchTerm);
  } catch (err) {
    console.error("Error searching returns:", err);
    throw new Error("Failed to search returns");
  }
});

// SEARCH bills by bill ID
ipcMain.handle("returns:searchBillIds", (event, searchTerm) => {
  try {
    const stmt = db.prepare(`
      SELECT b.id, c.name AS customer_name, c.mobile_number AS customer_mobile
      FROM bills b
      LEFT JOIN customers c ON b.customer_id = c.id
      WHERE b.id LIKE ? || '%'
      LIMIT 10
    `);
    return stmt.all(searchTerm);
  } catch (err) {
    console.error("Error searching bill IDs:", err);
    throw new Error("Failed to search bill IDs");
  }
});

// SEARCH bills by customer name or phone number
ipcMain.handle("returns:searchCustomerBills", (event, searchTerm) => {
  try {
    const stmt = db.prepare(`
      SELECT b.id, c.name AS customer_name, c.mobile_number AS customer_mobile
      FROM bills b
      JOIN customers c ON b.customer_id = c.id
      WHERE c.name LIKE '%' || ? || '%' OR c.mobile_number LIKE '%' || ? || '%'
      LIMIT 10
    `);
    return stmt.all(searchTerm, searchTerm);
  } catch (err) {
    console.error("Error searching customer bills:", err);
    throw new Error("Failed to search customer bills");
  }
});

// GET items for a specific bill
ipcMain.handle("returns:getBillItemsForReturn", (event, billId) => {
  try {
    const stmt = db.prepare(`
      SELECT i.barcode, i.name
      FROM bill_items bi
      JOIN items i ON bi.item_id = i.id
      WHERE bi.bill_id = ?
    `);
    return stmt.all(billId);
  } catch (err) {
    console.error("Error fetching bill items for return:", err);
    throw new Error("Failed to fetch bill items for return");
  }
});

ipcMain.handle("inventory:getItemByBarcode", (event, barcode) => {
  try {
    const query = `
      SELECT id, name, barcode, gstPercentage, buyingCost, sellingCost, MRP, stock, unit
      FROM items
      WHERE barcode = ?
    `;
    const item = db.prepare(query).get(barcode);
    return item || null;
  } catch (err) {
    console.error('Error in inventory:getItemByBarcode:', {
      message: err.message,
      stack: err.stack,
      barcode: barcode,
    });
    throw new Error(`Failed to fetch item by barcode: ${err.message}`);
  }
});


// GET all expired items
ipcMain.handle("expiredItems:getExpiredItems", () => {
  try {
    const stmt = db.prepare(`
      SELECT ei.id, ei.item_id, ei.quantity, ei.expiration_date, ei.reason, ei.createdAt,
             i.name AS item_name, i.barcode AS item_barcode
      FROM expired_items ei
      JOIN items i ON ei.item_id = i.id
      ORDER BY ei.createdAt DESC
    `);
    return stmt.all();
  } catch (err) {
    console.error("Error fetching expired items:", err);
    throw new Error("Failed to fetch expired items");
  }
});

// ADD expired item
ipcMain.handle("expiredItems:addExpiredItem", (event, expiredItem) => {
  const getItemStmt = db.prepare("SELECT id, stock FROM items WHERE barcode = ?");
  const insertExpiredItemStmt = db.prepare(`
    INSERT INTO expired_items (item_id, quantity, expiration_date, reason, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updateStockStmt = db.prepare("UPDATE items SET stock = stock - ? WHERE id = ?");
  
  const transaction = db.transaction((data) => {
    if (!data.barcode || !data.quantity || !data.expiration_date || !data.createdAt) {
      throw new Error("All required fields (barcode, quantity, expiration_date, createdAt) must be provided");
    }
    if (data.quantity <= 0) {
      throw new Error("Quantity must be positive");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.expiration_date)) {
      throw new Error("Invalid expiry date format, expected YYYY-MM-DD");
    }
    const item = getItemStmt.get(data.barcode);
    if (!item) {
      throw new Error(`Item with barcode ${data.barcode} not found`);
    }
    if (item.stock < data.quantity) {
      throw new Error(`Insufficient stock for item ${data.barcode}. Available: ${item.stock}, requested: ${data.quantity}`);
    }
    const expiredItemId = insertExpiredItemStmt.run(
      item.id,
      data.quantity,
      data.expiration_date,
      data.reason || null,
      data.createdAt
    ).lastInsertRowid;
    updateStockStmt.run(data.quantity, item.id);
    return expiredItemId;
  });

  try {
    const expiredItemId = transaction(expiredItem);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("expiredItems:newExpiredItem", {
        id: expiredItemId,
        item_id: getItemStmt.get(expiredItem.barcode).id,
        quantity: expiredItem.quantity,
        expiration_date: expiredItem.expiration_date,
        reason: expiredItem.reason || "N/A",
        createdAt: expiredItem.createdAt,
        item_name: expiredItem.item_name,
        item_barcode: expiredItem.barcode
      });
    });
    return { success: true, expiredItemId };
  } catch (err) {
    console.error("Add expired item transaction failed:", err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// UPDATE expired item
ipcMain.handle("expiredItems:updateExpiredItem", (event, expiredItem) => {
  const getItemStmt = db.prepare("SELECT id FROM items WHERE barcode = ?");
  const getExpiredItemStmt = db.prepare("SELECT item_id, quantity FROM expired_items WHERE id = ?");
  const updateExpiredItemStmt = db.prepare(`
    UPDATE expired_items
    SET item_id = ?, quantity = ?, expiration_date = ?, reason = ?
    WHERE id = ?
  `);
  const updateStockStmt = db.prepare("UPDATE items SET stock = stock + ? WHERE id = ?");

  const transaction = db.transaction((data) => {
    if (!data.id || !data.barcode || !data.quantity || !data.expiration_date) {
      throw new Error("All required fields (id, barcode, quantity, expiration_date) must be provided");
    }
    if (data.quantity <= 0) {
      throw new Error("Quantity must be positive");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.expiration_date)) {
      throw new Error("Invalid expiry date format, expected YYYY-MM-DD");
    }
    const item = getItemStmt.get(data.barcode);
    if (!item) {
      throw new Error(`Item with barcode ${data.barcode} not found`);
    }
    const currentExpiredItem = getExpiredItemStmt.get(data.id);
    if (!currentExpiredItem) {
      throw new Error("Expired item not found");
    }
    const stockAdjustment = currentExpiredItem.quantity - data.quantity; // Corrected: oldQuantity - newQuantity
    const currentStock = db.prepare("SELECT stock FROM items WHERE id = ?").get(item.id).stock;
    if (stockAdjustment < 0 && currentStock < Math.abs(stockAdjustment)) {
      throw new Error(`Insufficient stock for item ${data.barcode}. Available: ${currentStock}, requested: ${Math.abs(stockAdjustment)}`);
    }
    updateExpiredItemStmt.run(
      item.id,
      data.quantity,
      data.expiration_date,
      data.reason || null,
      data.id
    );
    updateStockStmt.run(stockAdjustment, item.id);
  });

  try {
    transaction(expiredItem);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("expiredItems:updatedExpiredItem", {
        id: expiredItem.id,
        item_id: getItemStmt.get(expiredItem.barcode).id,
        quantity: expiredItem.quantity,
        expiration_date: expiredItem.expiration_date,
        reason: expiredItem.reason || "N/A",
        item_name: expiredItem.item_name,
        item_barcode: expiredItem.barcode
      });
    });
    return { success: true };
  } catch (err) {
    console.error("Update expired item transaction failed:", err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// DELETE expired item
ipcMain.handle("expiredItems:deleteExpiredItem", (event, id) => {
  const getExpiredItemStmt = db.prepare("SELECT item_id, quantity FROM expired_items WHERE id = ?");
  const deleteExpiredItemStmt = db.prepare("DELETE FROM expired_items WHERE id = ?");
  const updateStockStmt = db.prepare("UPDATE items SET stock = stock + ? WHERE id = ?");

  const transaction = db.transaction((id) => {
    const expiredItem = getExpiredItemStmt.get(id);
    if (!expiredItem) {
      throw new Error("Expired item not found");
    }
    deleteExpiredItemStmt.run(id);
    updateStockStmt.run(expiredItem.quantity, expiredItem.item_id);
  });

  try {
    transaction(id);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send("expiredItems:deletedExpiredItem", { id });
    });
    return { success: true };
  } catch (err) {
    console.error("Delete expired item transaction failed:", err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// SEARCH expired items
ipcMain.handle("expiredItems:searchExpiredItems", (event, searchTerm) => {
  try {
    const stmt = db.prepare(`
      SELECT ei.id, ei.item_id, ei.quantity, ei.expiration_date, ei.reason, ei.createdAt,
             i.name AS item_name, i.barcode AS item_barcode
      FROM expired_items ei
      JOIN items i ON ei.item_id = i.id
      WHERE i.name LIKE '%' || ? || '%' OR i.barcode LIKE '%' || ? || '%'
      ORDER BY ei.createdAt DESC
      LIMIT 10
    `);
    return stmt.all(searchTerm, searchTerm);
  } catch (err) {
    console.error("Error searching expired items:", err);
    throw new Error("Failed to search expired items");
  }
});

// GET customer suggestions
ipcMain.handle("customerSuggestions:getSuggestions", () => {
    try {
        const stmt = db.prepare(
            "SELECT cs.id, cs.customer_id, cs.suggestion, cs.createdAt, c.name AS customer_name, c.mobile_number AS customer_mobile " +
            "FROM customer_suggestions cs " +
            "JOIN customers c ON cs.customer_id = c.id " +
            "ORDER BY cs.id DESC" // Changed to ORDER BY id DESC for descending order
        );
        return stmt.all();
    } catch (err) {
        console.error("Error fetching customer suggestions:", err);
        throw new Error("Failed to fetch customer suggestions");
    }
});

// ADD customer suggestion with new customer handling
ipcMain.handle("customerSuggestions:addSuggestion", (event, suggestionData) => {
    const insertCustomerStmt = db.prepare(
        "INSERT INTO customers (name, mobile_number, udhari) VALUES (?, ?, 0.0)"
    );
    const insertSuggestionStmt = db.prepare(
        "INSERT INTO customer_suggestions (customer_id, suggestion, createdAt) VALUES (?, ?, ?)"
    );
    const checkCustomerStmt = db.prepare("SELECT id FROM customers WHERE mobile_number = ?");
    const transaction = db.transaction((data) => {
        let customerId;
        const existingCustomer = checkCustomerStmt.get(data.mobile_number);
        if (existingCustomer) {
            customerId = existingCustomer.id;
        } else {
            if (!data.name || !data.mobile_number) {
                throw new Error("Name and mobile number are required for new customers");
            }
            if (!/^\d+$/.test(data.mobile_number)) {
                throw new Error("Mobile number must contain only digits");
            }
            const result = insertCustomerStmt.run(data.name, data.mobile_number);
            customerId = result.lastInsertRowid;
        }
        if (!data.suggestion || !data.createdAt) {
            throw new Error("Suggestion and createdAt are required");
        }
        return insertSuggestionStmt.run(customerId, data.suggestion, data.createdAt);
    });
    try {
        const result = transaction(suggestionData);
        const suggestionId = result.lastInsertRowid;
        const customer = suggestionData.customer_id ? 
            db.prepare("SELECT name, mobile_number FROM customers WHERE id = ?").get(suggestionData.customer_id) :
            { name: suggestionData.name, mobile_number: suggestionData.mobile_number };
        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send("customerSuggestions:newSuggestion", {
                id: suggestionId,
                customer_id: suggestionData.customer_id || suggestionId,
                suggestion: suggestionData.suggestion,
                createdAt: suggestionData.createdAt,
                customer_name: customer.name,
                customer_mobile: customer.mobile_number
            });
        });
        return { success: true, suggestionId };
    } catch (err) {
        console.error("Add customer suggestion transaction failed:", err.message, err.stack);
        return { success: false, error: err.message };
    }
});

// GET customer for autofill (support multiple matches)
ipcMain.handle("customerSuggestions:getCustomerByNameOrMobile", (event, query, multiple = false) => {
    try {
        const stmt = db.prepare(
            "SELECT id, name, mobile_number FROM customers WHERE name LIKE ? OR mobile_number LIKE ?"
        );
        const customers = stmt.all(`%${query}%`, `%${query}%`);
        return multiple ? customers : (customers.length > 0 ? customers[0] : null);
    } catch (err) {
        console.error("Error fetching customer for autofill:", err);
        throw new Error("Failed to fetch customer");
    }
});

// UPDATE customer suggestion
ipcMain.handle("customerSuggestions:updateSuggestion", (event, { id, suggestion }) => {
    try {
        const stmt = db.prepare(
            "UPDATE customer_suggestions SET suggestion = ? WHERE id = ?"
        );
        const result = stmt.run(suggestion, id);
        if (result.changes === 0) {
            throw new Error("Suggestion not found or no changes made");
        }
        const updatedSuggestion = db.prepare(
            "SELECT cs.id, cs.customer_id, cs.suggestion, cs.createdAt, c.name AS customer_name, c.mobile_number AS customer_mobile " +
            "FROM customer_suggestions cs JOIN customers c ON cs.customer_id = c.id WHERE cs.id = ?"
        ).get(id);
        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send("customerSuggestions:updatedSuggestion", updatedSuggestion);
        });
        return { success: true, updatedSuggestion };
    } catch (err) {
        console.error("Error updating suggestion:", err);
        return { success: false, error: err.message };
    }
});

// DELETE customer suggestion
ipcMain.handle("customerSuggestions:deleteSuggestion", (event, id) => {
    try {
        const stmt = db.prepare("DELETE FROM customer_suggestions WHERE id = ?");
        const result = stmt.run(id);
        if (result.changes === 0) {
            throw new Error("Suggestion not found");
        }
        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send("customerSuggestions:deletedSuggestion", id);
        });
        return { success: true };
    } catch (err) {
        console.error("Error deleting suggestion:", err);
        return { success: false, error: err.message };
    }
});