# Frontend Integration Guide: Product Bulk Upload

This document is prepared for the **Frontend Antigravity Agent**.
It contains all details, API specifications, and code examples required to implement the **Admin Bulk Product Upload** feature on the frontend.

---

## 1. Feature Overview

The admin dashboard needs a **Product Bulk Upload** feature allowing store managers to:
1. **Download a sample Excel / CSV template**.
2. **Drag & drop or select an Excel (`.xlsx`, `.xls`) or CSV (`.csv`) file**.
3. **Upload the file to the backend**, which automatically parses products, variants (Color, Size, etc.), inventory, categories, and images.
4. **View a clear status summary**: Total rows, products created/updated, variants created/updated, and a detailed table of any row-level errors.

---

## 2. Backend API Endpoints

All endpoints are prefixed with `/api/v1/admin` and require an **Admin JWT Bearer Token**:
`Authorization: Bearer <admin_token>`

### Endpoint 1: Download Sample Template
- **Method:** `GET`
- **URL:** `/api/v1/admin/products/bulk-upload/template`
- **Headers:** `Authorization: Bearer <token>`
- **Response:** File stream (`text/csv`), filename `product_bulk_upload_template.csv`
- **Usage:** Direct download link or triggered via button click.

---

### Endpoint 2: Bulk Upload File (Recommended)
- **Method:** `POST`
- **URL:** `/api/v1/admin/products/bulk-upload`
- **Headers:**
  - `Authorization: Bearer <token>`
  - `Content-Type: multipart/form-data`
- **Body:** `FormData` containing the file under key `"file"`:
  ```js
  const formData = new FormData();
  formData.append('file', selectedFile); // selectedFile must be .csv, .xlsx, or .xls
  ```

#### Response Structure:

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Bulk upload processed successfully (2 products created, 0 updated, 6 variants created, 0 updated)",
  "data": {
    "success": true,
    "totalRows": 6,
    "productsCreated": 2,
    "productsUpdated": 0,
    "variantsCreated": 6,
    "variantsUpdated": 0,
    "errors": []
  }
}
```

**Partial Error / Validation Error Response (`200 OK` or `422 Unprocessable Entity`):**
```json
{
  "success": false,
  "message": "Bulk upload processed with 1 error(s)",
  "data": {
    "success": false,
    "totalRows": 6,
    "productsCreated": 1,
    "productsUpdated": 0,
    "variantsCreated": 3,
    "variantsUpdated": 0,
    "errors": [
      {
        "row": 4,
        "identifier": "CC-CREW-BAD",
        "error": "Invalid variant price \"abc\". Must be a valid positive amount."
      }
    ]
  }
}
```

---

### Endpoint 3: Bulk Upload via JSON Array (Optional Alternative)
- **Method:** `POST`
- **URL:** `/api/v1/admin/products/bulk`
- **Headers:**
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "rows": [
      {
        "handle": "cc-crewneck-tee",
        "category_name": "Essentials",
        "product_name": "Supima Classic Crewneck Tee",
        "description": "Crafted from 100% American Supima cotton.",
        "base_price": "1299.00",
        "product_status": "ACTIVE",
        "sku": "CC-CREW-IVR-S",
        "variant_price": "1299.00",
        "compare_at_price": "1599.00",
        "variant_status": "ACTIVE",
        "stock_quantity": 25,
        "low_stock_threshold": 5,
        "color": "Ivory White",
        "color_code": "#F5F5F0",
        "size": "S",
        "primary_image_url": "https://example.com/img.jpg"
      }
    ]
  }
  ```

---

## 3. Excel / CSV Column Specification

| Column Name | Required | Example | Description |
| :--- | :--- | :--- | :--- |
| `handle` | Yes | `cc-crewneck-tee` | Grouping key for product variants. |
| `category_name` | Yes | `Essentials` | Existing or new category name. |
| `product_name` | Yes | `Supima Classic Crewneck Tee` | Product display name. |
| `description` | No | `Premium organic cotton...` | Product description text. |
| `base_price` | Yes | `1299.00` | Base / starting price. |
| `product_status` | No | `ACTIVE` | `ACTIVE` or `INACTIVE` (default: `ACTIVE`). |
| `sku` | Yes | `CC-CREW-IVR-S` | Unique SKU (alphanumeric + hyphens/underscores). |
| `variant_price` | Yes | `1299.00` | Selling price for this variant. |
| `compare_at_price` | No | `1599.00` | Original / strike-through price. |
| `variant_status` | No | `ACTIVE` | `ACTIVE` or `INACTIVE` (default: `ACTIVE`). |
| `stock_quantity` | Yes | `25` | Available inventory quantity (integer $\ge 0$). |
| `low_stock_threshold` | No | `5` | Low stock alert threshold (default: 5). |
| `color` | No | `Ivory White` | Variant Color name. |
| `color_code` | No | `#F5F5F0` | Hex code for color swatch preview. |
| `size` | No | `S` | Variant Size (e.g. `XS`, `S`, `M`, `L`, `XL`, `32`). |
| `image_urls` | No | `https://.../img1.jpg, https://.../img2.jpg` | Comma-separated image URLs. |
| `primary_image_url` | No | `https://.../main.jpg` | Main cover image. |

