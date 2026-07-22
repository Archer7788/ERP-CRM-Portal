import { ApiError } from '../../common/api-error';
import { AuthUser } from '../../common/types';
import { buildPaginationMeta, buildPaginationOptions } from '../../common/pagination';
import * as repository from './customer.repository';
import { Customer, CustomerFollowUp, CustomerWithFollowUps } from './customer.types';
import {
  CreateCustomerInput,
  CreateFollowUpInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customer.validation';

/** GET /customers - search, filter, sort and paginate customers. */
export const listCustomers = async (queryParams: ListCustomersQuery) => {
  const pagination = buildPaginationOptions(queryParams);
  const filters = {
    search: queryParams.search,
    status: queryParams.status,
    customerType: queryParams.customerType,
    followUpFrom: queryParams.followUpFrom,
    followUpTo: queryParams.followUpTo,
    hasGst: queryParams.hasGst,
    createdBy: queryParams.createdBy,
  };

  const { items, total, sortKey } = await repository.findCustomers(filters, pagination);
  const meta = buildPaginationMeta(pagination, total, sortKey, { ...filters, search: queryParams.search });
  const statusSummary = await repository.countCustomersByStatus();

  return { items, meta: { ...meta, summary: { byStatus: statusSummary } } };
};

/** GET /customers/:id - full customer detail including follow-up history. */
export const getCustomerById = async (id: string): Promise<CustomerWithFollowUps> => {
  const customer = await repository.findCustomerById(id);
  if (!customer) {
    throw ApiError.notFound(`Customer with id "${id}" was not found.`, 'CUSTOMER_NOT_FOUND');
  }
  const followUps = await repository.findFollowUpsByCustomer(id);
  return { ...customer, followUps };
};

/** POST /customers */
export const createCustomer = async (input: CreateCustomerInput, user: AuthUser): Promise<Customer> => {
  const duplicate = await repository.findCustomerByMobile(input.mobileNumber);
  if (duplicate) {
    throw ApiError.conflict(
      `A customer with the mobile number "${input.mobileNumber}" already exists.`,
      'DUPLICATE_MOBILE_NUMBER',
      { mobileNumber: input.mobileNumber },
    );
  }
  return repository.insertCustomer(input, user.id);
};

/** PUT /customers/:id */
export const updateCustomer = async (id: string, input: UpdateCustomerInput): Promise<Customer> => {
  const existing = await repository.findCustomerById(id);
  if (!existing) {
    throw ApiError.notFound(`Customer with id "${id}" was not found.`, 'CUSTOMER_NOT_FOUND');
  }

  if (input.mobileNumber && input.mobileNumber !== existing.mobileNumber) {
    const duplicate = await repository.findCustomerByMobile(input.mobileNumber, id);
    if (duplicate) {
      throw ApiError.conflict(
        `Another customer already uses the mobile number "${input.mobileNumber}".`,
        'DUPLICATE_MOBILE_NUMBER',
        { mobileNumber: input.mobileNumber },
      );
    }
  }

  const updated = await repository.updateCustomerById(id, input);
  return updated as Customer;
};

/** POST /customers/:id/follow-ups - add a follow-up note to a customer. */
export const addFollowUpNote = async (
  customerId: string,
  input: CreateFollowUpInput,
  user: AuthUser,
): Promise<{ followUp: CustomerFollowUp; customer: Customer }> => {
  const customer = await repository.findCustomerById(customerId);
  if (!customer) {
    throw ApiError.notFound(`Customer with id "${customerId}" was not found.`, 'CUSTOMER_NOT_FOUND');
  }

  const followUp = await repository.insertFollowUp(customerId, input, user.id);

  if (input.updateCustomerFollowUpDate && input.followUpDate) {
    await repository.applyFollowUpToCustomer(customerId, input.followUpDate, input.status);
  } else if (input.status) {
    await repository.applyFollowUpToCustomer(customerId, undefined as unknown as string, input.status);
  }

  const refreshed = await repository.findCustomerById(customerId);
  return { followUp, customer: refreshed as Customer };
};

/** GET /customers/:id/follow-ups */
export const listFollowUps = async (customerId: string): Promise<CustomerFollowUp[]> => {
  const customer = await repository.findCustomerById(customerId);
  if (!customer) {
    throw ApiError.notFound(`Customer with id "${customerId}" was not found.`, 'CUSTOMER_NOT_FOUND');
  }
  return repository.findFollowUpsByCustomer(customerId);
};
