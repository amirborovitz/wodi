import { createHash } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Adapter, AdapterPayload, AdapterFactory } from 'oidc-provider';

/** Every collection is server-only under the existing default-deny client rules. */
export function firestoreOAuthAdapter(db: Firestore): AdapterFactory {
  const collection = db.collection('wodiOAuthStore');
  return (model: string): Adapter => {
    const ref = (id: string) => collection.doc(createHash('sha256').update(`${model}:${id}`).digest('hex'));
    const payloadOf = (data: FirebaseFirestore.DocumentData | undefined): AdapterPayload | undefined => {
      if (!data || (data.expiresAt && data.expiresAt.toMillis() <= Date.now())) return undefined;
      return data.payload as AdapterPayload;
    };
    const findField = async (field: string, value: string): Promise<AdapterPayload | undefined> => {
      const docs = await collection.where(field, '==', value).get();
      return docs.docs.filter(doc => doc.get('model') === model).map(doc => payloadOf(doc.data())).find(Boolean);
    };
    return {
      async upsert(id, payload, expiresIn): Promise<void> {
        await ref(id).set({ model, payload: JSON.parse(JSON.stringify(payload)),
          grantId: payload.grantId ?? null, uid: payload.uid ?? null, userCode: payload.userCode ?? null,
          expiresAt: expiresIn ? Timestamp.fromMillis(Date.now() + expiresIn * 1000) : null });
      },
      async find(id): Promise<AdapterPayload | undefined> { return payloadOf((await ref(id).get()).data()); },
      async findByUid(uid): Promise<AdapterPayload | undefined> { return findField('uid', uid); },
      async findByUserCode(code): Promise<AdapterPayload | undefined> { return findField('userCode', code); },
      async consume(id): Promise<void> { await ref(id).update({ 'payload.consumed': Math.floor(Date.now() / 1000) }); },
      async destroy(id): Promise<void> { await ref(id).delete(); },
      async revokeByGrantId(grantId): Promise<void> {
        const docs = await collection.where('grantId', '==', grantId).get();
        for (let offset = 0; offset < docs.size; offset += 400) {
          const batch = db.batch(); docs.docs.slice(offset, offset + 400).forEach(doc => batch.delete(doc.ref)); await batch.commit();
        }
      },
    };
  };
}
