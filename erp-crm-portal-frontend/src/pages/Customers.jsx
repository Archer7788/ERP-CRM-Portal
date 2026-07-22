import { useState, useEffect } from 'react';
import { customerApi } from '../services/api';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search } from 'lucide-react';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    customerName: '',
    mobileNumber: '',
    email: '',
    businessName: '',
    customerType: 'RETAIL',
    status: 'ACTIVE',
    address: ''
  });

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await customerApi.getCustomers({ search, limit: 50 });
      if (res.success) {
        setCustomers(res.data);
      }
    } catch (error) {
      addToast('Failed to load customers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await customerApi.createCustomer(formData);
      if (res.success) {
        addToast('Customer created successfully', 'success');
        setIsModalOpen(false);
        fetchCustomers();
      } else {
        addToast(res.message, 'error');
      }
    } catch (error) {
      addToast(error.message || 'An error occurred', 'error');
    }
  };

  const columns = [
    { header: 'Customer Name', accessor: 'customerName' },
    { header: 'Business', accessor: 'businessName' },
    { header: 'Mobile', accessor: 'mobileNumber' },
    { header: 'Status', cell: (row) => (
      <span className={`status-badge status-${row.status.toLowerCase()}`}>
        {row.status}
      </span>
    )}
  ];

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <h1>Customers</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={16} style={{ marginRight: '0.5rem' }} /> Add Customer
        </Button>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div className="flex items-center gap-2" style={{ maxWidth: '400px' }}>
          <Search size={20} className="text-muted" />
          <Input 
            placeholder="Search customers..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            containerClassName="w-full"
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      <Table 
        columns={columns} 
        data={customers} 
        loading={loading}
      />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Customer">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input 
            label="Customer Name" 
            required 
            value={formData.customerName} 
            onChange={e => setFormData({...formData, customerName: e.target.value})} 
          />
          <Input 
            label="Mobile Number" 
            required 
            value={formData.mobileNumber} 
            onChange={e => setFormData({...formData, mobileNumber: e.target.value})} 
          />
          <Input 
            label="Email" 
            type="email"
            value={formData.email} 
            onChange={e => setFormData({...formData, email: e.target.value})} 
          />
          <Input 
            label="Business Name" 
            value={formData.businessName} 
            onChange={e => setFormData({...formData, businessName: e.target.value})} 
          />
          <div className="input-group">
            <label className="input-label">Customer Type</label>
            <select 
              className="input-field" 
              value={formData.customerType}
              onChange={e => setFormData({...formData, customerType: e.target.value})}
            >
              <option value="RETAIL">Retail</option>
              <option value="WHOLESALE">Wholesale</option>
              <option value="DISTRIBUTOR">Distributor</option>
            </select>
          </div>
          <Button type="submit">Save Customer</Button>
        </form>
      </Modal>
    </div>
  );
}
