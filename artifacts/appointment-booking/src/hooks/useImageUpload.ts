import { useState, useCallback } from "react";

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

interface UseImageUploadReturn {
  isUploading: boolean;
  url: string | null;
  error: string | null;
  // Batch progress — populated during uploadMany. done/total both 0 when idle.
  progress: { done: number; total: number };
  upload: (file: File) => Promise<void>;
  uploadMany: (files: File[]) => Promise<string[]>;
  reset: () => void;
}

async function uploadOne(file: File): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("הגדרות Cloudinary חסרות — פנה למנהל המערכת");
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("ההעלאה נכשלה");
  const data = await res.json();
  if (!data.secure_url) throw new Error("לא התקבלה כתובת תמונה");
  return data.secure_url as string;
}

export function useImageUpload(): UseImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const upload = useCallback(async (file: File): Promise<void> => {
    setIsUploading(true);
    setError(null);
    try {
      const secure = await uploadOne(file);
      setUrl(secure);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ההעלאה נכשלה";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  }, []);

  // Batch helper — uploads in parallel, updating `progress` as each one
  // resolves. Returns the array of URLs that succeeded (failed uploads
  // are skipped and the error message is stashed on `error`). Does NOT
  // touch `url` so the single-upload useEffect watchers in consumers
  // don't accidentally double-append the last URL.
  const uploadMany = useCallback(async (files: File[]): Promise<string[]> => {
    if (files.length === 0) return [];
    setIsUploading(true);
    setError(null);
    setProgress({ done: 0, total: files.length });
    let firstErr: string | null = null;
    const results = await Promise.all(files.map(async f => {
      try {
        const u = await uploadOne(f);
        setProgress(p => ({ ...p, done: p.done + 1 }));
        return u;
      } catch (err) {
        if (!firstErr) firstErr = err instanceof Error ? err.message : "ההעלאה נכשלה";
        setProgress(p => ({ ...p, done: p.done + 1 }));
        return null;
      }
    }));
    if (firstErr) setError(firstErr);
    setIsUploading(false);
    setProgress({ done: 0, total: 0 });
    return results.filter((u): u is string => !!u);
  }, []);

  const reset = useCallback(() => {
    setUrl(null);
    setError(null);
    setIsUploading(false);
    setProgress({ done: 0, total: 0 });
  }, []);

  return { isUploading, url, error, progress, upload, uploadMany, reset };
}
