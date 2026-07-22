import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Users, Package, FileText, LogOut } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} />, roles: ['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS'] },
    { name: 'Customers', path: '/customers', icon: <Users size={20} />, roles: ['ADMIN', 'SALES', 'ACCOUNTS'] },
    { name: 'Products', path: '/products', icon: <Package size={20} />, roles: ['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS'] },
    { name: 'Challans', path: '/challans', icon: <FileText size={20} />, roles: ['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS'] },
  ];

  const allowedNavItems = navItems.filter(item => 
    user?.userRole === 'ADMIN' || item.roles.includes(user?.userRole)
  );

  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      <aside className="glass-panel" style={{ width: '250px', display: 'flex', flexDirection: 'column', borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderLeft: 'none' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 0 }}>ERP + CRM</h2>
        </div>
        <nav style={{ flex: 1, padding: '1rem 0' }}>
          {allowedNavItems.map(item => (
            <Link 
              key={item.name} 
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1.5rem',
                color: location.pathname === item.path ? 'var(--brand-primary)' : 'var(--text-secondary)',
                background: location.pathname === item.path ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                fontWeight: location.pathname === item.path ? 600 : 400,
                borderRight: location.pathname === item.path ? '3px solid var(--brand-primary)' : '3px solid transparent'
              }}
            >
              {item.icon}
              {item.name}
            </Link>
          ))}
        </nav>
        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 500 }}>{user?.firstName} {user?.lastName}</div>
            <div className="text-sm text-muted">{user?.userRole}</div>
          </div>
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontWeight: 500, width: '100%', padding: '0.5rem 0' }}>
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>
      
      <main style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
