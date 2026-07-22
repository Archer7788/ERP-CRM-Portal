import { useState, useEffect } from 'react';
import { challanApi, customerApi, productApi } from '../services/api';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search, Download } from 'lucide-react';

export default function Challans() {
  const [challans, setChallans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [formData, setFormData] = useState({
    customerId: '',
    items: [],
    status: 'DRAFT',
    notes: ''
  });

  const fetchChallans = async () => {
    setLoading(true);
    try {
      const res = await challanApi.getChallans({ search, limit: 50 });
      if (res.success) {
        setChallans(res.data);
      }
    } catch (error) {
      addToast('Failed to load challans', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDependencies = async () => {
    const custRes = await customerApi.getCustomers({ limit: 100 });
    const prodRes = await productApi.getProducts({ limit: 100 });
    if (custRes.success) setCustomers(custRes.data);
    if (prodRes.success) setProducts(prodRes.data);
  };

  useEffect(() => {
    fetchChallans();
  }, [search]);

  useEffect(() => {
    if (isModalOpen) loadDependencies();
  }, [isModalOpen]);

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: '', quantity: 1 }]
    });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customerId || formData.items.length === 0) {
      return addToast('Please select a customer and add items', 'error');
    }

    try {
      const dataToSubmit = {
        ...formData,
        items: formData.items.map(item => ({
          productId: item.productId,
          quantity: Number(item.quantity)
        }))
      };
      const res = await challanApi.createChallan(dataToSubmit);
      if (res.success) {
        addToast('Challan created successfully', 'success');
        setIsModalOpen(false);
        setFormData({ customerId: '', items: [], status: 'DRAFT', notes: '' });
        fetchChallans();
      } else {
        addToast(res.message, 'error');
      }
    } catch (error) {
      addToast(error.message || 'An error occurred', 'error');
    }
  };

  const columns = [
    { header: 'Challan No', accessor: 'challanNumber' },
    { header: 'Customer', cell: (row) => row.customerSnapshot?.customerName || 'N/A' },
    { header: 'Date', cell: (row) => new Date(row.createdAt).toLocaleDateString() },
    { header: 'Status', cell: (row) => (
      <span className={`status-badge status-${row.status.toLowerCase()}`}>
        {row.status}
      </span>
    )},
    { header: 'Action', cell: (row) => (
      <a href={challanApi.downloadInvoice(row.id)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }}>
        <Download size={14} />
      </a>
    )}
  ];

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <h1>Sales Challans</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={16} style={{ marginRight: '0.5rem' }} /> Create Challan
        </Button>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div className="flex items-center gap-2" style={{ maxWidth: '400px' }}>
          <Search size={20} className="text-muted" />
          <Input 
            placeholder="Search challans..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            containerClassName="w-full"
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      <Table 
        columns={columns} 
        data={challans} 
        loading={loading}
      />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create Challan">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Customer</label>
            <select 
              className="input-field" 
              value={formData.customerId}
              onChange={e => setFormData({...formData, customerId: e.target.value})}
              required
            >
              <option value="">Select Customer...</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.customerName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="input-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Line Items</label>
            {formData.items.map((item, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <select 
                  className="input-field" style={{ flex: 1 }}
                  value={item.productId}
                  onChange={e => handleItemChange(index, 'productId', e.target.value)}
                  required
                >
                  <option value="">Select Product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.productName} (Stock: {p.currentStock})</option>
                  ))}
                </select>
                <Input 
                  type="number" 
                  min="1"
                  value={item.quantity} 
                  onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                  style={{ width: '80px', marginBottom: 0 }}
                  containerClassName="mb-0"
                  required
                />
                <Button type="button" variant="danger" onClick={() => {
                  const newItems = [...formData.items];
                  newItems.splice(index, 1);
                  setFormData({ ...formData, items: newItems });
                }}>X</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={handleAddItem} className="w-full text-sm">
              + Add Product
            </Button>
          </div>

          <div className="input-group">
            <label className="input-label">Status</label>
            <select 
              className="input-field" 
              value={formData.status}
              onChange={e => setFormData({...formData, status: e.target.value})}
            >
              <option value="DRAFT">Save as Draft</option>
              <option value="CONFIRMED">Confirm (Deducts Stock)</option>
            </select>
          </div>

          <Button type="submit">Create Challan</Button>
        </form>
      </Modal>
    </div>
  );
}
