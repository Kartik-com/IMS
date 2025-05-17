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
            grid: { color: '#E2E8F0' },
            padding: { top: 40 }
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
            color: '#1A365D',
            offset: 10,
            clip: false
          }
        },
        layout: {
          padding: { top: 40 }
        }
      }
    });
  };

  // Parse date with extended format support
  const parseDate = (dateStr) => {
    let date;
    console.log(`Parsing date: ${dateStr}`);
    // Handle null or undefined
    if (!dateStr) {
      console.error(`Date is null or undefined`);
      return null;
    }
    // Try ISO format
    date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      console.log(`Parsed ISO date: ${dateStr} -> ${date}`);
      return date;
    }
    // Try YYYY-MM-DD, DD-MM-YYYY, MM-DD-YYYY
    const parts = dateStr.match(/(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/);
    if (parts) {
      // YYYY-MM-DD
      if (parseInt(parts[1]) > 31) {
        date = new Date(`${parts[1]}-${parts[2]}-${parts[3]}`);
      }
      // DD-MM-YYYY
      else if (parseInt(parts[3]) > 31) {
        date = new Date(`${parts[3]}-${parts[2]}-${parts[1]}`);
      }
      // MM-DD-YYYY
      else {
        date = new Date(`${parts[3]}-${parts[1]}-${parts[2]}`);
      }
      if (!isNaN(date.getTime())) {
        console.log(`Parsed custom date: ${dateStr} -> ${date}`);
        return date;
      }
    }
    // Try textual formats (e.g., "May 13, 2025")
    const textual = dateStr.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/);
    if (textual) {
      date = new Date(`${textual[1]} ${textual[2]}, ${textual[3]}`);
      if (!isNaN(date.getTime())) {
        console.log(`Parsed textual date: ${dateStr} -> ${date}`);
        return date;
      }
    }
    // Try Unix timestamp (milliseconds or seconds)
    if (!isNaN(dateStr)) {
      const num = parseInt(dateStr);
      date = new Date(num > 9999999999 ? num : num * 1000);
      if (!isNaN(date.getTime())) {
        console.log(`Parsed timestamp: ${dateStr} -> ${date}`);
        return date;
      }
    }
    console.error(`Invalid date format: ${dateStr}`);
    return null;
  };

  // Filter bills by time span
  const filterBillsByTimeSpan = (bills, timeSpan, startDate, endDate) => {
    console.log(`Filtering bills for ${timeSpan}, start: ${startDate}, end: ${endDate}`);
    const filtered = bills.filter(bill => {
      const billDate = parseDate(bill.createdAt);
      if (!billDate || isNaN(billDate.getTime())) {
        console.warn(`Skipping bill ID ${bill.id} due to invalid date: ${bill.createdAt}`);
        return false;
      }
      const inRange = billDate >= startDate && billDate <= endDate;
      if (!inRange) {
        console.log(`Bill ID ${bill.id} date ${billDate} outside range ${startDate} - ${endDate}`);
      }
      return inRange;
    });
    console.log(`Filtered ${filtered.length} bills for ${timeSpan}`);
    return filtered;
  };

  // Fetch and process sales data
  const fetchSalesData = async (timeSpan) => {
    try {
      loadingDiv.classList.remove('hidden');
      noDataDiv.classList.add('hidden');
      salesChartCanvas.classList.add('hidden');

      const bills = await ipcRenderer.invoke('billing:getBills');
      console.log(`Fetched ${bills.length} bills`);

      // Filter valid bills (aligned with billingHistory.js)
      const validBills = bills.filter(bill => {
        try {
          const billData = JSON.parse(bill.data);
          const billDate = parseDate(bill.createdAt);
          const isValid = billData &&
                         typeof billData.totalCost === 'number' &&
                         typeof billData.discount === 'number' &&
                         typeof billData.amountPaid === 'number' &&
                         typeof billData.change === 'number' &&
                         billDate && !isNaN(billDate.getTime());
          if (!isValid) {
            console.warn(`Invalid bill ID ${bill.id}: missing required fields or invalid date`);
          }
          return isValid;
        } catch (error) {
          console.error(`Invalid bill ID ${bill.id}: ${error.message}`);
          return false;
        }
      });
      console.log(`Valid bills: ${validBills.length}`);

      if (!validBills.length) {
        console.error(`No valid bills for ${timeSpan}`);
        loadingDiv.classList.add('hidden');
        noDataDiv.classList.remove('hidden');
        initChart(['No Data'], [0]);
        updateMetrics([], timeSpan);
        return;
      }

      const today = new Date();
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      let startDate, endDate;
      let labels = [];
      let salesData = [];

      switch (timeSpan) {
        case 'daily':
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 6);
          startDate.setHours(0, 0, 0, 0);
          endDate = endOfToday;
          labels = Array.from({ length: 7 }, (_, i) => {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          });
          salesData = Array(7).fill(0);
          validBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            if (billDate && billDate >= startDate && billDate <= endDate) {
              const dayIndex = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24));
              if (dayIndex >= 0 && dayIndex < 7) {
                const amount = parseFloat(billData.totalCost) || 0;
                salesData[dayIndex] += amount;
                console.log(`Bill ID ${bill.id} added to day ${labels[dayIndex]}: ₹${amount}`);
              }
            }
          });
          break;
        case 'weekly':
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 27);
          startDate.setHours(0, 0, 0, 0);
          endDate = endOfToday;
          labels = Array.from({ length: 4 }, (_, i) => `Week ${i + 1}`);
          salesData = Array(4).fill(0);
          validBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            if (billDate && billDate >= startDate && billDate <= endDate) {
              const weekIndex = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24 * 7));
              if (weekIndex >= 0 && weekIndex < 4) {
                const amount = parseFloat(billData.totalCost) || 0;
                salesData[weekIndex] += amount;
                console.log(`Bill ID ${bill.id} added to ${labels[weekIndex]}: ₹${amount}`);
              }
            }
          });
          break;
        case '15days':
          startDate = new Date(today);
          startDate.setDate(today.getDate() - 14);
          startDate.setHours(0, 0, 0, 0);
          endDate = endOfToday;
          labels = ['Days 1-5', 'Days 6-10', 'Days 11-15'];
          salesData = Array(3).fill(0);
          validBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            if (billDate && billDate >= startDate && billDate <= endDate) {
              const dayIndex = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24));
              if (dayIndex >= 0 && dayIndex < 5) {
                const amount = parseFloat(billData.totalCost) || 0;
                salesData[0] += amount;
                console.log(`Bill ID ${bill.id} added to ${labels[0]}: ₹${amount}`);
              }
              else if (dayIndex < 10) {
                const amount = parseFloat(billData.totalCost) || 0;
                salesData[1] += amount;
                console.log(`Bill ID ${bill.id} added to ${labels[1]}: ₹${amount}`);
              }
              else if (dayIndex < 15) {
                const amount = parseFloat(billData.totalCost) || 0;
                salesData[2] += amount;
                console.log(`Bill ID ${bill.id} added to ${labels[2]}: ₹${amount}`);
              }
            }
          });
          break;
        case 'monthly':
          startDate = new Date(today.getFullYear() - 1, today.getMonth(), 1);
          startDate.setHours(0, 0, 0, 0);
          endDate = endOfToday;
          labels = Array.from({ length: 12 }, (_, i) => {
            const date = new Date(startDate);
            date.setMonth(startDate.getMonth() + i);
            return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
          });
          salesData = Array(12).fill(0);
          validBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            if (billDate && billDate >= startDate && billDate <= endDate) {
              const monthIndex = (billDate.getFullYear() - startDate.getFullYear()) * 12 + billDate.getMonth() - startDate.getMonth();
              if (monthIndex >= 0 && monthIndex < 12) {
                const amount = parseFloat(billData.totalCost) || 0;
                salesData[monthIndex] += amount;
                console.log(`Bill ID ${bill.id} added to month ${labels[monthIndex]}: ₹${amount}`);
              } else {
                console.warn(`Bill ID ${bill.id} monthIndex ${monthIndex} out of range for date ${billDate}`);
              }
            } else {
              console.log(`Bill ID ${bill.id} excluded: date ${billDate} outside range ${startDate} - ${endDate}`);
            }
          });
          break;
        case 'yearly':
          startDate = new Date(2020, 0, 1);
          endDate = new Date(2026, 0, 1);
          labels = ['2020', '2021', '2022', '2023', '2024', '2025'];
          salesData = Array(6).fill(0);
          validBills.forEach(bill => {
            const billData = JSON.parse(bill.data);
            const billDate = parseDate(bill.createdAt);
            if (billDate && billDate >= startDate && billDate < endDate) {
              const yearIndex = billDate.getFullYear() - 2020;
              if (yearIndex >= 0 && yearIndex < 6) {
                const amount = parseFloat(billData.totalCost) || 0;
                salesData[yearIndex] += amount;
                console.log(`Bill ID ${bill.id} added to year ${labels[yearIndex]}: ₹${amount}`);
              }
            }
          });
          break;
      }

      console.log(`Sales data for ${timeSpan}:`, salesData);

      loadingDiv.classList.add('hidden');
      if (salesData.every(val => val === 0)) {
        console.warn(`No sales data for ${timeSpan}`);
        noDataDiv.classList.remove('hidden');
        initChart(['No Sales Data'], [0]);
      } else {
        salesChartCanvas.classList.remove('hidden');
        initChart(labels, salesData);
      }
      updateMetrics(validBills, timeSpan, startDate, endDate);
    } catch (err) {
      console.error(`Error in ${timeSpan}: ${err.message}`);
      loadingDiv.classList.add('hidden');
      noDataDiv.classList.remove('hidden');
      initChart(['Error'], [0]);
      updateMetrics([], timeSpan);
    }
  };

  // Update metric cards with caching
  const updateMetrics = async (bills, timeSpan, startDate, endDate) => {
    const filteredBills = filterBillsByTimeSpan(bills, timeSpan, startDate, endDate);
    console.log(`Calculating metrics for ${timeSpan} with ${filteredBills.length} bills`);
    let totalSales = 0;
    let totalProfit = 0;
    let totalGST = 0;
    let totalDiscounts = 0;
    const itemCache = new Map();

    for (const bill of filteredBills) {
      let billData;
      try {
        billData = JSON.parse(bill.data);
      } catch (error) {
        console.error(`Invalid bill data ID ${bill.id}: ${error.message}`);
        continue;
      }

      const salesAmount = parseFloat(billData.totalCost) || 0;
      const discountAmount = parseFloat(billData.discount) || 0;
      totalSales += salesAmount;
      totalDiscounts += discountAmount;
      console.log(`Bill ID ${bill.id} contributes: Sales=₹${salesAmount}, Discount=₹${discountAmount}`);

      if (billData.totalItems && Array.isArray(billData.totalItems)) {
        for (const item of billData.totalItems) {
          if (!item.barcode) {
            console.warn(`Skipping item in bill ID ${bill.id}: no barcode`);
            continue;
          }

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
            const gst = (parseFloat(item.price) * (parseFloat(itemDetails.gstPercentage) || 0) / 100) * (item.quantity || 1);
            totalProfit += profit || 0;
            totalGST += gst || 0;
            console.log(`Item ${item.barcode} in bill ID ${bill.id}: Profit=₹${profit}, GST=₹${gst}`);
          }
        }
      }
    }

    console.log(`Metrics for ${timeSpan}: Sales=₹${totalSales.toFixed(2)}, Profit=₹${totalProfit.toFixed(2)}, GST=₹${totalGST.toFixed(2)}, Discounts=₹${totalDiscounts.toFixed(2)}`);

    document.getElementById('totalSales').textContent = `₹${totalSales.toFixed(2)}`;
    document.getElementById('totalProfit').textContent = `₹${totalProfit.toFixed(2)}`;
    document.getElementById('totalGST').textContent = `₹${totalGST.toFixed(2)}`;
    document.getElementById('totalDiscounts').textContent = `₹${totalDiscounts.toFixed(2)}`;
  };

  // Handle time span change
  timeSpanSelect.addEventListener('change', () => {
    console.log(`Time span changed to ${timeSpanSelect.value}`);
    fetchSalesData(timeSpanSelect.value);
  });

  // Real-time updates
  ipcRenderer.on('billing:newBill', () => {
    console.log('New bill received, refreshing data');
    fetchSalesData(timeSpanSelect.value);
  });

  // Initial fetch
  console.log('Initial data fetch');
  fetchSalesData(timeSpanSelect.value);
});