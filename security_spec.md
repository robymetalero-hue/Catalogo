# Security Specification: Catálogo Virtual

This document specifies the data invariants and access controls for the Virtual Catalog application, following the Firebase Integration Skill guidelines.

## Data Invariants

1. **Information Read Public Access**: Anyone (even unauthenticated users) can read and list the `products` and `storeConfig` collections.
2. **Strict Admin Write-Access**: Writing (create, update, delete) to **any** document in both collections is strictly forbidden for non-admin users. Only authenticated administrators can write.
3. **Admin Identification**: An admin user is defined as an authenticated user whose email is verified and matches `robymetalero@gmail.com`, or who has a corresponding document in the `/admins` collection.
4. **Id Validation**: All document IDs must be strings of size less than or equal to 128 characters and match `^[a-zA-Z0-9_\-]+$`.
5. **Timestamp Integrity**: All timestamps (such as `createdAt` or `updatedAt`) must be strictly validated using `request.time`. Direct client-spoofed timestamps are rejected.
6. **Immutable Fields**: Under products, fields like `createdAt` must be immutable after creation.
7. **Size Limits**: Strings like names, descriptions, or URLs must be strictly bounded in size to prevent "Denial of Wallet" resource-exhaustion attacks.

---

## The "Dirty Dozen" Malicious Payloads

These 12 scenarios represent attempts to bypass security rules. All of them must return `PERMISSION_DENIED`:

### Collection: `/products`

1. **Anonymous Write**: An unauthenticated user attempts to create a product.
2. **Non-Admin Write**: An authenticated user with email `common@gmail.com` attempts to create a product.
3. **Spoofed Admin Email (Unverified)**: A user logging in claiming email `"robymetalero@gmail.com"` but with `email_verified == false` attempts to create a product.
4. **Self-Assigned Admin Document**: A malicious user tries to create an admin status document at `admins/{myUid}`.
5. **Product ID Poisoning**: An admin attempts to inject a huge string of 5,000 characters as a product ID.
6. **Huge Product Payload**: An admin tries to save a 5MB product description to exhaust storage.
7. **Client-Spoofed Creation Time**: An admin tries to set a `createdAt` value in the past or future instead of `request.time`.
8. **Immutable Field Modification**: An admin tries to change the `createdAt` timestamp of an existing product.
9. **Invalid Type Assignment**: An admin tries to submit a boolean where the retail price number was expected.
10. **Ghost Fields (Shadow Update)**: An admin tries to update a product with an unapproved/extra field `isFeaturedPremium: true` that is not part of the schema.

### Collection: `/storeConfig`

11. **Malicious Store Config Edit**: A normal visitor attempts to change the store's contact phone number or WhatsApp URL.
12. **Store Info Field Poisoning**: A user attempts to save a custom field `analyticsPayload: "malicious-code"` inside the store configuration.

---

## The Test Runner Outline (`firestore.rules.test.ts`)

A mock/conceptual test runner verifying these constraints can be written as follows:

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Catálogo Virtual Security Rules', () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'gen-lang-client-0745085299',
      firestore: {
        rules: require('fs').readFileSync('firestore.rules', 'utf8')
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('blocks anonymous product writes (Dirty Payload #1)', async () => {
    const context = testEnv.unauthenticatedContext();
    const db = context.firestore();
    const docRef = db.collection('products').doc('prod123');
    await assertFails(docRef.set({ name: 'Zapatos', sku: 'ZAP-01' }));
  });

  it('blocks non-admin product writes (Dirty Payload #2)', async () => {
    const context = testEnv.authenticatedContext('user_123', { email: 'common@gmail.com' });
    const db = context.firestore();
    const docRef = db.collection('products').doc('prod123');
    await assertFails(docRef.set({ name: 'Zapatos', sku: 'ZAP-01' }));
  });

  it('blocks spoofed unverified admin emails (Dirty Payload #3)', async () => {
    const context = testEnv.authenticatedContext('user_123', { email: 'robymetalero@gmail.com', email_verified: false });
    const db = context.firestore();
    await assertFails(db.collection('products').doc('prod123').set({ name: 'Zapatos', sku: 'ZAP-01' }));
  });

  it('allows verified admin product writes', async () => {
    const context = testEnv.authenticatedContext('admin_123', { email: 'robymetalero@gmail.com', email_verified: true });
    const db = context.firestore();
    await assertSucceeds(db.collection('products').doc('prod123').set({
      sku: 'ZAP-01',
      name: 'Zapatos Premium',
      description: 'Zapatos de cuero de alta calidad',
      category: 'Calzado',
      retailPrice: 50,
      wholesalePrice: 40,
      images: ['https://example.com/zapato.png'],
      videoUrl: '',
      isAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });
});
```
