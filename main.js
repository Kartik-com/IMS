const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: process.env.NODE_ENV !== 'production', // Disable DevTools in production
    },
  });

  mainWindow.loadFile('index.html');

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Main',
          click: () => {
            mainWindow.loadFile('index.html');
          },
        },
        {
          label: 'Billing',
          click: () => {
            mainWindow.loadFile('./Billing/POS/pos.html');
          },
        },
        {
          label: 'LowStock',
          click: () => {
            mainWindow.loadFile('./Inventory/Low stock - Out of stock/stockStatus.html');
          },
        },
        {
          label: 'Inventory Management',
          click: () => {
            mainWindow.loadFile('./Inventory/InventoryList/inventory.html');
          },
        },
        {
          label: 'Wholesalers List',
          click: () => {
            mainWindow.loadFile('./Inventory/Wholeseller list/Wholesellerlist.html');
          },
        },
        {
          label: 'Wholesalers Purchase',
          click: () => {
            mainWindow.loadFile('./Inventory/wholesalerPurchase/wholesalerPurchase.html');
          },
        },
        {
          label: 'Admin',
          click: () => {
            mainWindow.loadFile('./Admin/Sales/sales.html');
          },
        },
        {
          label: 'wholesaler history',
          click: () => {
            mainWindow.loadFile('./Inventory/wholesalersHistory/wholesalersHistory.html');
          },
        },
        { type: 'separator' },
        {
          label: 'Exit',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            console.log('Finance Manager v1.0');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

// Load IPC handlers before creating the window
require(path.join(__dirname, 'DB/ipcHandlers'));

app.whenReady().then(() => {
  createWindow();
  console.log('Main process ready');

  // Send ready signal to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('main-process-ready');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle SIGINT for graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT. Closing application...');
  app.quit();
});

ipcMain.on('navigate-to', (event, page) => {
  mainWindow.loadFile(page);
});

// IPC for printing from billing page
ipcMain.on('print-bill', (event, billData) => {
  const printWindow = new BrowserWindow({ show: false });
  const date = new Date().toLocaleString();

  let tableContent = `
    <table border="1" style="width: 100%; border-collapse: collapse;">
        <thead>
            <tr>
                <th>Barcode</th>
                <th>Name</th>
                <th>Price</th>
                <th>Quantity</th>
                <th>Measure</th>
            </tr>
        </thead>
        <tbody>
  `;
  billData.items.forEach(item => {
    tableContent += `
        <tr>
            <td>${item.barcode}</td>
            <td>${item.name}</td>
            <td>₹${item.price.toFixed(2)}</td>
            <td>${item.quantity}</td>
            <td>${item.measure}</td>
        </tr>
    `;
  });
  tableContent += '</tbody></table>';

  const printContent = `
    <h2>Finance Manager - Bill</h2>
    <p><strong>Date:</strong> ${date}</p>
    ${tableContent}
    <p><strong>Cost:</strong> ₹${billData.cost}</p>
    <p><strong>Discount:</strong> ₹${billData.discount.toFixed(2)}</p>
    <p><strong>GST:</strong> ₹${billData.gst}</p>
    <p><strong>Total Cost:</strong> ₹${billData.totalCost}</p>
    <p><strong>Payment Method:</strong> ${billData.paymentMethod}</p>
    <p><strong>Amount Paid:</strong> ₹${billData.amountPaid.toFixed(2)}</p>
    <p><strong>Change:</strong> ₹${billData.change.toFixed(2)}</p>
  `;

  printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printContent)}`);
  printWindow.webContents.on('did-finish-load', () => {
    printWindow.webContents.print({ silent: false }, () => {
      printWindow.close();
    });
  });
});