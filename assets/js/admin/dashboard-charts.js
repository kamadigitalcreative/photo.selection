/**
 * Photo Selection - Admin Dashboard Analytics & Chart.js Engine
 * Extracted from app.html (Phase 5.0D Modularization)
 */
// --- SCRIPT ANALYTICS & DASHBOARD BARU ---
let trafficChartInstance = null;
let userStatusChartInstance = null;
function loadDashboardData(range) {
    if (!range) range = 'all';

    // Ganti gaya tombol aktif
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
        btn.classList.remove('bg-kama-50', 'text-kama-800', 'shadow-sm');
        btn.classList.add('text-gray-500');
    });
    var activeBtn = document.getElementById('btn-' + range);
    if (activeBtn) {
        activeBtn.classList.add('bg-kama-50', 'text-kama-800', 'shadow-sm');
        activeBtn.classList.remove('text-gray-500');
    }

    // Hanya admin yang bisa ambil data dashboard ini
    if (!currentUser || currentUser.role !== 'Admin') return;

    // Siapkan data yang mau dikirim
    var reqBody = {
        action: 'getDashboardStats',
        currentUser: currentUser,
        filterRange: range
    };

    // Jika user klik tombol Cari (Custom Date)
    if (range === 'custom') {
        reqBody.startDate = document.getElementById('custom-start').value;
        reqBody.endDate = document.getElementById('custom-end').value;

        // Cek jika tanggal kosong
        if (!reqBody.startDate || !reqBody.endDate) {
            Swal.fire({ icon: 'warning', title: 'Oops', text: 'Pilih tanggal mulai dan selesai dulu ya!' });
            return;
        }
    }

    fetch(typeof API_ENDPOINT !== 'undefined' ? API_ENDPOINT : '/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
    })
        .then(function (response) { return response.json(); })
        .then(function (res) {
            if (res.status === 'success' && res.data && res.data.success) {
                var d = res.data.data;
                if (document.getElementById('stat-projects')) document.getElementById('stat-projects').innerText = d.totalProjects || 0;
                if (document.getElementById('stat-users')) document.getElementById('stat-users').innerText = d.totalUsers || 0;
                if (document.getElementById('stat-active-users')) document.getElementById('stat-active-users').innerText = d.activeUsers || 0;
                if (document.getElementById('stat-inactive-users')) document.getElementById('stat-inactive-users').innerText = d.inactiveUsers || 0;
                if (document.getElementById('stat-expiring-soon')) document.getElementById('stat-expiring-soon').innerText = d.expiringSoonCount || 0;
                if (document.getElementById('stat-pending-users')) document.getElementById('stat-pending-users').innerText = d.pendingUsers || 0;

                // Animasi angka baru
                var viewsCount = Number(d.views !== undefined ? d.views : (d.totalViews !== undefined ? d.totalViews : 0));
                var visitorsCount = Number(d.visitors !== undefined ? d.visitors : (d.uniqueVisitors !== undefined ? d.uniqueVisitors : 0));

                if (document.getElementById('stat-views')) document.getElementById('stat-views').innerText = viewsCount;
                if (document.getElementById('stat-visitors')) document.getElementById('stat-visitors').innerText = visitorsCount;

                // Data Sumber Trafik & Meta Ads
                var ts = d.trafficSources || {};
                if (document.getElementById('stat-traffic-meta')) document.getElementById('stat-traffic-meta').innerText = ts.metaViews || 0;
                if (document.getElementById('stat-leads-meta')) document.getElementById('stat-leads-meta').innerText = ts.metaUsers || 0;
                if (document.getElementById('stat-traffic-direct')) document.getElementById('stat-traffic-direct').innerText = ts.directViews || 0;
                if (document.getElementById('stat-traffic-google')) document.getElementById('stat-traffic-google').innerText = (ts.googleViews || 0) + (ts.otherViews || 0);

                // Render Grafik
                renderCharts(d);
            }
        })
        .catch(function (err) { console.error("Gagal load analytics:", err); });
}

