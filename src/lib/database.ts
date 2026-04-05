import { initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
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

export interface UserAgentSettings {
  backend?: 'codex' | 'router' | 'ollama';
  codexCwd?: string;
  codexSessionId?: string;
}

export interface ContextAgentSettings {
  backend?: 'codex' | 'router' | 'ollama';
  codexCwd?: string;
  codexSessionId?: string;
  lastPrompt?: string;
  codexModel?: string;
  codexReasoningEffort?: 'low' | 'medium' | 'high';
  launchProfile?: string;
}

export interface ContextMetadata {
  ownerUserId: number;
  chatId: number;
  threadId?: number;
  label: string;
  isPinned?: boolean;
  pinName?: string;
  aliasName?: string;
}

export interface StoredContextSummary {
  key: string;
  metadata: ContextMetadata;
  settings: ContextAgentSettings;
  updatedAt?: Date;
}

export interface StoredTurnArtifact {
  relativePath: string;
  absolutePath: string;
  kind: 'created' | 'modified';
  size: number;
}

export interface StoredTurnSummary {
  id: string;
  kind: 'message' | 'review';
  prompt: string;
  responsePreview: string;
  artifactCount: number;
  artifacts: StoredTurnArtifact[];
  createdAt?: Date;
}

export interface ExportedContextMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: string;
}

export interface ExportedContextTurn {
  kind: 'message' | 'review';
  prompt: string;
  responsePreview: string;
  artifactCount: number;
  artifacts: StoredTurnArtifact[];
  createdAt?: string;
}

export interface ExportedContextSnapshot {
  version: 1;
  exportedAt: string;
  sourceContextKey: string;
  metadata: Partial<ContextMetadata>;
  settings: ContextAgentSettings;
  messages: ExportedContextMessage[];
  turns: ExportedContextTurn[];
}

export interface StoredContextSnapshotSummary {
  id: string;
  name: string;
  sourceContextKey: string;
  createdAt?: Date;
  snapshot: ExportedContextSnapshot;
}

export interface ExportedTurnSnapshot {
  version: 1;
  exportedAt: string;
  sourceContextKey: string;
  turn: ExportedContextTurn;
}

export interface StoredTurnSnapshotSummary {
  id: string;
  name: string;
  sourceContextKey: string;
  createdAt?: Date;
  snapshot: ExportedTurnSnapshot;
}

const compactObject = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>;

