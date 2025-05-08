const { ipcMain, app, BrowserWindow } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

// Create or open the SQLite DB
const dbPath = path.join(__dirname, 'inventory.db');
const db = new Database(dbPath);



// Schema migration: Add discount and total_cost columns if they don't exist
try {
  db.prepare('ALTER TABLE bills ADD COLUMN discount REAL DEFAULT 0.0').run();
  console.log('Added discount column to bills table');
} catch (err) {
  if (err.code === 'SQLITE_ERROR' && err.message.includes('duplicate column name')) {
    console.log('Discount column already exists in bills table');
  } else {
    console.error('Error adding discount column:', err);
    throw err;
  }
}

try {
  db.prepare('ALTER TABLE bills ADD COLUMN total_cost REAL').run();
  console.log('Added total_cost column to bills table');
} catch (err) {
  if (err.code === 'SQLITE_ERROR' && err.message.includes('duplicate column name')) {
    console.log('Total_cost column already exists in bills table');
  } else {
    console.error('Error adding total_cost column:', err);
    throw err;
  }
}

// Create tables (for new databases)
db.prepare(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile_number TEXT UNIQUE NOT NULL,
    udhari REAL DEFAULT 0.0
  )
`).run();

db.prepare(`
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
`).run();

db.prepare(`
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
`).run();

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

db.prepare(`
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
`).run();

console.log('Database initialized successfully');

// GET customers
ipcMain.handle('customers:getCustomers', () => {
  try {
    return db.prepare('SELECT * FROM customers').all();
  } catch (err) {
    console.error('Error fetching customers:', err);
    throw new Error('Failed to fetch customers');
  }
});

// ADD customer
ipcMain.handle('customers:addCustomer', (event, customer) => {
  try {
    return db.prepare(`
      INSERT INTO customers (name, mobile_number, udhari)
      VALUES (?, ?, ?)
    `).run(
      customer.name,
      customer.mobile_number,
      customer.udhari || 0.0
    );
  } catch (err) {
    console.error('Error adding customer:', err);
    throw new Error('Failed to add customer');
  }
});

// UPDATE customer
ipcMain.handle('customers:updateCustomer', (event, customer) => {
  try {
    return db.prepare(`
      UPDATE customers
      SET name = ?, mobile_number = ?, udhari = ?
      WHERE id = ?
    `).run(
      customer.name,
      customer.mobile_number,
      customer.udhari || 0.0,
      customer.id
    );
  } catch (err) {
    console.error('Error updating customer:', err);
    throw new Error('Failed to update customer');
  }
});

// DELETE customer
ipcMain.handle('customers:deleteCustomer', (event, id) => {
  try {
    return db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  } catch (err) {
    console.error('Error deleting customer:', err);
    throw new Error('Failed to delete customer');
  }
});

// CHECK if mobile number exists
ipcMain.handle('customers:checkMobileNumber', (event, mobile_number) => {
  try {
    const row = db.prepare('SELECT 1 FROM customers WHERE mobile_number = ?').get(mobile_number);
    return !!row;
  } catch (err) {
    console.error('Error checking mobile number:', err);
    throw new Error('Failed to check mobile number');
  }
});

// GET items
ipcMain.handle('inventory:getItems', () => {
  try {
    return db.prepare('SELECT * FROM items').all();
  } catch (err) {
    console.error('Error fetching items:', err);
    throw new Error('Failed to fetch items');
  }
});

// ADD item
ipcMain.handle('inventory:addItem', (event, item) => {
  try {
    return db.prepare(`
      INSERT INTO items (name, barcode, gstPercentage, buyingCost, sellingCost, MRP, stock, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.name, item.barcode, item.gstPercentage, item.buyingCost,
      item.sellingCost, item.MRP, item.stock, item.unit
    );
  } catch (err) {
    console.error('Error adding item:', err);
    throw new Error('Failed to add item');
  }
});

// UPDATE item
ipcMain.handle('inventory:updateItem', (event, item) => {
  try {
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
  } catch (err) {
    console.error('Error updating item:', err);
    throw new Error('Failed to update item');
  }
});

// DELETE item
ipcMain.handle('inventory:deleteItem', (event, id) => {
  try {
    return db.prepare('DELETE FROM items WHERE id = ?').run(id);
  } catch (err) {
    console.error('Error deleting item:', err);
    throw new Error('Failed to delete item');
  }
});

