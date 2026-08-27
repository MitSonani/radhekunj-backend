/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app.js';
import { prisma } from '../../database/prisma.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import { appConfig } from '../../config/index.js';

const app = createApp();

let customerId: string;
let otherCustomerId: string;
let customerToken: string;
let otherCustomerToken: string;

const validAddress = {
  fullName: 'Priya Sharma',
  countryCode: '+91',
  mobileNumber: '9876543210',
  addressLine1: '12 MG Road',
  addressLine2: 'Near City Mall',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'India',
  label: 'Home',
};

const officeAddress = {
  fullName: 'Priya Sharma',
  countryCode: '+91',
  mobileNumber: '9876543210',
  addressLine1: '88 Brigade Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560025',
  country: 'India',
  label: 'Office',
};

const otherAddress = {
  fullName: 'Priya Sharma',
  countryCode: '+91',
  mobileNumber: '9876543210',
  addressLine1: '5 Residency Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560025',
  country: 'India',
  label: 'Other',
};

async function cleanDatabase() {
  await prisma.address.deleteMany({});
  await prisma.wishlistItem.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.cart.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
}

beforeEach(async () => {
  await cleanDatabase();

  const customerRole = await prisma.role.create({ data: { name: 'customer' } });

  const customerUser = await prisma.user.create({
    data: { name: 'Customer One', mobileNumber: '8888888881', roleId: customerRole.id },
  });
  const otherUser = await prisma.user.create({
    data: { name: 'Customer Two', mobileNumber: '7777777771', roleId: customerRole.id },
  });

  customerId = customerUser.id;
  otherCustomerId = otherUser.id;
  customerToken = jwt.sign({ id: customerUser.id }, appConfig.jwtSecret);
  otherCustomerToken = jwt.sign({ id: otherUser.id }, appConfig.jwtSecret);
});

afterAll(async () => {
  await cleanDatabase();
});

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createAddress(token: string, body: Record<string, unknown> = validAddress) {
  return request(app).post('/api/v1/addresses').set(authHeader(token)).send(body);
}

async function getAddresses(token: string) {
  return request(app).get('/api/v1/addresses').set(authHeader(token));
}

async function getAddress(token: string, id: string) {
  return request(app).get(`/api/v1/addresses/${id}`).set(authHeader(token));
}

async function updateAddress(token: string, id: string, body: Record<string, unknown>) {
  return request(app).patch(`/api/v1/addresses/${id}`).set(authHeader(token)).send(body);
}

async function setDefault(token: string, id: string) {
  return request(app).patch(`/api/v1/addresses/${id}/default`).set(authHeader(token));
}

async function deleteAddress(token: string, id: string) {
  return request(app).delete(`/api/v1/addresses/${id}`).set(authHeader(token));
}

// ---------------------------------------------------------------------------
// 1. AUTHENTICATION
// ---------------------------------------------------------------------------

