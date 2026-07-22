import { useState, useEffect } from 'react';
import { productApi } from '../services/api';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { useToast } from '../contexts/ToastContext';
import { Plus, Search } from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    productName: '',
    sku: '',
    category: '',
    unitPrice: 0,
    currentStock: 0,
    minStockAlert: 0,
    warehouseLocation: ''
  });

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await productApi.getProducts({ search, limit: 50 });
      if (res.success) {
        setProducts(res.data);
      }
    } catch (error) {
      addToast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        unitPrice: Number(formData.unitPrice),
        currentStock: Number(formData.currentStock),
        minStockAlert: Number(formData.minStockAlert)
      };
      
      const res = await productApi.createProduct(data);
      if (res.success) {
        addToast('Product created successfully', 'success');
        setIsModalOpen(false);
        fetchProducts();
      } else {
        addToast(res.message, 'error');
      }
    } catch (error) {
      addToast(error.message || 'An error occurred', 'error');
    }
  };

  const columns = [
    { header: 'Product Name', accessor: 'productName' },
    { header: 'SKU', accessor: 'sku' },
    { header: 'Category', accessor: 'category' },
    { header: 'Price', cell: (row) => `₹${row.unitPrice}` },
    { header: 'Stock', cell: (row) => (
      <span className={row.currentStock <= row.minStockAlert ? 'text-danger' : ''}>
        {row.currentStock}
      </span>
    )}
  ];

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <h1>Products</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={16} style={{ marginRight: '0.5rem' }} /> Add Product
        </Button>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div className="flex items-center gap-2" style={{ maxWidth: '400px' }}>
          <Search size={20} className="text-muted" />
          <Input 
            placeholder="Search products..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            containerClassName="w-full"
            style={{ marginBottom: 0 }}
          />
        </div>
      </div>

      <Table 
        columns={columns} 
        data={products} 
        loading={loading}
      />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Product">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input 
            label="Product Name" 
            required 
            value={formData.productName} 
            onChange={e => setFormData({...formData, productName: e.target.value})} 
          />
          <Input 
            label="SKU" 
            required 
            value={formData.sku} 
            onChange={e => setFormData({...formData, sku: e.target.value})} 
          />
          <Input 
            label="Category" 
            required
            value={formData.category} 
            onChange={e => setFormData({...formData, category: e.target.value})} 
          />
          <div className="flex gap-4">
            <Input 
              label="Unit Price" 
              type="number"
              required 
              value={formData.unitPrice} 
              onChange={e => setFormData({...formData, unitPrice: e.target.value})} 
              containerClassName="w-full"
            />
            <Input 
              label="Opening Stock" 
              type="number"
              required 
              value={formData.currentStock} 
              onChange={e => setFormData({...formData, currentStock: e.target.value})} 
              containerClassName="w-full"
            />
          </div>
          <div className="flex gap-4">
            <Input 
              label="Min Stock Alert" 
              type="number"
              required 
              value={formData.minStockAlert} 
              onChange={e => setFormData({...formData, minStockAlert: e.target.value})} 
              containerClassName="w-full"
            />
            <Input 
              label="Warehouse Location" 
              value={formData.warehouseLocation} 
              onChange={e => setFormData({...formData, warehouseLocation: e.target.value})} 
              containerClassName="w-full"
            />
          </div>
          <Button type="submit">Save Product</Button>
        </form>
      </Modal>
    </div>
  );
}