export const repository = {
  getUserDoc: (userId: number) => db.collection('users').doc(userId.toString()),
  getContextDoc: (contextKey: string) => db.collection('telegram_contexts').doc(contextKey),

  addMessage: async (userId: number, role: 'user' | 'assistant' | 'system' | 'tool', content: string) => {
    const docRef = repository.getUserDoc(userId).collection('messages').doc();
    await docRef.set({
      role,
      content,
      timestamp: new Date()
    });
  },

  getMessages: async (userId: number, limit: number = 20) => {
    const snapshot = await repository.getUserDoc(userId).collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    const messages = snapshot.docs.map(doc => {
      const data = doc.data();
      return { role: data.role, content: data.content };
    });
    
    return messages.reverse();
  },

  addContextMessage: async (
    contextKey: string,
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: string,
  ) => {
    const docRef = repository.getContextDoc(contextKey).collection('messages').doc();
    await docRef.set({
      role,
      content,
      timestamp: new Date(),
    });
  },

  getContextMessages: async (contextKey: string, limit: number = 20) => {
    const snapshot = await repository.getContextDoc(contextKey).collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    const messages = snapshot.docs.map(doc => {
      const data = doc.data();
      return { role: data.role, content: data.content };
    });

    return messages.reverse();
  },

  clearContextHistory: async (contextKey: string) => {
    const snapshot = await repository.getContextDoc(contextKey).collection('messages').get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  },

  clearContextTurns: async (contextKey: string) => {
    const snapshot = await repository.getContextDoc(contextKey).collection('turns').get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  },

  clearHistory: async (userId: number) => {
    const snapshot = await repository.getUserDoc(userId).collection('messages').get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  },

  getUserAgentSettings: async (userId: number): Promise<UserAgentSettings> => {
    const userDoc = await repository.getUserDoc(userId).get();
    if (!userDoc.exists) {
      return {};
    }

    const data = userDoc.data() || {};
    const settings = data.agentSettings || {};

    return {
      backend: settings.backend,
      codexCwd: settings.codexCwd,
      codexSessionId: settings.codexSessionId,
    };
  },

  updateUserAgentSettings: async (userId: number, settings: UserAgentSettings) => {
    const sanitizedSettings = compactObject(settings);
    await repository.getUserDoc(userId).set({
      agentSettings: sanitizedSettings,
      updatedAt: new Date(),
    }, { merge: true });
  },

  getContextAgentSettings: async (contextKey: string): Promise<ContextAgentSettings> => {
    const contextDoc = await repository.getContextDoc(contextKey).get();
    if (!contextDoc.exists) {
      return {};
    }

    const data = contextDoc.data() || {};
    const settings = data.agentSettings || {};

    return {
      backend: settings.backend,
      codexCwd: settings.codexCwd,
      codexSessionId: settings.codexSessionId,
      lastPrompt: settings.lastPrompt,
      codexModel: settings.codexModel,
      codexReasoningEffort: settings.codexReasoningEffort,
      launchProfile: settings.launchProfile,
    };
  },

  updateContextAgentSettings: async (contextKey: string, settings: ContextAgentSettings) => {
    const sanitizedSettings = compactObject(settings);
    await repository.getContextDoc(contextKey).set({
      agentSettings: sanitizedSettings,
      updatedAt: new Date(),
    }, { merge: true });
  },

  touchContext: async (contextKey: string, metadata: ContextMetadata) => {
    const sanitizedMetadata = compactObject(metadata) as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    for (const [key, value] of Object.entries(sanitizedMetadata)) {
      payload[`metadata.${key}`] = value;
    }

    if (metadata.pinName === undefined) {
      payload['metadata.pinName'] = FieldValue.delete();
    }
    if (metadata.aliasName === undefined) {
      payload['metadata.aliasName'] = FieldValue.delete();
    }

    await repository.getContextDoc(contextKey).set(payload, { merge: true });
  },

  listContextsForUser: async (ownerUserId: number, limit: number = 12): Promise<StoredContextSummary[]> => {
    const snapshot = await db.collection('telegram_contexts')
      .where('metadata.ownerUserId', '==', ownerUserId)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      const metadata = (data.metadata || {}) as ContextMetadata;
      const settings = (data.agentSettings || {}) as ContextAgentSettings;
      const updatedAt = data.updatedAt?.toDate?.();

      return {
        key: doc.id,
        metadata,
        settings,
        updatedAt,
      };
    });
  },

  listPinnedContextsForUser: async (ownerUserId: number, limit: number = 12): Promise<StoredContextSummary[]> => {
    const snapshot = await db.collection('telegram_contexts')
      .where('metadata.ownerUserId', '==', ownerUserId)
      .where('metadata.isPinned', '==', true)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      const metadata = (data.metadata || {}) as ContextMetadata;
      const settings = (data.agentSettings || {}) as ContextAgentSettings;
      const updatedAt = data.updatedAt?.toDate?.();

      return {
        key: doc.id,
        metadata,
        settings,
        updatedAt,
      };
    });
  },

  findContextByAlias: async (ownerUserId: number, aliasName: string): Promise<StoredContextSummary | undefined> => {
    const snapshot = await db.collection('telegram_contexts')
      .where('metadata.ownerUserId', '==', ownerUserId)
      .where('metadata.aliasName', '==', aliasName)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];
    if (!doc) {
      return undefined;
    }

    const data = doc.data() || {};
    const metadata = (data.metadata || {}) as ContextMetadata;
    const settings = (data.agentSettings || {}) as ContextAgentSettings;
    const updatedAt = data.updatedAt?.toDate?.();

    return {
      key: doc.id,
      metadata,
      settings,
      updatedAt,
    };
  },

  addContextTurn: async (
    contextKey: string,
    turn: {
      kind: 'message' | 'review';
      prompt: string;
      responsePreview: string;
      artifacts: StoredTurnArtifact[];
    },
  ) => {
    const docRef = repository.getContextDoc(contextKey).collection('turns').doc();
    await docRef.set({
      ...turn,
      artifactCount: turn.artifacts.length,
      createdAt: new Date(),
    });
  },

  listContextTurns: async (contextKey: string, limit: number = 8): Promise<StoredTurnSummary[]> => {
    const snapshot = await repository.getContextDoc(contextKey).collection('turns')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        kind: data.kind || 'message',
        prompt: data.prompt || '',
        responsePreview: data.responsePreview || '',
        artifactCount: data.artifactCount || 0,
        artifacts: (data.artifacts || []) as StoredTurnArtifact[],
        createdAt: data.createdAt?.toDate?.(),
      };
    });
  },

  deleteContextTurn: async (contextKey: string, turnId: string) => {
    await repository.getContextDoc(contextKey).collection('turns').doc(turnId).delete();
  },

  exportTurnSnapshot: async (contextKey: string, turnId: string): Promise<ExportedTurnSnapshot | undefined> => {
    const doc = await repository.getContextDoc(contextKey).collection('turns').doc(turnId).get();
    if (!doc.exists) {
      return undefined;
    }

    const turn = doc.data() || {};
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceContextKey: contextKey,
      turn: {
        kind: turn.kind || 'message',
        prompt: turn.prompt || '',
        responsePreview: turn.responsePreview || '',
        artifactCount: turn.artifactCount || 0,
        artifacts: (turn.artifacts || []) as StoredTurnArtifact[],
        createdAt: turn.createdAt?.toDate?.()?.toISOString?.(),
      },
    };
  },

  exportContextSnapshot: async (contextKey: string): Promise<ExportedContextSnapshot> => {
    const contextDoc = await repository.getContextDoc(contextKey).get();
    const data = contextDoc.data() || {};
    const metadata = (data.metadata || {}) as Partial<ContextMetadata>;
    const settings = (data.agentSettings || {}) as ContextAgentSettings;

    const messagesSnapshot = await repository.getContextDoc(contextKey).collection('messages')
      .orderBy('timestamp', 'asc')
      .get();
    const turnsSnapshot = await repository.getContextDoc(contextKey).collection('turns')
      .orderBy('createdAt', 'asc')
      .get();

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceContextKey: contextKey,
      metadata,
      settings,
      messages: messagesSnapshot.docs.map((doc) => {
        const message = doc.data() || {};
        return {
          role: message.role,
          content: message.content,
          timestamp: message.timestamp?.toDate?.()?.toISOString?.(),
        };
      }),
      turns: turnsSnapshot.docs.map((doc) => {
        const turn = doc.data() || {};
        return {
          kind: turn.kind || 'message',
          prompt: turn.prompt || '',
          responsePreview: turn.responsePreview || '',
          artifactCount: turn.artifactCount || 0,
          artifacts: (turn.artifacts || []) as StoredTurnArtifact[],
          createdAt: turn.createdAt?.toDate?.()?.toISOString?.(),
        };
      }),
    };
  },

  importContextSnapshot: async (
    contextKey: string,
    snapshot: ExportedContextSnapshot,
  ) => {
    await repository.clearContextHistory(contextKey);
    await repository.clearContextTurns(contextKey);
    await repository.updateContextAgentSettings(contextKey, snapshot.settings || {});

    for (const message of snapshot.messages || []) {
      const docRef = repository.getContextDoc(contextKey).collection('messages').doc();
      await docRef.set({
        role: message.role,
        content: message.content,
        timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
      });
    }

    for (const turn of snapshot.turns || []) {
      const docRef = repository.getContextDoc(contextKey).collection('turns').doc();
      await docRef.set({
        kind: turn.kind,
        prompt: turn.prompt,
        responsePreview: turn.responsePreview,
        artifactCount: turn.artifactCount || turn.artifacts?.length || 0,
        artifacts: turn.artifacts || [],
        createdAt: turn.createdAt ? new Date(turn.createdAt) : new Date(),
      });
    }
  },

  importTurnSnapshot: async (
    contextKey: string,
    snapshot: ExportedTurnSnapshot,
  ) => {
    const turn = snapshot.turn;
    const docRef = repository.getContextDoc(contextKey).collection('turns').doc();
    await docRef.set({
      kind: turn.kind || 'message',
      prompt: turn.prompt || '',
      responsePreview: turn.responsePreview || '',
      artifactCount: turn.artifactCount || turn.artifacts?.length || 0,
      artifacts: turn.artifacts || [],
      createdAt: turn.createdAt ? new Date(turn.createdAt) : new Date(),
    });

    return docRef.id;
  },

  saveNamedContextSnapshot: async (
    ownerUserId: number,
    name: string,
    snapshot: ExportedContextSnapshot,
  ) => {
    const sanitizedName = name.trim();
    await db.collection('context_snapshots').add({
      ownerUserId,
      name: sanitizedName,
      sourceContextKey: snapshot.sourceContextKey,
      snapshot,
      createdAt: new Date(),
    });
  },

  listNamedContextSnapshots: async (ownerUserId: number, limit: number = 12): Promise<StoredContextSnapshotSummary[]> => {
    const snapshot = await db.collection('context_snapshots')
      .where('ownerUserId', '==', ownerUserId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: data.name || doc.id,
        sourceContextKey: data.sourceContextKey || '',
        createdAt: data.createdAt?.toDate?.(),
        snapshot: data.snapshot as ExportedContextSnapshot,
      };
    });
  },

  deleteNamedContextSnapshot: async (snapshotId: string) => {
    await db.collection('context_snapshots').doc(snapshotId).delete();
  },

  saveNamedTurnSnapshot: async (
    ownerUserId: number,
    name: string,
    snapshot: ExportedTurnSnapshot,
  ) => {
    await db.collection('turn_snapshots').add({
      ownerUserId,
      name: name.trim(),
      sourceContextKey: snapshot.sourceContextKey,
      snapshot,
      createdAt: new Date(),
    });
  },

  listNamedTurnSnapshots: async (ownerUserId: number, limit: number = 12): Promise<StoredTurnSnapshotSummary[]> => {
    const snapshot = await db.collection('turn_snapshots')
      .where('ownerUserId', '==', ownerUserId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: data.name || doc.id,
        sourceContextKey: data.sourceContextKey || '',
        createdAt: data.createdAt?.toDate?.(),
        snapshot: data.snapshot as ExportedTurnSnapshot,
      };
    });
  },

  deleteNamedTurnSnapshot: async (snapshotId: string) => {
    await db.collection('turn_snapshots').doc(snapshotId).delete();
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