describe('Addresses — Authentication', () => {
  it('1. Unauthenticated user cannot get addresses', async () => {
    const res = await request(app).get('/api/v1/addresses');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('2. Unauthenticated user cannot create address', async () => {
    const res = await request(app).post('/api/v1/addresses').send(validAddress);
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('3. Unauthenticated user cannot update address', async () => {
    const res = await request(app)
      .patch('/api/v1/addresses/00000000-0000-0000-0000-000000000000')
      .send({ city: 'Mumbai' });
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });

  it('4. Unauthenticated user cannot delete address', async () => {
    const res = await request(app).delete('/api/v1/addresses/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
  });
});

// ---------------------------------------------------------------------------
// 2. CREATE
// ---------------------------------------------------------------------------

describe('Addresses — Create (POST /api/v1/addresses)', () => {
  it('5. Create valid address', async () => {
    const res = await createAddress(customerToken);

    expect(res.status).toBe(HTTP_STATUS.CREATED);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fullName).toBe(validAddress.fullName);
    expect(res.body.data.countryCode).toBe('+91');
    expect(res.body.data.mobileNumber).toBe('9876543210');
    expect(res.body.data.addressLine1).toBe(validAddress.addressLine1);
    expect(res.body.data.addressLine2).toBe(validAddress.addressLine2);
    expect(res.body.data.city).toBe(validAddress.city);
    expect(res.body.data.state).toBe(validAddress.state);
    expect(res.body.data.postalCode).toBe(validAddress.postalCode);
    expect(res.body.data.country).toBe(validAddress.country);
    expect(res.body.data.label).toBe('Home');
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.userId).toBeUndefined();
  });

  it('6. First address automatically becomes default', async () => {
    const res = await createAddress(customerToken);

    expect(res.status).toBe(HTTP_STATUS.CREATED);
    expect(res.body.data.isDefault).toBe(true);
  });

  it('7. Second address does not become default unless requested', async () => {
    await createAddress(customerToken);
    const res = await createAddress(customerToken, officeAddress);

    expect(res.status).toBe(HTTP_STATUS.CREATED);
    expect(res.body.data.isDefault).toBe(false);
    expect(res.body.data.label).toBe('Office');

    const list = await getAddresses(customerToken);
    const defaults = list.body.data.items.filter((item: { isDefault: boolean }) => item.isDefault);
    expect(defaults).toHaveLength(1);
  });

  it('7b. Second address becomes default when isDefault is true', async () => {
    const first = await createAddress(customerToken);
    const second = await createAddress(customerToken, { ...officeAddress, isDefault: true });

    expect(second.body.data.isDefault).toBe(true);

    const firstAfter = await getAddress(customerToken, first.body.data.id);
    expect(firstAfter.body.data.isDefault).toBe(false);

    const defaultCount = await prisma.address.count({
      where: { userId: customerId, isDefault: true },
    });
    expect(defaultCount).toBe(1);
  });

  it('8. Invalid address rejected', async () => {
    const res = await createAddress(customerToken, {
      ...validAddress,
      fullName: '',
      mobileNumber: 'abc',
    });

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
    expect(res.body.success).toBe(false);
  });

  it('8b. Missing required fields rejected', async () => {
    const res = await createAddress(customerToken, { fullName: 'Priya' });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('8c. Malformed country code rejected', async () => {
    const res = await createAddress(customerToken, { ...validAddress, countryCode: '91' });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('8d. Oversized input rejected', async () => {
    const res = await createAddress(customerToken, {
      ...validAddress,
      fullName: 'A'.repeat(201),
    });
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('8e. Address line 2 is optional', async () => {
    const { addressLine2: _omit, ...withoutLine2 } = validAddress;
    const res = await createAddress(customerToken, withoutLine2);

    expect(res.status).toBe(HTTP_STATUS.CREATED);
    expect(res.body.data.addressLine2).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. GET
// ---------------------------------------------------------------------------

describe('Addresses — GET /api/v1/addresses', () => {
  it("9. Get user's addresses", async () => {
    await createAddress(customerToken);
    await createAddress(customerToken, officeAddress);

    const res = await getAddresses(customerToken);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.count).toBe(2);
  });

  it('10. Default address appears first', async () => {
    const first = await createAddress(customerToken);
    await createAddress(customerToken, officeAddress);
    await createAddress(customerToken, otherAddress);
    await setDefault(customerToken, first.body.data.id);

    const res = await getAddresses(customerToken);

    expect(res.body.data.items[0].isDefault).toBe(true);
    expect(res.body.data.items[0].id).toBe(first.body.data.id);
  });

  it("11. User cannot see another user's addresses", async () => {
    await createAddress(customerToken);
    await createAddress(otherCustomerToken, {
      ...validAddress,
      fullName: 'Rahul Verma',
      addressLine1: 'Other user street',
    });

    const res = await getAddresses(customerToken);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].fullName).toBe(validAddress.fullName);
    expect(res.body.data.items[0].addressLine1).not.toBe('Other user street');
  });

  it('Empty list when user has no addresses', async () => {
    const res = await getAddresses(customerToken);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.count).toBe(0);
  });
});

describe('Addresses — GET /api/v1/addresses/:id', () => {
  it('Returns own address', async () => {
    const created = await createAddress(customerToken);
    const res = await getAddress(customerToken, created.body.data.id);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.id).toBe(created.body.data.id);
  });

  it('Invalid address ID is rejected', async () => {
    const res = await getAddress(customerToken, 'not-a-uuid');
    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });

  it('Unknown address ID returns 404', async () => {
    const res = await getAddress(customerToken, '00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
  });
});

// ---------------------------------------------------------------------------
// 4. UPDATE
// ---------------------------------------------------------------------------

describe('Addresses — Update (PATCH /api/v1/addresses/:id)', () => {
  it('12. Update own address', async () => {
    const created = await createAddress(customerToken);
    const res = await updateAddress(customerToken, created.body.data.id, {
      city: 'Mumbai',
      postalCode: '400001',
      state: 'Maharashtra',
    });

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.city).toBe('Mumbai');
    expect(res.body.data.postalCode).toBe('400001');
    expect(res.body.data.fullName).toBe(validAddress.fullName);
  });

  it("13. Update another user's address rejected", async () => {
    const created = await createAddress(customerToken);
    const res = await updateAddress(otherCustomerToken, created.body.data.id, {
      city: 'Hacked',
    });

    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);

    const original = await getAddress(customerToken, created.body.data.id);
    expect(original.body.data.city).toBe(validAddress.city);
  });

  it('14. Set address as default', async () => {
    await createAddress(customerToken);
    const second = await createAddress(customerToken, officeAddress);

    const res = await setDefault(customerToken, second.body.data.id);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.data.isDefault).toBe(true);
    expect(res.body.data.id).toBe(second.body.data.id);
  });

  it('15. Previous default becomes false', async () => {
    const first = await createAddress(customerToken);
    const second = await createAddress(customerToken, officeAddress);

    await setDefault(customerToken, second.body.data.id);

    const firstAfter = await getAddress(customerToken, first.body.data.id);
    expect(firstAfter.body.data.isDefault).toBe(false);

    const defaultCount = await prisma.address.count({
      where: { userId: customerId, isDefault: true },
    });
    expect(defaultCount).toBe(1);
  });

  it('Setting isDefault true via PATCH unsets the previous default', async () => {
    const first = await createAddress(customerToken);
    const second = await createAddress(customerToken, officeAddress);

    const res = await updateAddress(customerToken, second.body.data.id, { isDefault: true });

    expect(res.body.data.isDefault).toBe(true);

    const firstAfter = await getAddress(customerToken, first.body.data.id);
    expect(firstAfter.body.data.isDefault).toBe(false);
  });

  it('Cannot unset the default address via isDefault false', async () => {
    const created = await createAddress(customerToken);
    await createAddress(customerToken, officeAddress);

    const res = await updateAddress(customerToken, created.body.data.id, { isDefault: false });

    expect(res.status).toBe(HTTP_STATUS.UNPROCESSABLE);
  });
});

// ---------------------------------------------------------------------------
// 5. DELETE
// ---------------------------------------------------------------------------

describe('Addresses — Delete (DELETE /api/v1/addresses/:id)', () => {
  it('16. Delete own address', async () => {
    const created = await createAddress(customerToken);
    const res = await deleteAddress(customerToken, created.body.data.id);

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);

    const count = await prisma.address.count({ where: { userId: customerId } });
    expect(count).toBe(0);
  });

  it("17. Delete another user's address rejected", async () => {
    const created = await createAddress(customerToken);
    const res = await deleteAddress(otherCustomerToken, created.body.data.id);

    expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);

    const count = await prisma.address.count({ where: { userId: customerId } });
    expect(count).toBe(1);
  });

  it('18. Delete non-default address', async () => {
    const first = await createAddress(customerToken);
    const second = await createAddress(customerToken, officeAddress);

    const res = await deleteAddress(customerToken, second.body.data.id);

    expect(res.status).toBe(HTTP_STATUS.OK);

    const remaining = await getAddress(customerToken, first.body.data.id);
    expect(remaining.body.data.isDefault).toBe(true);
  });

  it('19. Delete default address', async () => {
    const first = await createAddress(customerToken);
    await createAddress(customerToken, officeAddress);

    const res = await deleteAddress(customerToken, first.body.data.id);

    expect(res.status).toBe(HTTP_STATUS.OK);
  });

  it('20. Another address becomes default when the default is deleted', async () => {
    const first = await createAddress(customerToken);
    const second = await createAddress(customerToken, officeAddress);

    await deleteAddress(customerToken, first.body.data.id);

    const remaining = await getAddress(customerToken, second.body.data.id);
    expect(remaining.body.data.isDefault).toBe(true);

    const defaultCount = await prisma.address.count({
      where: { userId: customerId, isDefault: true },
    });
    expect(defaultCount).toBe(1);
  });

  it('20b. Oldest remaining address is promoted after default delete', async () => {
    const first = await createAddress(customerToken, validAddress);
    const second = await createAddress(customerToken, officeAddress);
    const third = await createAddress(customerToken, otherAddress);

    await setDefault(customerToken, third.body.data.id);
    await deleteAddress(customerToken, third.body.data.id);

    const list = await getAddresses(customerToken);
    const defaults = list.body.data.items.filter((item: { isDefault: boolean }) => item.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(first.body.data.id);
    expect(second.body.data.id).not.toBe(defaults[0].id);
  });

  it('21. Delete last address successfully', async () => {
    const created = await createAddress(customerToken);
    const res = await deleteAddress(customerToken, created.body.data.id);

    expect(res.status).toBe(HTTP_STATUS.OK);

    const list = await getAddresses(customerToken);
    expect(list.body.data.items).toEqual([]);
    expect(list.body.data.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. DEFAULT
// ---------------------------------------------------------------------------

describe('Addresses — Default constraint', () => {
  it('22. Only one default address exists', async () => {
    await createAddress(customerToken);
    await createAddress(customerToken, officeAddress);
    const third = await createAddress(customerToken, otherAddress);

    await setDefault(customerToken, third.body.data.id);

    const defaultCount = await prisma.address.count({
      where: { userId: customerId, isDefault: true },
    });
    expect(defaultCount).toBe(1);
  });

  it('23. Concurrent default updates do not leave multiple defaults', async () => {
    const first = await createAddress(customerToken);
    const second = await createAddress(customerToken, officeAddress);
    const third = await createAddress(customerToken, otherAddress);

    const results = await Promise.all([
      setDefault(customerToken, first.body.data.id),
      setDefault(customerToken, second.body.data.id),
      setDefault(customerToken, third.body.data.id),
    ]);

    const successes = results.filter((r) => r.status === HTTP_STATUS.OK);
    expect(successes.length).toBe(3);

    const defaultCount = await prisma.address.count({
      where: { userId: customerId, isDefault: true },
    });
    expect(defaultCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. SECURITY
// ---------------------------------------------------------------------------

describe('Addresses — Security', () => {
  it('24. userId from request body is ignored', async () => {
    const res = await createAddress(customerToken, {
      ...validAddress,
      userId: otherCustomerId,
    });

    expect(res.status).toBe(HTTP_STATUS.CREATED);

    const ownedByOther = await prisma.address.count({
      where: { userId: otherCustomerId },
    });
    expect(ownedByOther).toBe(0);

    const ownedByCaller = await prisma.address.count({
      where: { userId: customerId },
    });
    expect(ownedByCaller).toBe(1);
  });

  it('25. Cross-user access is blocked', async () => {
    const created = await createAddress(customerToken);
    const addressId = created.body.data.id as string;

    const getRes = await getAddress(otherCustomerToken, addressId);
    const patchRes = await updateAddress(otherCustomerToken, addressId, { city: 'Hacked' });
    const defaultRes = await setDefault(otherCustomerToken, addressId);
    const deleteRes = await deleteAddress(otherCustomerToken, addressId);

    expect(getRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(patchRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(defaultRes.status).toBe(HTTP_STATUS.NOT_FOUND);
    expect(deleteRes.status).toBe(HTTP_STATUS.NOT_FOUND);

    const stillThere = await getAddress(customerToken, addressId);
    expect(stillThere.status).toBe(HTTP_STATUS.OK);
    expect(stillThere.body.data.city).toBe(validAddress.city);
  });

  it('createdAt and updatedAt from the body are ignored', async () => {
    const res = await createAddress(customerToken, {
      ...validAddress,
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    });

    expect(res.status).toBe(HTTP_STATUS.CREATED);
    expect(new Date(res.body.data.createdAt).getFullYear()).toBeGreaterThan(2000);
  });
});