---

## 4. Recommended Frontend Implementation

### A. API Service Function (`src/services/productService.ts` or `adminApi.ts`)

```typescript
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

// 1. Download template file
export async function downloadBulkUploadTemplate(token: string): Promise<void> {
  const response = await axios.get(`${API_BASE}/admin/products/bulk-upload/template`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'blob',
  });

  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'product_bulk_upload_template.csv');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// 2. Upload Excel / CSV file
export interface BulkUploadResponse {
  success: boolean;
  message: string;
  data: {
    success: boolean;
    totalRows: number;
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
    errors: Array<{
      row: number;
      identifier?: string;
      error: string;
    }>;
  };
}

export async function uploadProductsBulk(file: File, token: string): Promise<BulkUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post<BulkUploadResponse>(
    `${API_BASE}/admin/products/bulk-upload`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data;
}
```

---

### B. React / Next.js Component Example (`BulkUploadModal.tsx` or `BulkUploadPage.tsx`)

```tsx
import React, { useState } from 'react';
import { uploadProductsBulk, downloadBulkUploadTemplate, BulkUploadResponse } from '@/services/productService';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  authToken: string;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  authToken,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkUploadResponse['data'] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setErrorMessage(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setErrorMessage('Please select a .csv or .xlsx file first.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const res = await uploadProductsBulk(file, authToken);
      setResult(res.data);
      if (res.data.success && onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-5">
        <div className="flex justify-between items-center border-b pb-3">
          <h2 className="text-xl font-bold text-gray-800">Bulk Upload Products</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg text-sm text-blue-900">
          <span>Need the proper format? Download our sample CSV template:</span>
          <button
            type="button"
            onClick={() => downloadBulkUploadTemplate(authToken)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium shadow-sm transition"
          >
            Download Template
          </button>
        </div>

        {/* File Input */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition">
          <input
            type="file"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={handleFileChange}
            id="bulk-file-input"
            className="hidden"
          />
          <label htmlFor="bulk-file-input" className="cursor-pointer block space-y-2">
            <div className="text-3xl">📁</div>
            <span className="text-sm font-semibold text-gray-700">
              {file ? file.name : 'Click to browse or drag & drop .xlsx or .csv'}
            </span>
            <p className="text-xs text-gray-500">Supports Excel (.xlsx, .xls) and CSV (.csv) up to 15MB</p>
          </label>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {errorMessage}
          </div>
        )}

        {/* Result Summary */}
        {result && (
          <div className="space-y-3">
            <div className={`p-4 rounded-lg text-sm ${result.success ? 'bg-green-50 text-green-900 border border-green-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}>
              <div className="font-semibold text-base mb-1">
                {result.success ? '🎉 Upload Processed Successfully!' : '⚠️ Completed with errors'}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>Total rows: <strong>{result.totalRows}</strong></div>
                <div>Products created: <strong>{result.productsCreated}</strong></div>
                <div>Variants created: <strong>{result.variantsCreated}</strong></div>
                <div>Products updated: <strong>{result.productsUpdated}</strong></div>
              </div>
            </div>

            {/* Error table if any */}
            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-red-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-red-100 text-red-900 sticky top-0">
                    <tr>
                      <th className="p-2">Row</th>
                      <th className="p-2">Identifier</th>
                      <th className="p-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((err, idx) => (
                      <tr key={idx} className="border-t border-red-100 bg-red-50/50">
                        <td className="p-2 font-mono">{err.row}</td>
                        <td className="p-2 font-mono">{err.identifier || '-'}</td>
                        <td className="p-2 text-red-700">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-3 pt-3 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 font-medium"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium shadow-sm transition"
          >
            {uploading ? 'Processing...' : 'Upload Products'}
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## 5. Summary Checklist for Frontend Agent

- [ ] Add **"Bulk Upload"** button in the Products list toolbar.
- [ ] Connect the **"Download Template"** action to `GET /api/v1/admin/products/bulk-upload/template`.
- [ ] Implement file upload using `multipart/form-data` with key `file` targeting `POST /api/v1/admin/products/bulk-upload`.
- [ ] Display the operation result (`productsCreated`, `variantsCreated`, etc.).
- [ ] Render row-level validation errors clearly if any row fails validation.
- [ ] Refresh the product table automatically after successful upload.
