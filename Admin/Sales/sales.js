const { ipcRenderer } = require('electron');

// Register Chart.js data labels plugin
Chart.register(ChartDataLabels);

document.addEventListener('DOMContentLoaded', () => {
  const timeSpanSelect = document.getElementById('timeSpan');
  const salesChartCanvas = document.getElementById('salesChart');
  const loadingDiv = document.getElementById('loading');
  const noDataDiv = document.getElementById('noData');
  const customStartDateInput = document.getElementById('customStartDate');
  const customEndDateInput = document.getElementById('customEndDate');
  const applyCustomRangeButton = document.getElementById('applyCustomRange');
  let salesChart;

  // Initialize Chart.js with numeric values on bars
  const initChart = (labels, data) => {
    if (salesChart) salesChart.destroy();
    salesChart = new Chart(salesChartCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Sales (₹)',
          data,
          backgroundColor: '#60A5FA', // Light blue for bars
          borderColor: '#2B6CB0', // Darker blue border
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Sales Amount (₹)',
              font: { size: 16, weight: '600' },
              color: '#2B6CB0'
            },
            grid: { color: '#E2E8F0' },
            ticks: {
              font: { size: 14 },
              color: '#2B6CB0',
              callback: (value) => `₹${value.toFixed(2)}`
            }
          },
          x: {
            title: {
              display: true,
              text: 'Time Period',
              font: { size: 16, weight: '600' },
              color: '#2B6CB0'
            },
            grid: { display: false },
            ticks: { font: { size: 14 }, color: '#2B6CB0' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: '#2B6CB0',
            titleFont: { size: 14 },
            bodyFont: { size: 14 },
            callbacks: { label: (context) => `Sales: ₹${context.parsed.y.toFixed(2)}` }
          },
          datalabels: {
            anchor: 'end',
            align: 'top',
            formatter: (value) => `₹${value.toFixed(2)}`,
            font: { size: 14, weight: 'bold' },
            color: '#2F855A', // Green for data labels
            offset: 8
          }
        },
        layout: {
          padding: { top: 30, bottom: 20 }
        }
      }
    });
  };

  // Parse date with robust handling
  const parseDate = (dateStr) => {
    if (!dateStr) {
      console.warn('Date is null or undefined');
      return null;
    }
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    // Handle YYYY-MM-DD or DD-MM-YYYY
    const parts = dateStr.match(/(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/);
    if (parts) {
      if (parseInt(parts[1]) > 31) {
        date = new Date(`${parts[1]}-${parts[2]}-${parts[3]}`);
      } else if (parseInt(parts[3]) > 31) {
        date = new Date(`${parts[3]}-${parts[2]}-${parts[1]}`);
      } else {
        date = new Date(`${parts[3]}-${parts[1]}-${parts[2]}`);
      }
      if (!isNaN(date.getTime())) return date;
    }

    // Handle textual formats (e.g., "May 13, 2025")
    const textual = dateStr.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/);
    if (textual) {
      date = new Date(`${textual[1]} ${textual[2]}, ${textual[3]}`);
      if (!isNaN(date.getTime())) return date;
    }

    // Handle Unix timestamps
    if (!isNaN(dateStr)) {
      const num = parseInt(dateStr);
      date = new Date(num > 9999999999 ? num : num * 1000);
      if (!isNaN(date.getTime())) return date;
    }

    console.warn(`Invalid date format: ${dateStr}`);
    return null;
  };

  // Filter bills by date range
  const filterBillsByDateRange = (bills, startDate, endDate) => {
    return bills.filter(bill => {
      const billDate = parseDate(bill.createdAt);
      if (!billDate || isNaN(billDate.getTime())) {
        console.warn(`Skipping bill ID ${bill.id} due to invalid date: ${bill.createdAt}`);
        return false;
      }
      return billDate >= startDate && billDate <= endDate;
    });
  };

  // Fetch and process sales data
  const fetchSalesData = async (timeSpan, customStartDate = null, customEndDate = null) => {
    try {
      loadingDiv.classList.remove('hidden');
      noDataDiv.classList.add('hidden');
      salesChartCanvas.classList.add('hidden');

      const bills = await ipcRenderer.invoke('billing:getBills');
      const validBills = bills.filter(bill => {
        try {
          const billData = JSON.parse(bill.data);
          const billDate = parseDate(bill.createdAt);
          return billData &&
                 typeof billData.totalCost === 'number' &&
                 typeof billData.discount === 'number' &&
                 typeof billData.amountPaid === 'number' &&
                 typeof billData.change === 'number' &&
                 billDate && !isNaN(billDate.getTime());
        } catch (error) {
          console.warn(`Invalid bill ID ${bill.id}: ${error.message}`);
          return false;
        }
      });

      if (!validBills.length) {
        loadingDiv.classList.add('hidden');
        noDataDiv.classList.remove('hidden');
        initChart(['No Data'], [0]);
        updateMetrics([], timeSpan);
        return;
      }

      const today = new Date();
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      let startDate, endDate, labels = [], salesData = [];

      if (timeSpan === 'custom' && customStartDate && customEndDate) {
        startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
          console.warn('Invalid custom date range');
          loadingDiv.classList.add('hidden');
          noDataDiv.classList.remove('hidden');
          initChart(['Invalid Date Range'], [0]);
          updateMetrics([], timeSpan);
          return;
        }

        // Calculate days between start and end
        const dayDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const maxBars = 12; // Limit to 12 bars for readability
        let bucketSize;

        if (dayDiff <= 7) {
          // Daily buckets
          bucketSize = 1;
          labels = Array.from({ length: dayDiff }, (_, i) => {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          });
          salesData = Array(dayDiff).fill(0);
        } else if (dayDiff <= 31) {
          // Weekly buckets
          bucketSize = Math.ceil(dayDiff / Math.min(dayDiff, maxBars));
          const numBuckets = Math.ceil(dayDiff / bucketSize);
          labels = Array.from({ length: numBuckets }, (_, i) => `Days ${i * bucketSize + 1}-${Math.min((i + 1) * bucketSize, dayDiff)}`);
          salesData = Array(numBuckets).fill(0);
        } else {
          // Monthly buckets
          const startYear = startDate.getFullYear();
          const startMonth = startDate.getMonth();
          const endYear = endDate.getFullYear();
          const endMonth = endDate.getMonth();
          const monthDiff = (endYear - startYear) * 12 + endMonth - startMonth + 1;
          const monthsToShow = Math.min(monthDiff, maxBars);
          labels = Array.from({ length: monthsToShow }, (_, i) => {
            const date = new Date(startYear, startMonth + i, 1);
            return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
          });
          salesData = Array(monthsToShow).fill(0);
          bucketSize = 'month';
        }

        filterBillsByDateRange(validBills, startDate, endDate).forEach(bill => {
          const billData = JSON.parse(bill.data);
          const billDate = parseDate(bill.createdAt);
          let index;

          if (bucketSize === 1) {
            index = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24));
          } else if (bucketSize === 'month') {
            const startYear = startDate.getFullYear();
            const startMonth = startDate.getMonth();
            index = (billDate.getFullYear() - startYear) * 12 + billDate.getMonth() - startMonth;
          } else {
            index = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24) / bucketSize);
          }

          if (index >= 0 && index < salesData.length) {
            salesData[index] += parseFloat(billData.totalCost) || 0;
          }
        });
      } else {
        switch (timeSpan) {
          case 'daily':
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
            endDate = endOfToday;
            labels = Array.from({ length: 7 }, (_, i) => {
              const date = new Date(startDate);
              date.setDate(startDate.getDate() + i);
              return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            });
            salesData = Array(7).fill(0);
            filterBillsByDateRange(validBills, startDate, endDate).forEach(bill => {
              const billData = JSON.parse(bill.data);
              const billDate = parseDate(bill.createdAt);
              const dayIndex = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24));
              if (dayIndex >= 0 && dayIndex < 7) {
                salesData[dayIndex] += parseFloat(billData.totalCost) || 0;
              }
            });
            break;
          case '15days':
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14);
            startDate.setHours(0, 0, 0, 0);
            endDate = endOfToday;
            labels = ['Days 1-5', 'Days 6-10', 'Days 11-15'];
            salesData = Array(3).fill(0);
            filterBillsByDateRange(validBills, startDate, endDate).forEach(bill => {
              const billData = JSON.parse(bill.data);
              const billDate = parseDate(bill.createdAt);
              const dayIndex = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24));
              if (dayIndex >= 0 && dayIndex < 5) {
                salesData[0] += parseFloat(billData.totalCost) || 0;
              } else if (dayIndex < 10) {
                salesData[1] += parseFloat(billData.totalCost) || 0;
              } else if (dayIndex < 15) {
                salesData[2] += parseFloat(billData.totalCost) || 0;
              }
            });
            break;
          case 'weekly':
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 27);
            startDate.setHours(0, 0, 0, 0);
            endDate = endOfToday;
            labels = Array.from({ length: 4 }, (_, i) => `Week ${i + 1}`);
            salesData = Array(4).fill(0);
            filterBillsByDateRange(validBills, startDate, endDate).forEach(bill => {
              const billData = JSON.parse(bill.data);
              const billDate = parseDate(bill.createdAt);
              const weekIndex = Math.floor((billDate - startDate) / (1000 * 60 * 60 * 24 * 7));
              if (weekIndex >= 0 && weekIndex < 4) {
                salesData[weekIndex] += parseFloat(billData.totalCost) || 0;
              }
            });
            break;
          case 'monthly':
            startDate = new Date(today.getFullYear(), today.getMonth() - 11, 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = endOfToday;
            labels = Array.from({ length: 12 }, (_, i) => {
              const date = new Date(startDate);
              date.setMonth(startDate.getMonth() + i);
              return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            });
            salesData = Array(12).fill(0);
            filterBillsByDateRange(validBills, startDate, endDate).forEach(bill => {
              const billData = JSON.parse(bill.data);
              const billDate = parseDate(bill.createdAt);
              const monthIndex = (billDate.getFullYear() - startDate.getFullYear()) * 12 + billDate.getMonth() - startDate.getMonth();
              if (monthIndex >= 0 && monthIndex < 12) {
                salesData[monthIndex] += parseFloat(billData.totalCost) || 0;
              }
            });
            break;
          case 'yearly':
            startDate = new Date(2020, 0, 1);
            endDate = new Date(2026, 0, 1);
            labels = ['2020', '2021', '2022', '2023', '2024', '2025'];
            salesData = Array(6).fill(0);
            filterBillsByDateRange(validBills, startDate, endDate).forEach(bill => {
              const billData = JSON.parse(bill.data);
              const billDate = parseDate(bill.createdAt);
              const yearIndex = billDate.getFullYear() - 2020;
              if (yearIndex >= 0 && yearIndex < 6) {
                salesData[yearIndex] += parseFloat(billData.totalCost) || 0;
              }
            });
            break;
        }
      }

      loadingDiv.classList.add('hidden');
      if (salesData.every(val => val === 0)) {
        noDataDiv.classList.remove('hidden');
        initChart(['No Sales Data'], [0]);
      } else {
        salesChartCanvas.classList.remove('hidden');
        initChart(labels, salesData);
      }
      updateMetrics(validBills, startDate, endDate);
    } catch (err) {
      console.error(`Error fetching sales data: ${err.message}`);
      loadingDiv.classList.add('hidden');
      noDataDiv.classList.remove('hidden');
      initChart(['Error'], [0]);
      updateMetrics([], timeSpan);
    }
  };

  // Update metric cards
  const updateMetrics = async (bills, startDate, endDate) => {
    const filteredBills = filterBillsByDateRange(bills, startDate, endDate);
    let totalSales = 0, totalProfit = 0, totalGST = 0, totalDiscounts = 0;
    const itemCache = new Map();

    for (const bill of filteredBills) {
      let billData;
      try {
        billData = JSON.parse(bill.data);
      } catch (error) {
        console.warn(`Invalid bill data ID ${bill.id}: ${error.message}`);
        continue;
      }

      const salesAmount = parseFloat(billData.totalCost) || 0;
      const discountAmount = parseFloat(billData.discount) || 0;
      totalSales += salesAmount;
      totalDiscounts += discountAmount;

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
              console.warn(`Error fetching item ${item.barcode}: ${error.message}`);
              continue;
            }
          }

          if (itemDetails) {
            const profit = (parseFloat(item.price) - (parseFloat(itemDetails.buyingCost) || 0)) * (item.quantity || 1);
            const gst = (parseFloat(item.price) * (parseFloat(itemDetails.gstPercentage) || 0) / 100) * (item.quantity || 1);
            totalProfit += profit || 0;
            totalGST += gst || 0;
          }
        }
      }
    }

    document.getElementById('totalSales').textContent = `₹${totalSales.toFixed(2)}`;
    document.getElementById('totalProfit').textContent = `₹${totalProfit.toFixed(2)}`;
    document.getElementById('totalGST').textContent = `₹${totalGST.toFixed(2)}`;
    document.getElementById('totalDiscounts').textContent = `₹${totalDiscounts.toFixed(2)}`;
  };

  // Handle time span change
  timeSpanSelect.addEventListener('change', () => {
    customStartDateInput.value = '';
    customEndDateInput.value = '';
    fetchSalesData(timeSpanSelect.value);
  });

  // Handle custom date range
  applyCustomRangeButton.addEventListener('click', () => {
    const startDate = customStartDateInput.value;
    const endDate = customEndDateInput.value;
    if (startDate && endDate) {
      timeSpanSelect.value = ''; // Deselect predefined time span
      fetchSalesData('custom', startDate, endDate);
    }
  });

  // Real-time updates
  ipcRenderer.on('billing:newBill', () => {
    if (customStartDateInput.value && customEndDateInput.value) {
      fetchSalesData('custom', customStartDateInput.value, customEndDateInput.value);
    } else {
      fetchSalesData(timeSpanSelect.value);
    }
  });

  // Initial fetch with default time span
  fetchSalesData(timeSpanSelect.value);
});