import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import InventoryCapture from './InventoryCapture';
import api from '../../api';
jest.mock('../../api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
let host, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = jest.fn(() => 'blob:preview'); URL.revokeObjectURL = jest.fn();
  jest.clearAllMocks(); api.get.mockResolvedValue({ data: { captures: [] } });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function choose() {
  const input = host.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['original'], 'phone.jpg', { type: 'image/jpeg' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
test('prepares on selection, then saves the processed photo after approval', async () => {
  const prepared = new Blob(['white result'], { type: 'image/webp' });
  api.post.mockImplementation(async (path) => path.endsWith('/prepare') ? { data: prepared } : { data: { id: 'saved', identifier: '0012', createdAt: '2026-11-01' } });
  await act(async () => root.render(<InventoryCapture />));
  await choose();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(host.querySelector('img[alt="White background preview"]')).not.toBeNull();
  const input = host.querySelector('input[maxlength="200"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0012');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.post).toHaveBeenCalledTimes(2);
  const body = api.post.mock.calls[1][1];
  expect(body.get('file').name).toBe('inventory-white.webp');
  expect(body.get('file').size).toBe(prepared.size);
  expect(body.get('identifier')).toBe('0012');
});
test('barcode stays text and a duplicate offers the existing record', async () => {
  const prepared = new Blob(['white result'], { type: 'image/webp' });
  const duplicate = new Error('duplicate');
  duplicate.response = { data: { detail: { message: 'SKU/barcode 0012 is already saved. Edit the existing record instead of creating another.', existingId: 'existing-1', barcode: '0012' } } };
  api.post.mockImplementation(async (path) => (path.endsWith('/prepare') ? { data: prepared } : Promise.reject(duplicate)));
  api.get.mockImplementation(async (path) => (path.endsWith('/existing-1')
    ? { data: { id: 'existing-1', barcode: '0012', identifier: '0012', name: 'Mint', retailPrice: '9.99', description: 'Cool', details: 'Box', createdAt: '2026-11-01T00:00:00Z' } }
    : { data: { captures: [] } }));
  api.put.mockResolvedValue({ data: { id: 'existing-1', barcode: '0012', name: 'Mint', retailPrice: '11.00', description: 'Cool', details: 'Box', createdAt: '2026-11-01T00:00:00Z' } });
  await act(async () => root.render(<InventoryCapture />));
  const barcode = host.querySelector('[data-testid="inventory-barcode"]');
  expect(barcode.type).toBe('text');
  await choose();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(barcode, '0012');
    barcode.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.querySelector('[data-testid="inventory-duplicate"]').textContent).toContain('Edit the existing record');
  await act(async () => host.querySelector('[data-testid="inventory-duplicate"] button').click());
  const price = host.querySelector('[data-testid="inventory-retail-price"]');
  expect(price.value).toBe('9.99');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(price, '11.00');
    price.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api.put).toHaveBeenCalledWith('/admin/inventory-captures/existing-1', expect.objectContaining({ barcode: '0012', retailPrice: '11.00' }));
  expect(host.querySelector('[data-testid="inventory-success"]').textContent).toContain('Updated 0012');
});
test('processing failure blocks saving and offers retry', async () => {
  api.post.mockRejectedValue(new Error('offline'));
  await act(async () => root.render(<InventoryCapture />)); await choose();
  expect(host.querySelector('[role="alert"]').textContent).toContain('preparation failed');
  expect([...host.querySelectorAll('button')].find(x => x.textContent.includes('Approve photo')).disabled).toBe(true);
  expect(host.textContent).toContain('Retry background removal');
  expect(api.post).toHaveBeenCalledTimes(1);
});
