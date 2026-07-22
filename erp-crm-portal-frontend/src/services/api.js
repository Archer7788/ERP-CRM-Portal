const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export const request = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  // If body is FormData, don't set Content-Type so the browser can set it with the boundary
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw {
      status: response.status,
      message: data?.message || 'Something went wrong',
      error: data?.error,
      details: data?.details
    };
  }

  return data;
};

export const authApi = {
  login: (credentials) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),
  getMe: () => request('/auth/me'),
};

export const inventoryApi = {
  getInventory: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/inventory?${qs}`);
  }
};

export const customerApi = {
  getCustomers: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/customers?${qs}`);
  },
  getCustomer: (id) => request(`/customers/${id}`),
  createCustomer: (data) => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id, data) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  addFollowUp: (id, data) => request(`/customers/${id}/follow-ups`, { method: 'POST', body: JSON.stringify(data) }),
};

export const productApi = {
  getProducts: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/products?${qs}`);
  },
  getProduct: (id) => request(`/products/${id}`),
  createProduct: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadImage: (id, formData) => request(`/products/${id}/image`, { method: 'POST', body: formData }),
};

export const challanApi = {
  getChallans: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/challans?${qs}`);
  },
  getChallan: (id) => request(`/challans/${id}`),
  createChallan: (data) => request('/challans', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id, status, reason) => request(`/challans/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  downloadInvoice: (id) => `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1'}/challans/${id}/invoice?download=true`,
};