// CHECK if barcode exists
ipcMain.handle('inventory:checkBarcode', (event, barcode) => {
  try {
    const row = db.prepare('SELECT 1 FROM items WHERE barcode = ?').get(barcode);
    return !!row;
  } catch (err) {
    console.error('Error checking barcode:', err);
    throw new Error('Failed to check barcode');
  }
});

// Save bill and update udhari
ipcMain.handle('billing:saveBill', (event, billData) => {
  const insertBillStmt = db.prepare(`
    INSERT INTO bills (customer_id, payment_method, amount_paid, change, discount, total_cost) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertBillItemStmt = db.prepare(`
    INSERT INTO bill_items (bill_id, item_id, quantity, price, total) 
    VALUES (?, ?, ?, ?, ?)
  `);
  const getStockStmt = db.prepare(`SELECT stock FROM items WHERE barcode = ?`);
  const updateStockStmt = db.prepare(`UPDATE items SET stock = stock - ? WHERE barcode = ?`);
  const insertUdhariStmt = db.prepare(`
    INSERT INTO udhari (customer_id, bill_id, amount, type) 
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction((bill) => {
    // Validate customer for udhari
    if (bill.isDebt && !bill.customer_id) {
      throw new Error('Customer ID is required for udhari transactions');
    }

    // Check stock for each item
    for (const item of bill.totalItems) {
      const row = getStockStmt.get(item.barcode);
      if (!row) {
        throw new Error(`Item with barcode ${item.barcode} not found`);
      }
      if (row.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${item.barcode}. Available: ${row.stock}, Requested: ${item.quantity}`);
      }
    }

    // Use provided values and round to two decimal places
    const totalCost = Number(bill.totalCost.toFixed(2));
    const amountPaid = bill.isDebt ? 0 : Number(bill.amountPaid.toFixed(2));
    const change = bill.isDebt ? 0 : Number(bill.change.toFixed(2));
    const discount = Number(bill.discount.toFixed(2)) || 0;

    // Validate numerical values
    if (isNaN(totalCost)) throw new Error('Invalid totalCost: must be a valid number');
    if (isNaN(amountPaid)) throw new Error('Invalid amountPaid: must be a valid number');
    if (isNaN(change)) throw new Error('Invalid change: must be a valid number');
    if (isNaN(discount)) throw new Error('Invalid discount: must be a valid number');
    if (totalCost < 0 || amountPaid < 0 || change < 0 || discount < 0) {
      throw new Error('Total cost, amount paid, change, and discount must be non-negative');
    }

    // Insert the bill
    const billId = insertBillStmt.run(
      bill.customer_id || null,
      bill.paymentMethod || 'N/A',
      amountPaid,
      change,
      discount,
      totalCost
    ).lastInsertRowid;

    // Insert bill items
    for (const item of bill.totalItems) {
      insertBillItemStmt.run(billId, item.id, item.quantity, item.price, item.total);
      updateStockStmt.run(item.quantity, item.barcode);
    }

    // Record udhari if debt
    if (bill.isDebt) {
      insertUdhariStmt.run(bill.customer_id, billId, -totalCost, 'debt');
      db.prepare('UPDATE customers SET udhari = udhari + ? WHERE id = ?')
        .run(-totalCost, bill.customer_id);
    }

    // Notify all open windows of the new bill
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('billing:newBill', {
        id: billId,
        customer_iddob: bill.customer_id || null,
        totalItems: bill.totalItems,
        totalCost: totalCost,
        discount: discount,
        amountPaid: amountPaid,
        change: change,
        paymentMethod: bill.paymentMethod || 'N/A',
        createdAt: new Date().toISOString()
      });
    });

    return billId;
  });

  try {
    console.log('Processing bill:', billData);
    const billId = transaction(billData);
    console.log('Bill saved successfully with ID:', billId);
    return { success: true, billId };
  } catch (err) {
    console.error('Billing transaction failed:', err.message, err.stack);
    return { success: false, error: err.message };
  }
});

// GET bills
ipcMain.handle('billing:getBills', () => {
  try {
    const bills = db.prepare(`
      SELECT bills.id, bills.customer_id, bills.payment_method, bills.amount_paid, bills.change, bills.discount, bills.total_cost, bills.createdAt,
             customers.name AS customer_name, customers.mobile_number AS customer_mobile
      FROM bills
      LEFT JOIN customers ON bills.customer_id = customers.id
    `).all();

    const billItemsStmt = db.prepare(`
      SELECT bi.quantity, bi.price, bi.total, i.name, i.unit AS measure, i.barcode
      FROM bill_items bi
      JOIN items i ON bi.item_id = i.id
      WHERE bi.bill_id = ?
    `);

    return bills.map(bill => {
      const items = billItemsStmt.all(bill.id);
      return {
        id: bill.id,
        customer_id: bill.customer_id,
        customer_name: bill.customer_name || 'N/A',
        customer_mobile: bill.customer_mobile || 'N/A',
        createdAt: bill.createdAt,
        data: JSON.stringify({
          totalItems: items,
          discount: bill.discount || 0,
          totalCost: bill.total_cost || (bill.amount_paid + bill.change),
          amountPaid: bill.amount_paid,
          change: bill.change,
          paymentMethod: bill.payment_method || 'N/A'
        })
      };
    });
  } catch (err) {
    console.error('Error fetching bills:', err);
    throw new Error('Failed to fetch bills');
  }
});

// GET customer summaries
ipcMain.handle('udhari:getCustomerSummaries', () => {
  try {
    const stmt = db.prepare(`
      SELECT c.id, c.name, c.mobile_number, c.udhari AS total_udhari
      FROM customers c
      ORDER BY c.name ASC
    `);
    return stmt.all();
  } catch (err) {
    console.error('Error fetching customer summaries:', err);
    throw new Error('Failed to fetch customer summaries');
  }
});

// GET udhari entries with customer details
ipcMain.handle('udhari:getEntries', () => {
  try {
    const stmt = db.prepare(`
      SELECT u.id, u.customer_id, u.bill_id, u.amount, u.type, u.createdAt, c.name AS customer_name, c.udhari AS customer_udhari
      FROM udhari u
      JOIN customers c ON u.customer_id = c.id
      ORDER BY u.createdAt DESC
    `);
    return stmt.all();
  } catch (err) {
    console.error('Error fetching udhari entries:', err);
    throw new Error('Failed to fetch udhari entries');
  }
});

// GET bill items for a bill
ipcMain.handle('billing:getBillItems', (event, billId) => {
  try {
    const stmt = db.prepare(`
      SELECT bi.quantity, bi.price, bi.total, i.name
      FROM bill_items bi
      JOIN items i ON bi.item_id = i.id
      WHERE bi.bill_id = ?
    `);
    return stmt.all(billId);
  } catch (err) {
    console.error('Error fetching bill items:', err);
    throw new Error('Failed to fetch bill items');
  }
});

// ADD udhari repayment
ipcMain.handle('udhari:addRepayment', (event, repayment) => {
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
    console.error('Repayment transaction failed:', err);
    return { success: false, error: err.message };
  }
});

// RESTORE udhari entry
ipcMain.handle('udhari:restoreEntry', (event, entry) => {
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
    console.error('Restore udhari entry failed:', err);
    return { success: false, error: err.message };
  }
});

// DELETE udhari entry
ipcMain.handle('udhari:deleteEntry', (event, id) => {
  const entry = db.prepare('SELECT * FROM udhari WHERE id = ?').get(id);
  if (!entry) throw new Error('Udhari entry not found');

  const deleteStmt = db.prepare('DELETE FROM udhari WHERE id = ?');
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
    console.error('Delete udhari entry failed:', err);
    return { success: false, error: err.message };
  }
});

// CLEAR all udhari entries
ipcMain.handle('udhari:clearAll', () => {
  const deleteStmt = db.prepare('DELETE FROM udhari');
  const resetCustomerStmt = db.prepare('UPDATE customers SET udhari = 0');

  const transaction = db.transaction(() => {
    deleteStmt.run();
    resetCustomerStmt.run();
  });

  try {
    transaction();
    return { success: true };
  } catch (err) {
    console.error('Clear udhari failed:', err);
    return { success: false, error: err.message };
  }
});

// GET item names by barcodes
ipcMain.handle('inventory:getItemNames', (event, barcodes) => {
  try {
    if (!barcodes || barcodes.length === 0) return [];
    const placeholders = barcodes.map(() => '?').join(',');
    const query = `SELECT barcode, name FROM items WHERE barcode IN (${placeholders})`;
    return db.prepare(query).all(...barcodes);
  } catch (err) {
    console.error('Error fetching item names:', err);
    throw new Error('Failed to fetch item names');
  }
});