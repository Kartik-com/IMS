const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded, initializing stock status');
    loadStockData();
});

async function loadStockData() {
    try {
        const items = await ipcRenderer.invoke('inventory:getItems');
        console.log('Loaded items:', items);
        updateStockTables(items);
    } catch (error) {
        console.error('Error loading stock data:', error.message, error.stack);
        alert(`Failed to load stock data: ${error.message}`);
    }
}

function updateStockTables(items) {
    const availableStockBody = document.getElementById('availableStockBody');
    const lowStockBody = document.getElementById('lowStockBody');
    const outOfStockBody = document.getElementById('outOfStockBody');

    availableStockBody.innerHTML = '';
    lowStockBody.innerHTML = '';
    outOfStockBody.innerHTML = '';

    // Define thresholds: Low stock <= 10, Out of stock = 0
    const LOW_STOCK_THRESHOLD = 10;

    items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.barcode}</td>
            <td>${item.name}</td>
            <td>${item.stock}</td>
            <td>${item.unit}</td>
        `;

        if (item.stock === 0) {
            outOfStockBody.appendChild(row);
        } else if (item.stock <= LOW_STOCK_THRESHOLD) {
            lowStockBody.appendChild(row);
        } else {
            availableStockBody.appendChild(row);
        }
    });
}