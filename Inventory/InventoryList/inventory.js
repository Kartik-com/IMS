const { ipcRenderer } = require('electron');

let fullInventory = [];
let editingItemId = null;

document.addEventListener('DOMContentLoaded', () => {
    loadInventory();
    document.getElementById('searchInput').addEventListener('input', filterInventory);
});

// Load inventory from local SQLite
async function loadInventory() {
    try {
        const items = await ipcRenderer.invoke('inventory:getItems');
        fullInventory = items;
        console.log("Items:", items);
        displayInventory(items);
    } catch (error) {
        console.error('Error loading inventory:', error);
        alert('Failed to load inventory.');
    }
}

function displayInventory(inventory) {
    const inventoryBody = document.getElementById('inventoryBody');
    inventoryBody.innerHTML = '';

    inventory.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.barcode}</td>
            <td>${item.gstPercentage.toFixed(2)}%</td>
            <td>₹${item.buyingCost.toFixed(2)}</td>
            <td>₹${item.sellingCost.toFixed(2)}</td>
            <td>₹${item.MRP.toFixed(2)}</td>
            <td>${item.stock}</td>
            <td>${item.unit || 'Unit'}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="editProduct(${item.id})">
                    Edit
                </button>
            </td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="deleteProduct(${item.id})">
                    Delete
                </button>
            </td>
        `;
        inventoryBody.appendChild(row);
    });
}

function filterInventory() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const filteredInventory = fullInventory.filter(item => 
        item.name.toLowerCase().includes(searchTerm) || 
        item.barcode.toLowerCase().includes(searchTerm)
    );
    displayInventory(filteredInventory);
}

function editProduct(id) {
    const item = fullInventory.find(item => item.id === id);
    if (!item) return;

    document.getElementById('name').value = item.name;
    document.getElementById('barcode').value = item.barcode;
    document.getElementById('gstPercentage').value = item.gstPercentage;
    document.getElementById('buyingCost').value = item.buyingCost;
    document.getElementById('sellingCost').value = item.sellingCost;
    document.getElementById('mrp').value = item.MRP;
    document.getElementById('stock').value = item.stock;
    document.getElementById('unit').value = item.unit || 'Unit';

    document.getElementById('actionButton').textContent = 'Edit Product';
    editingItemId = id;
}

async function handleAction() {
    if (editingItemId) {
        await updateProduct();
    } else {
        await addProduct();
    }
}

async function addProduct() {
    const name = document.getElementById('name').value.trim();
    const barcode = document.getElementById('barcode').value.trim();
    const gstPercentage = parseFloat(document.getElementById('gstPercentage').value);
    const buyingCost = parseFloat(document.getElementById('buyingCost').value);
    const sellingCost = parseFloat(document.getElementById('sellingCost').value);
    const mrp = parseFloat(document.getElementById('mrp').value);
    const stock = parseInt(document.getElementById('stock').value);
    const unit = document.getElementById('unit').value;

    if (!name || !barcode || isNaN(gstPercentage) || isNaN(buyingCost) || 
        isNaN(sellingCost) || isNaN(mrp) || isNaN(stock) || !unit) {
        alert('Please fill out all fields correctly.');
        return;
    }

    const barcodeError = document.getElementById('barcode-error');
    try {
        const exists = await ipcRenderer.invoke('inventory:checkBarcode', barcode);
        if (exists) {
            barcodeError.style.display = 'block';
            return;
        } else {
            barcodeError.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking barcode:', error);
        alert('Failed to check barcode.');
        return;
    }

    const product = {
        name,
        barcode,
        gstPercentage,
        buyingCost,
        sellingCost,
        MRP: mrp,
        stock,
        unit
    };

    try {
        await ipcRenderer.invoke('inventory:addItem', product);
        resetForm();
        await loadInventory();
    } catch (error) {
        console.error('Error adding product:', error);
        alert('Failed to add product: ' + error.message);
    }
}

async function updateProduct() {
    const name = document.getElementById('name').value.trim();
    const barcode = document.getElementById('barcode').value.trim();
    const gstPercentage = parseFloat(document.getElementById('gstPercentage').value);
    const buyingCost = parseFloat(document.getElementById('buyingCost').value);
    const sellingCost = parseFloat(document.getElementById('sellingCost').value);
    const mrp = parseFloat(document.getElementById('mrp').value);
    const stock = parseInt(document.getElementById('stock').value);
    const unit = document.getElementById('unit').value || 'Unit';
  
    if (!name || !barcode || isNaN(gstPercentage) || isNaN(buyingCost) || 
        isNaN(sellingCost) || isNaN(mrp) || isNaN(stock) || !unit) {
      alert('Please fill out all fields correctly.');
      return;
    }
  
    // Check if barcode is already used by another item
    const barcodeError = document.getElementById('barcode-error');
    try {
      const existingItem = await ipcRenderer.invoke('inventory:checkBarcode', barcode);
      const currentItem = fullInventory.find(item => item.id === editingItemId);
      if (existingItem && currentItem.barcode !== barcode) {
        barcodeError.style.display = 'block';
        return;
      } else {
        barcodeError.style.display = 'none';
      }
    } catch (error) {
      console.error('Error checking barcode:', error);
      alert('Failed to check barcode.');
      return;
    }
  
    const product = {
      id: editingItemId,
      name,
      barcode,
      gstPercentage,
      buyingCost,
      sellingCost,
      MRP: mrp,
      stock,
      unit
    };
  
    try {
      await ipcRenderer.invoke('inventory:updateItem', product);
      resetForm();
      await loadInventory();
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Failed to update product: ' + error.message);
    }
  }

async function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        try {
            await ipcRenderer.invoke('inventory:deleteItem', id);
            resetForm();
            await loadInventory();
        } catch (error) {
            console.error('Error deleting product:', error);
            alert('Failed to delete product: ' + error.message);
        }
    }
}

function resetForm() {
    document.getElementById('name').value = '';
    document.getElementById('barcode').value = '';
    document.getElementById('gstPercentage').value = '';
    document.getElementById('buyingCost').value = '';
    document.getElementById('sellingCost').value = '';
    document.getElementById('mrp').value = '';
    document.getElementById('stock').value = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('barcode-error').style.display = 'none';
    document.getElementById('actionButton').textContent = 'Add Product';
    editingItemId = null;
}
