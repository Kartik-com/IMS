const { ipcRenderer } = require('electron');

// Register Chart.js data labels plugin
Chart.register(ChartDataLabels);

document.addEventListener('DOMContentLoaded', () => {
  const timeSpanSelect = document.getElementById('timeSpan');
  const salesChartCanvas = document.getElementById('salesChart');
  const loadingDiv = document.getElementById('loading');
  const noDataDiv = document.getElementById('noData');
  let salesChart;

  // Initialize Chart.js
  const initChart = (labels, data) => {
    if (salesChart) salesChart.destroy();
    salesChart = new Chart(salesChartCanvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Sales (₹)',
          data: data,
          backgroundColor: '#3B82F6',
          borderColor: '#1A365D',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Sales Amount (₹)', font: { size: 14, weight: '500' }, color: '#1A365D' },
            grid: { color: '#E2E8F0' }
          },
          x: {
            title: { display: true, text: 'Time Period', font: { size: 14, weight: '500' }, color: '#1A365D' },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1A365D',
            titleFont: { size: 14 },
            bodyFont: { size: 14 },
            callbacks: { label: (context) => `₹${context.parsed.y.toFixed(2)}` }
          },
          datalabels: {
            anchor: 'end',
            align: 'top',
            formatter: (value) => `₹${value.toFixed(2)}`,
            font: { size: 12, weight: '600' },
            color: '#1A365D'
          }
        }
      }
    });
  };

  // Parse date without UTC normalization
  const parseDate = (dateStr) => {
    let date;
    // Try ISO format
    date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
    // Try YYYY-MM-DD or DD-MM-YYYY
    const parts = dateStr.match(/(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})/);
    if (parts) {
      if (parseInt(parts[1]) > 31) {
        date = new Date(`${parts[1]}-${parts[2]}-${parts[3]}`);
      } else {
        date = new Date(`${parts[3]}-${parts[2]}-${parts[1]}`);
      }
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  };

  // Fetch and process sales data
  const fetchSalesData = async (timeSpan) => {
    try {
      loadingDiv.classList.remove('hidden');
      noDataDiv.classList.add('hidden');
      salesChartCanvas.classList.add('hidden');

      const bills = await ipcRenderer.invoke('billing:getBills');

      // Filter valid bills
      const validBills = bills.filter(bill => {
        try {
          const billData = JSON.parse(bill.data);
          const billDate = parseDate(bill.createdAt);
          return billData && typeof billData.totalCost === 'number' && billDate && !isNaN(billDate.getTime());
        } catch (error) {
          console.error(`Invalid bill ID ${bill.id}: ${error.message}`);
          return false;
        }
      });

      if (!validBills.length) {
        console.error(`No valid bills for ${timeSpan}`);
        loadingDiv.classList.add('hidden');
        noDataDiv.classList.remove('hidden');
        initChart(['No Data'], [0]);
        updateMetrics([]);
        return;
      }

      const today = new Date();
      let startDate;
      let endDate;
      let labels = [];
      let salesData = [];

      switch (timeSpan) {
        case 'daily':
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 6);
          startDate.setHours(0, 0, 0, 0);
          labels = Array.from({ length: 7 }, (_, i) => {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          });
          salesData = Array(7).fill(0);
          validBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            if (billDate >= startDate && billDate <= today) {
              const dayIndex = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24));
              if (dayIndex >= 0 && dayIndex < 7) {
                salesData[dayIndex] += parseFloat(billData.totalCost) || 0;
              }
            }
          });
          break;
        case 'weekly':
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 27);
          startDate.setHours(0, 0, 0, 0);
          labels = Array.from({ length: 4 }, (_, i) => `Week ${i + 1}`);
          salesData = Array(4).fill(0);
          validBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            if (billDate >= startDate && billDate <= today) {
              const weekIndex = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24 * 7));
              if (weekIndex >= 0 && weekIndex < 4) {
                salesData[weekIndex] += parseFloat(billData.totalCost) || 0;
              }
            }
          });
          break;
        case '15days':
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 14);
          startDate.setHours(0, 0, 0, 0);
          labels = ['Days 1-5', 'Days 6-10', 'Days 11-15'];
          salesData = Array(3).fill(0);
          validBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            if (billDate >= startDate && billDate <= today) {
              const dayIndex = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24));
              if (dayIndex >= 0 && dayIndex < 5) salesData[0] += parseFloat(billData.totalCost) || 0;
              else if (dayIndex < 10) salesData[1] += parseFloat(billData.totalCost) || 0;
              else if (dayIndex < 15) salesData[2] += parseFloat(billData.totalCost) || 0;
            }
          });
          break;
        case 'monthly':
          startDate = new Date(today.getFullYear() - 1, today.getMonth(), 1); // Start of month, 1 year ago
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1); // Start of next month
          console.log(`Monthly date range: startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}`);
          labels = Array.from({ length: 12 }, (_, i) => {
            const date = new Date(startDate);
            date.setMonth(startDate.getMonth() + i);
            return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
          });
          salesData = Array(12).fill(0);
          const monthlyBills = validBills.filter(bill => {
            const billDate = parseDate(bill.createdAt);
            return billDate && billDate >= startDate && billDate < endDate;
          });
          console.log(`Monthly bills: ${monthlyBills.length}`, monthlyBills.map(b => ({
            id: b.id,
            createdAt: b.createdAt,
            totalCost: JSON.parse(b.data).totalCost
          })));
          monthlyBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            const monthsDiff = (billDate.getFullYear() - startDate.getFullYear()) * 12 + billDate.getMonth() - startDate.getMonth();
            console.log(`Bill ID ${bill.id}: createdAt=${bill.createdAt}, billDate=${billDate.toISOString()}, monthsDiff=${monthsDiff}, totalCost=${billData.totalCost}`);
            if (monthsDiff >= 0 && monthsDiff < 12) {
              salesData[monthsDiff] += parseFloat(billData.totalCost) || 0;
            }
          });
          console.log(`Monthly salesData:`, salesData);
          break;
        case 'yearly':
          startDate = new Date(2020, 0, 1);
          endDate = new Date(2026, 0, 1);
          labels = ['2020', '2021', '2022', '2023', '2024', '2025'];
          salesData = Array(6).fill(0);
          validBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            if (billDate >= startDate && billDate < endDate) {
              const yearIndex = billDate.getFullYear() - 2020;
              if (yearIndex >= 0 && yearIndex < 6) {
                salesData[yearIndex] += parseFloat(billData.totalCost) || 0;
              }
            }
          });
          break;
      }

      loadingDiv.classList.add('hidden');
      if (salesData.every(val => val === 0)) {
        console.error(`No sales data for ${timeSpan}`);
        noDataDiv.classList.remove('hidden');
        initChart(['No Sales Data'], [0]);
      } else {
        salesChartCanvas.classList.remove('hidden');
        initChart(labels, salesData);
      }
      updateMetrics(validBills);
    } catch (err) {
      console.error(`Error in ${timeSpan}: ${err.message}`);
      loadingDiv.classList.add('hidden');
      noDataDiv.classList.remove('hidden');
      initChart(['Error'], [0]);
      updateMetrics([]);
    }
  };

  // Update metric cards with caching
  const updateMetrics = async (bills) => {
    let totalSales = 0;
    let totalProfit = 0;
    let totalGST = 0;
    let totalDiscounts = 0;
    const itemCache = new Map();

    for (const bill of bills) {
      let billData;
      try {
        billData = JSON.parse(bill.data);
      } catch (error) {
        console.error(`Invalid bill data ID ${bill.id}: ${error.message}`);
        continue;
      }

      totalSales += parseFloat(billData.totalCost) || 0;
      totalDiscounts += parseFloat(billData.discount) || 0;

      if (billData.totalItems && Array.isArray(billData.totalItems)) {
        for (const item of billData.totalItems) {
          if (!item.barcode) continue;

          let itemDetails = itemCache.get(item.barcode);
          if (!itemDetails) {
            try {
              itemDetails = await ipcRenderer.invoke('inventory:getItemByBarcode', item.barcode);
              itemCache.set(item.barcode, itemDetails || {});
            } catch (error) {
              console.error(`Error fetching item ${item.barcode}: ${error.message}`);
              continue;
            }
          }

          if (itemDetails) {
            const profit = (parseFloat(item.price) - (parseFloat(itemDetails.buyingCost) || 0)) * (item.quantity || 1);
            totalProfit += profit || 0;
            const gst = (parseFloat(item.price) * (parseFloat(itemDetails.gstPercentage) || 0) / 100) * (item.quantity || 1);
            totalGST += gst || 0;
          }
        }
      }
    }

    console.log(`Metrics: Sales=₹${totalSales.toFixed(2)}, Profit=₹${totalProfit.toFixed(2)}, GST=₹${totalGST.toFixed(2)}, Discounts=₹${totalDiscounts.toFixed(2)}`);

    document.getElementById('totalSales').textContent = `₹${totalSales.toFixed(2)}`;
    document.getElementById('totalProfit').textContent = `₹${totalProfit.toFixed(2)}`;
    document.getElementById('totalGST').textContent = `₹${totalGST.toFixed(2)}`;
    document.getElementById('totalDiscounts').textContent = `₹${totalDiscounts.toFixed(2)}`;
  };

  // Handle time span change
  timeSpanSelect.addEventListener('change', () => {
    fetchSalesData(timeSpanSelect.value);
  });

  // Real-time updates
  ipcRenderer.on('billing:newBill', () => {
    fetchSalesData(timeSpanSelect.value);
  });

  // Initial fetch
  fetchSalesData(timeSpanSelect.value);
});