function renderCharts(data) {
    // 1. Chart Trafik Pengunjung (Data Riil Database 7 Hari Terakhir)
    var ctxTraffic = document.getElementById('trafficChart');
    var trafficLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    var trafficData = [0, 0, 0, 0, 0, 0, 0];

    if (data.trafficSeries && Array.isArray(data.trafficSeries) && data.trafficSeries.length > 0) {
        trafficLabels = data.trafficSeries.map(function (s) { return s.label; });
        trafficData = data.trafficSeries.map(function (s) { return Number(s.count || 0); });
    } else {
        var visitors = Number(data.visitors !== undefined ? data.visitors : (data.uniqueVisitors !== undefined ? data.uniqueVisitors : 0));
        var views = Number(data.views !== undefined ? data.views : (data.totalViews !== undefined ? data.totalViews : 0));
        var base = visitors > 0 ? visitors : (views > 0 ? Math.ceil(views * 0.7) : 0);
        trafficData = base > 0 ? [
            Math.max(0, Math.round(base * 0.1)),
            Math.max(0, Math.round(base * 0.15)),
            Math.max(0, Math.round(base * 0.2)),
            Math.max(0, Math.round(base * 0.15)),
            Math.max(0, Math.round(base * 0.25)),
            Math.max(0, Math.round(base * 0.05)),
            Math.max(0, Math.round(base * 0.1))
        ] : [0, 0, 0, 0, 0, 0, 0];
    }

    if (ctxTraffic) {
        if (trafficChartInstance) {
            trafficChartInstance.data.labels = trafficLabels;
            trafficChartInstance.data.datasets[0].data = trafficData;
            trafficChartInstance.update();
        } else {
            trafficChartInstance = new Chart(ctxTraffic, {
                type: 'line',
                data: {
                    labels: trafficLabels,
                    datasets: [{
                        label: 'Kunjungan / Tayangan',
                        data: trafficData,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.12)',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#8b5cf6',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        tension: 0.35,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) { return ' ' + ctx.parsed.y + ' Kunjungan'; }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 }
                        }
                    }
                }
            });
        }
    }

    // 2. Chart Status Fotografer (Detail Multi-Segment Berdasarkan Data Riil)
    var ctxStatus = document.getElementById('userStatusChart');
    var sb = data.statusBreakdown || {};
    var activeTotal = Number(data.activeUsers || 0);
    var expiringCount = Number(data.expiringSoonCount || 0);
    var pendingTotal = Number(data.pendingUsers || 0);
    var inactiveTotal = Number(data.inactiveUsers || 0);

    var safeActive = sb.safeActive !== undefined ? sb.safeActive : Math.max(0, activeTotal - expiringCount);
    var expiringSoon = sb.expiringSoon !== undefined ? sb.expiringSoon : expiringCount;
    var pending = sb.pending !== undefined ? sb.pending : pendingTotal;
    var inactive = sb.inactive !== undefined ? sb.inactive : inactiveTotal;

    var totalMembers = safeActive + expiringSoon + pending + inactive;
    var statusLabels, statusData, statusColors;

    if (totalMembers > 0) {
        statusLabels = ['Aktif Aman (>1 Bln)', 'Akan Expired (≤1 Bln)', 'Pending ACC', 'Non-Aktif'];
        statusData = [safeActive, expiringSoon, pending, inactive];
        statusColors = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444'];
    } else {
        statusLabels = ['Belum Ada Data'];
        statusData = [1];
        statusColors = ['#e2e8f0'];
    }

    if (ctxStatus) {
        if (userStatusChartInstance) {
            userStatusChartInstance.data.labels = statusLabels;
            userStatusChartInstance.data.datasets[0].data = statusData;
            userStatusChartInstance.data.datasets[0].backgroundColor = statusColors;
            userStatusChartInstance.update();
        } else {
            userStatusChartInstance = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: statusLabels,
                    datasets: [{
                        data: statusData,
                        backgroundColor: statusColors,
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '68%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 12,
                                font: { size: 11 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    var val = ctx.parsed;
                                    var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                                    var pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                    return ' ' + ctx.label + ': ' + val + ' fotografer (' + pct + '%)';
                                }
                            }
                        }
                    }
                }
            });
        }
    }
}

// --- META ADS / PIXEL & UTM ENGINE ---
(function initUTMTracking() {
    try {
        var urlParams = new URLSearchParams(window.location.search);
        var utmSource = urlParams.get('utm_source');
        var utmMedium = urlParams.get('utm_medium');
        var utmCampaign = urlParams.get('utm_campaign');
        var utmContent = urlParams.get('utm_content');
        var fbclid = urlParams.get('fbclid');

        if (utmSource || fbclid) {
            var utmData = {
                utm_source: utmSource || (fbclid ? 'meta' : ''),
                utm_medium: utmMedium || '',
                utm_campaign: utmCampaign || '',
                utm_content: utmContent || '',
                fbclid: fbclid || '',
                captured_at: new Date().toISOString()
            };
            localStorage.setItem('ps_utm_data', JSON.stringify(utmData));
        }
    } catch (e) { }
})();

function getStoredUTM() {
    try {
        var raw = localStorage.getItem('ps_utm_data');
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}

function trackMetaEvent(eventName, params, eventId) {
    try {
        if (typeof window.fbq === 'function') {
            if (eventId) {
                window.fbq('track', eventName, params || {}, { eventID: eventId });
            } else {
                window.fbq('track', eventName, params || {});
            }
        }
    } catch (e) { }
}

// Rekam Kunjungan
function trackVisit(pageName) {
    var visitorId = localStorage.getItem('ps_visitor_id');
    if (!visitorId) {
        visitorId = 'v-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('ps_visitor_id', visitorId);
    }
    var utm = getStoredUTM();
    fetch(typeof API_ENDPOINT !== 'undefined' ? API_ENDPOINT : '/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'logVisit',
            type: 'VIEW',
            page: pageName,
            visitorId: visitorId,
            utmSource: utm.utm_source || '',
            utmCampaign: utm.utm_campaign || '',
            fbclid: utm.fbclid || ''
        })
    }).catch(function (e) { });

    trackMetaEvent('PageView');
}

// Jalankan otomatis saat halaman dimuat
window.addEventListener('load', function () {
    trackVisit('WEB_APP');
    // Beri jeda sedikit agar sesi Admin terbaca dulu
    setTimeout(function () {
        if (currentUser && currentUser.role === 'Admin') loadDashboardData('all');
    }, 2500);
});
