import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from '../config.js';

// Initialize Firebase Admin
try {
  initializeApp(); // Utiliza automáticamente process.env.GOOGLE_APPLICATION_CREDENTIALS
  console.log('Firebase Admin initialized successfully using Application Default Credentials.');
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  console.log('Check your service-account.json and the GOOGLE_APPLICATION_CREDENTIALS path.');
}

export const db = getFirestore();

export const repository = {
  addMessage: async (userId: number, role: 'user' | 'assistant' | 'system' | 'tool', content: string) => {
    const docRef = db.collection('users').doc(userId.toString()).collection('messages').doc();
    await docRef.set({
      role,
      content,
      timestamp: new Date()
    });
  },

  getMessages: async (userId: number, limit: number = 20) => {
    const snapshot = await db.collection('users').doc(userId.toString()).collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    const messages = snapshot.docs.map(doc => {
      const data = doc.data();
      return { role: data.role, content: data.content };
    });
    
    return messages.reverse();
  },

  clearHistory: async (userId: number) => {
    const snapshot = await db.collection('users').doc(userId.toString()).collection('messages').get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  },

  setMemory: async (key: string, value: string) => {
    await db.collection('memory').doc(key).set({
      value,
      updatedAt: new Date()
    }, { merge: true });
  },

  getMemory: async (key: string) => {
    const doc = await db.collection('memory').doc(key).get();
    if (doc.exists) {
      return doc.data()?.value;
    }
    return undefined;
  }
};
