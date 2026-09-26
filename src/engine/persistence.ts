import { LongFormProject, MediaAsset, VoiceoverTrack } from '../types/project';
import { DEFAULT_BOLLYWOOD_FRAME } from './schema';

const DB_NAME = 'longformai_db';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const MEDIA_BLOBS_STORE = 'media_blobs';
const CURRENT_PROJECT_KEY = 'current_project';

// In-memory fallback for environments without native IndexedDB (e.g. Node tests)
interface StoredProjectRecord {
  id: string;
  project: LongFormProject;
  revision: number;
  savedAt: number;
}

interface StoredBlobRecord {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  blob: Blob;
  updatedAt: number;
}

const inMemoryProjectStore = new Map<string, StoredProjectRecord>();
const inMemoryBlobStore = new Map<string, StoredBlobRecord>();

/**
 * Checks if IndexedDB is supported in the current environment
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Opens and initializes the IndexedDB database
 */
export function openDB(): Promise<IDBDatabase | null> {
  if (!isIndexedDBAvailable()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(MEDIA_BLOBS_STORE)) {
          db.createObjectStore(MEDIA_BLOBS_STORE, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn('IndexedDB open error:', request.error);
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB open exception:', e);
      resolve(null);
    }
  });
}

/**
 * Strips non-serializable properties (e.g. in-memory File instances and temporary blob: URLs)
 * while preserving all project metadata, transcripts, timings, framing, and annotations.
 */
export function sanitizeProjectForStorage(project: LongFormProject): LongFormProject {
  return {
    ...project,
    frame: project.frame ? {
      enabled: typeof project.frame.enabled === 'boolean' ? project.frame.enabled : true,
      id: project.frame.id || DEFAULT_BOLLYWOOD_FRAME.id,
      name: project.frame.name || DEFAULT_BOLLYWOOD_FRAME.name,
      src: project.frame.src || DEFAULT_BOLLYWOOD_FRAME.src,
    } : { ...DEFAULT_BOLLYWOOD_FRAME },
    media: project.media.map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { file, url, ...rest } = m;
      return {
        ...rest,
        url: '', // Object URL will be regenerated from persisted blob upon hydration
      };
    }),
    voiceover: project.voiceover
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { file, url, ...restVo } = project.voiceover;
          return {
            ...restVo,
            url: '',
          };
        })()
      : undefined,
  };
}

/**
 * Persists project state locally to IndexedDB
 */
export async function saveProjectLocal(
  project: LongFormProject,
  revision: number = Date.now()
): Promise<void> {
  const sanitized = sanitizeProjectForStorage(project);
  const record: StoredProjectRecord = {
    id: CURRENT_PROJECT_KEY,
    project: sanitized,
    revision,
    savedAt: Date.now(),
  };

  const db = await openDB();
  if (!db) {
    inMemoryProjectStore.set(CURRENT_PROJECT_KEY, record);
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([PROJECT_STORE], 'readwrite');
      const store = transaction.objectStore(PROJECT_STORE);
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (e) {
      inMemoryProjectStore.set(CURRENT_PROJECT_KEY, record);
      resolve();
    }
  });
}

/**
 * Loads the saved project from local IndexedDB
 */
export async function loadProjectLocal(): Promise<StoredProjectRecord | null> {
  const db = await openDB();
  if (!db) {
    return inMemoryProjectStore.get(CURRENT_PROJECT_KEY) || null;
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([PROJECT_STORE], 'readonly');
      const store = transaction.objectStore(PROJECT_STORE);
      const request = store.get(CURRENT_PROJECT_KEY);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result as StoredProjectRecord);
        } else {
          resolve(inMemoryProjectStore.get(CURRENT_PROJECT_KEY) || null);
        }
      };

      request.onerror = () => {
        resolve(inMemoryProjectStore.get(CURRENT_PROJECT_KEY) || null);
      };
    } catch {
      resolve(inMemoryProjectStore.get(CURRENT_PROJECT_KEY) || null);
    }
  });
}

/**
 * Persists a media binary blob / file to IndexedDB
 */
