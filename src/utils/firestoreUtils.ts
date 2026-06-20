// Firestore rejects literal `undefined` field values in setDoc/addDoc (unlike `null`,
// which is allowed). Strip them recursively before writing, while preserving Firebase
// FieldValue sentinels (serverTimestamp, increment, etc.) and Date objects untouched.
export function removeUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
      return obj;
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}
