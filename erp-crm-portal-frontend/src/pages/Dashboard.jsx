import { useState, useEffect } from 'react';
import { inventoryApi } from '../services/api';
import { Package, AlertTriangle, TrendingDown, DollarSign } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await inventoryApi.getInventory({ limit: 1 });
        if (res.success && res.meta?.summary) {
          setSummary(res.meta.summary);
        }
      } catch (error) {
        console.error('Failed to load dashboard summary', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted">Welcome back, {user?.firstName}!</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center" style={{ height: '200px' }}>Loading statistics...</div>
      ) : summary ? (
        <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
          <div className="glass-panel" style={{ flex: '1 1 200px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--brand-primary)', padding: '1rem', borderRadius: '50%' }}>
              <Package size={24} />
            </div>
            <div>
              <p className="text-muted text-sm">Total Products</p>
              <h2 style={{ marginBottom: 0 }}>{summary.totalProducts}</h2>
            </div>
          </div>

          <div className="glass-panel" style={{ flex: '1 1 200px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', padding: '1rem', borderRadius: '50%' }}>
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-muted text-sm">Low Stock Items</p>
              <h2 style={{ marginBottom: 0 }}>{summary.lowStockCount}</h2>
            </div>
          </div>

          <div className="glass-panel" style={{ flex: '1 1 200px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '1rem', borderRadius: '50%' }}>
              <TrendingDown size={24} />
            </div>
            <div>
              <p className="text-muted text-sm">Out of Stock</p>
              <h2 style={{ marginBottom: 0 }}>{summary.outOfStockCount}</h2>
            </div>
          </div>

          <div className="glass-panel" style={{ flex: '1 1 200px', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '1rem', borderRadius: '50%' }}>
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-muted text-sm">Inventory Value</p>
              <h2 style={{ marginBottom: 0 }}>₹{summary.inventoryValue?.toLocaleString() || 0}</h2>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel p-4">No data available.</div>
      )}
    </div>
  );
}