export async function saveMediaBlob(
  id: string,
  fileOrBlob: File | Blob,
  name: string,
  type: string
): Promise<void> {
  const mimeType = fileOrBlob.type || (type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/wav' : 'image/jpeg');
  const record: StoredBlobRecord = {
    id,
    name,
    type,
    mimeType,
    blob: fileOrBlob,
    updatedAt: Date.now(),
  };

  const db = await openDB();
  if (!db) {
    inMemoryBlobStore.set(id, record);
    return;
  }

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([MEDIA_BLOBS_STORE], 'readwrite');
      const store = transaction.objectStore(MEDIA_BLOBS_STORE);
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (e) {
      inMemoryBlobStore.set(id, record);
      resolve();
    }
  });
}

/**
 * Retrieves a media binary blob from IndexedDB
 */
export async function getMediaBlob(id: string): Promise<StoredBlobRecord | null> {
  const db = await openDB();
  if (!db) {
    return inMemoryBlobStore.get(id) || null;
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([MEDIA_BLOBS_STORE], 'readonly');
      const store = transaction.objectStore(MEDIA_BLOBS_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result as StoredBlobRecord);
        } else {
          resolve(inMemoryBlobStore.get(id) || null);
        }
      };

      request.onerror = () => {
        resolve(inMemoryBlobStore.get(id) || null);
      };
    } catch {
      resolve(inMemoryBlobStore.get(id) || null);
    }
  });
}

/**
 * Deletes a media blob from IndexedDB
 */
export async function deleteMediaBlob(id: string): Promise<void> {
  inMemoryBlobStore.delete(id);
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([MEDIA_BLOBS_STORE], 'readwrite');
      const store = transaction.objectStore(MEDIA_BLOBS_STORE);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Deletes multiple media blobs from IndexedDB
 */
export async function deleteMediaBlobs(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteMediaBlob(id);
  }
}

/**
 * Clears the local saved project and all media blobs from IndexedDB
 */
export async function clearLocalProject(): Promise<void> {
  inMemoryProjectStore.clear();
  inMemoryBlobStore.clear();

  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([PROJECT_STORE, MEDIA_BLOBS_STORE], 'readwrite');
      transaction.objectStore(PROJECT_STORE).clear();
      transaction.objectStore(MEDIA_BLOBS_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Re-hydrates a loaded project with fresh object URLs and File instances
 * from the stored IndexedDB media blobs.
 */
export async function hydrateProjectWithBlobs(storedProject: LongFormProject): Promise<LongFormProject> {
  const hydratedMedia: MediaAsset[] = await Promise.all(
    storedProject.media.map(async (m) => {
      const blobRecord = await getMediaBlob(m.id);
      if (blobRecord && blobRecord.blob) {
        const file = new File([blobRecord.blob], m.name, {
          type: blobRecord.mimeType || blobRecord.blob.type,
          lastModified: m.createdAt || Date.now(),
        });
        const url = URL.createObjectURL(file);
        return {
          ...m,
          file,
          url,
        };
      }
      return {
        ...m,
        url: '', // Unlinked, requires relink
      };
    })
  );

  let hydratedVoiceover: VoiceoverTrack | undefined = storedProject.voiceover;
  if (storedProject.voiceover) {
    const voBlobRecord = await getMediaBlob(storedProject.voiceover.id);
    if (voBlobRecord && voBlobRecord.blob) {
      const file = new File([voBlobRecord.blob], storedProject.voiceover.name, {
        type: voBlobRecord.mimeType || voBlobRecord.blob.type,
        lastModified: storedProject.voiceover.createdAt || Date.now(),
      });
      const url = URL.createObjectURL(file);
      hydratedVoiceover = {
        ...storedProject.voiceover,
        file,
        url,
      };
    } else {
      hydratedVoiceover = {
        ...storedProject.voiceover,
        url: '',
      };
    }
  }

  return {
    ...storedProject,
    frame: storedProject.frame ? {
      enabled: typeof storedProject.frame.enabled === 'boolean' ? storedProject.frame.enabled : true,
      id: storedProject.frame.id || DEFAULT_BOLLYWOOD_FRAME.id,
      name: storedProject.frame.name || DEFAULT_BOLLYWOOD_FRAME.name,
      src: storedProject.frame.src || DEFAULT_BOLLYWOOD_FRAME.src,
    } : { ...DEFAULT_BOLLYWOOD_FRAME },
    media: hydratedMedia,
    voiceover: hydratedVoiceover,
  };
}
