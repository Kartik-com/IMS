const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');

let isLoggedIn = false; // Track login state

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('login.html'); // Load login page by default
  // mainWindow.webContents.openDevTools();

  // Function to update menu based on login state
  function updateMenu() {
    const menuTemplate = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Dashboard',
            click: () => {
              if (isLoggedIn) mainWindow.loadFile('dashboard.html');
            },
            enabled: isLoggedIn
          },
          {
            label: 'Billing',
            click: () => {
              if (isLoggedIn) mainWindow.loadFile('billing.html');
            },
            enabled: isLoggedIn
          },
          {
            label: 'Inventory Management',
            click: () => {
              if (isLoggedIn) mainWindow.loadFile('inventory.html');
            },
            enabled: isLoggedIn
          },
          { type: 'separator' },
          {
            label: 'Exit',
            click: () => {
              app.quit();
            }
          }
        ]
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
          { role: 'selectAll' }
        ]
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
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { role: 'close' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About',
            click: () => {
              alert('Finance Manager v1.0');
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
  }

  // Update menu initially (disabled on login page)
  updateMenu();

  // Listen for page navigation and update login state
  mainWindow.webContents.on('did-finish-load', () => {
    const currentUrl = mainWindow.webContents.getURL();
    if (currentUrl.endsWith('login.html')) {
      isLoggedIn = false;
    } else {
      isLoggedIn = true;
    }
    updateMenu();
  });
}

// app.whenReady().then(() => {
//   createWindow();

//   app.on('activate', () => {
//     if (BrowserWindow.getAllWindows().length === 0) createWindow();
//   });
// });

app.whenReady().then(() => {
  createWindow();

  // Load IPC handlers after app is ready
  require(path.join(__dirname, 'ipcHandlers'));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle navigation from login to dashboard
ipcMain.on('navigate-to-dashboard', (event) => {
  const mainWindow = BrowserWindow.getFocusedWindow();
  if (mainWindow) {
    mainWindow.loadFile('dashboard.html');
  }
});

// Handle printing from billing page
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
            <td>$${item.price.toFixed(2)}</td>
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
    <p><strong>Cost:</strong> $${billData.cost}</p>
    <p><strong>Discount:</strong> $${billData.discount.toFixed(2)}</p>
    <p><strong>GST:</strong> $${billData.gst}</p>
    <p><strong>Total Cost:</strong> $${billData.totalCost}</p>
    <p><strong>Payment Method:</strong> ${billData.paymentMethod}</p>
    <p><strong>Amount Paid:</strong> $${billData.amountPaid.toFixed(2)}</p>
    <p><strong>Change:</strong> $${billData.change.toFixed(2)}</p>
  `;

  printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printContent)}`);
  printWindow.webContents.on('did-finish-load', () => {
    printWindow.webContents.print({ silent: false }, () => {
      printWindow.close();
    });
  });
});